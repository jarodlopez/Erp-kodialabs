import 'server-only';

/**
 * Servicio de compras.
 *
 * Al RECIBIR una compra, dentro de una única transacción:
 *   1. se valida el documento y sus permisos;
 *   2. se incrementa el inventario de cada línea;
 *   3. se registra el movimiento correspondiente;
 *   4. se recalcula el costo promedio ponderado con el costo "landed"
 *      (costo negociado + flete y otros costos prorrateados);
 *   5. se crea la cuenta por pagar si la compra es a crédito;
 *   6. se registra el pago si se paga en el acto;
 *   7. se deja auditoría.
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { toMinorUnits, toScaledQty } from '@/lib/money';
import { landedUnitCost, priceDocument } from '@/lib/pricing';
import { nowIso, parseDate } from '@/lib/repositories/base';
import { newDoc, refs } from '@/lib/repositories/refs';
import {
  ACTIVE_PURCHASE_STATUSES,
  assertPurchaseTransition,
  derivePaymentStatus,
  derivePurchaseStatus,
} from '@/lib/state-machines';
import { auditInTransaction } from './audit';
import {
  applyToPayable,
  bumpPartyStats,
  postLedgerEntry,
  writePayable,
  writePayment,
} from './finance';
import { writeStockMovement } from './inventory';
import { guardIdempotency, reserveNumber, runTransaction } from './transaction';
import type { ActorContext, Id } from '@/types/common';
import type { Product } from '@/types/catalog';
import type { Supplier } from '@/types/parties';
import type { AccountPayable, FinancialAccount, PaymentMethod } from '@/types/finance';
import type { Settings } from '@/types/organization';
import type { CreatePurchaseInput, Purchase, PurchaseItem } from '@/types/purchases';

export interface PurchaseServiceContext {
  actor: ActorContext;
  actorName: string;
  settings: Settings;
  defaultWarehouseId: Id;
}

export interface CreatePurchaseResult {
  purchaseId: Id;
  number: string;
  status: Purchase['status'];
  total: number;
}

export const purchaseService = {
  /**
   * Crea una compra. Con `receive: true` ejecuta además la recepción completa
   * (inventario, costo promedio, CxP y pago) de forma atómica.
   */
  async createPurchase(
    ctx: PurchaseServiceContext,
    input: CreatePurchaseInput,
    options: { receive: boolean; idempotencyKey?: string | null },
  ): Promise<CreatePurchaseResult> {
    const warehouseId = input.warehouseId ?? ctx.defaultWarehouseId;
    const date = parseDate(input.date);

    return runTransaction(async (tx) => {
      // ------------------------------- LECTURAS -------------------------------
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        options.idempotencyKey,
        'purchase.create',
      );
      if (guard.existing) return guard.existing as unknown as CreatePurchaseResult;

      if (input.items.length === 0) {
        throw errors.validation('La compra debe incluir al menos un producto.');
      }
      const seen = new Set<string>();
      for (const item of input.items) {
        if (seen.has(item.productId)) {
          throw errors.validation('Hay productos repetidos. Únelos en una sola línea.');
        }
        seen.add(item.productId);
      }

      const productSnaps = await Promise.all(
        input.items.map((item) => tx.get(refs.product(item.productId))),
      );
      const products = productSnaps.map((snap) => {
        if (!snap.exists) throw errors.notFound('Producto');
        const product = { ...(snap.data() as Product), id: snap.id };
        if (product.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
        return product;
      });

      const supplierSnap = await tx.get(refs.supplier(input.supplierId));
      if (!supplierSnap.exists) throw errors.notFound('Proveedor');
      const supplier = { ...(supplierSnap.data() as Supplier), id: supplierSnap.id };
      if (supplier.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();

      const wantsPayment = Boolean(input.payment && input.payment.amount > 0);
      let account: FinancialAccount | null = null;
      if (wantsPayment && options.receive) {
        const snap = await tx.get(refs.financialAccount(input.payment!.accountId));
        if (!snap.exists) throw errors.notFound('Cuenta financiera');
        account = { ...(snap.data() as FinancialAccount), id: snap.id };
        if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      }

      const purchaseNumber = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'purchase',
        ctx.settings.numbering.purchase,
      );
      const paymentNumber =
        wantsPayment && options.receive
          ? await reserveNumber(tx, ctx.actor.organizationId, 'payment', ctx.settings.numbering.payment)
          : null;

      // ------------------------------- CÁLCULO --------------------------------
      const shipping = toMinorUnits(input.shipping ?? 0);
      const otherCosts = toMinorUnits(input.otherCosts ?? 0);

      const priced = priceDocument(
        input.items.map((item, index) => ({
          quantity: toScaledQty(item.quantity),
          unitPrice: toMinorUnits(item.unitCost),
          discount: toMinorUnits(item.discount ?? 0),
          taxRate: products[index].taxRate ?? 0,
          unitCost: toMinorUnits(item.unitCost),
        })),
        {
          taxMode: ctx.settings.taxMode,
          globalDiscount: toMinorUnits(input.globalDiscount ?? 0),
          additionalCosts: shipping + otherCosts,
        },
      );

      const items: PurchaseItem[] = input.items.map((item, index) => {
        const p = priced.lines[index];
        const product = products[index];
        return {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          quantity: p.quantity,
          unitCost: p.unitPrice,
          discount: p.discount,
          taxRate: p.taxRate,
          taxAmount: p.taxAmount,
          subtotal: p.subtotal,
          total: p.total,
          landedUnitCost: landedUnitCost(p.totalCost, p.quantity),
          returnedQuantity: 0,
          warehouseId,
        };
      });

      const total = priced.totals.total + shipping + otherCosts;
      const paidAmount = wantsPayment && options.receive ? toMinorUnits(input.payment!.amount) : 0;
      if (paidAmount > total) {
        throw errors.validation('El pago no puede ser mayor que el total de la compra.');
      }
      if (input.type === 'CASH' && options.receive && paidAmount < total) {
        throw errors.validation(
          'Una compra de contado debe pagarse completa. Usa "crédito" para dejar saldo pendiente.',
        );
      }

      const dueDate = input.dueDate
        ? parseDate(input.dueDate)
        : new Date(
            new Date(date).getTime() +
              (supplier.creditDays ?? ctx.settings.defaultCreditDays) * 86400000,
          ).toISOString();

      const status: Purchase['status'] = options.receive
        ? derivePurchaseStatus(total, paidAmount, 'RECEIVED')
        : 'DRAFT';

      const purchaseRef = newDoc(COLLECTIONS.PURCHASES);
      const purchase: Purchase = {
        id: purchaseRef.id,
        organizationId: ctx.actor.organizationId,
        number: purchaseNumber.number,
        type: input.type,
        supplierId: supplier.id,
        supplierName: supplier.name,
        invoiceNumber: input.invoiceNumber ?? null,
        date,
        items,
        subtotal: priced.totals.subtotal,
        discount: priced.totals.discount,
        globalDiscount: priced.totals.globalDiscount,
        tax: priced.totals.tax,
        shipping,
        otherCosts,
        total,
        paidAmount,
        dueAmount: total - paidAmount,
        status,
        paymentStatus: options.receive ? derivePaymentStatus(total, paidAmount) : 'UNPAID',
        dueDate: input.type === 'CREDIT' ? dueDate : null,
        notes: input.notes ?? null,
        receivedAt: options.receive ? nowIso() : null,
        receivedBy: options.receive ? ctx.actor.userId : null,
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        returnedAmount: 0,
        warehouseId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      };

      // ------------------------------ ESCRITURAS ------------------------------
      purchaseNumber.commit();
      tx.create(purchaseRef, purchase);

      if (options.receive) {
        for (let i = 0; i < items.length; i += 1) {
          const product = products[i];
          if (!product.tracksInventory) continue;
          writeStockMovement(tx, {
            actor: ctx.actor,
            actorName: ctx.actorName,
            product,
            quantity: items[i].quantity,
            type: 'PURCHASE',
            unitCost: items[i].landedUnitCost,
            referenceType: 'PURCHASE',
            referenceId: purchaseRef.id,
            referenceNumber: purchase.number,
            warehouseId,
            recalculateAverageCost: true,
            updateLastCost: true,
          });
        }

        if (paidAmount > 0 && account && paymentNumber) {
          paymentNumber.commit();
          postLedgerEntry(tx, {
            actor: ctx.actor,
            actorName: ctx.actorName,
            account,
            currentBalance: account.currentBalance,
            amount: paidAmount,
            direction: 'OUT',
            type: 'PURCHASE_PAYMENT',
            referenceType: 'PURCHASE',
            referenceId: purchaseRef.id,
            referenceNumber: purchase.number,
            date,
            description: `Pago de la compra ${purchase.number} a ${supplier.name}`,
          });
          writePayment(tx, {
            actor: ctx.actor,
            number: paymentNumber.number,
            type: 'PURCHASE_PAYMENT',
            referenceType: 'PURCHASE',
            referenceId: purchaseRef.id,
            referenceNumber: purchase.number,
            partyId: supplier.id,
            partyName: supplier.name,
            account,
            amount: paidAmount,
            date,
            method: (input.payment!.method as PaymentMethod) ?? 'CASH',
            reference: input.payment!.reference ?? null,
          });
        }

        const pending = total - paidAmount;
        if (pending > 0) {
          writePayable(tx, {
            actor: ctx.actor,
            supplierId: supplier.id,
            supplierName: supplier.name,
            referenceType: 'PURCHASE',
            referenceId: purchaseRef.id,
            referenceNumber: purchase.number,
            amount: total,
            paidAmount,
            issueDate: date,
            dueDate,
          });
        }

        bumpPartyStats(tx, ctx.actor, 'supplier', supplier.id, supplier.stats, {
          totalAmount: total,
          documentCount: 1,
          outstandingBalance: pending,
          lastDocumentAt: date,
        });
      }

      auditInTransaction(tx, ctx.actor, {
        action: options.receive ? 'RECEIVE' : 'CREATE',
        module: 'PURCHASES',
        entityType: 'purchase',
        entityId: purchaseRef.id,
        entityLabel: purchase.number,
        after: { number: purchase.number, total, status, supplier: supplier.name },
        metadata: { items: items.length, paidAmount },
      });

      const result: CreatePurchaseResult = {
        purchaseId: purchaseRef.id,
        number: purchase.number,
        status,
        total,
      };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /** Recibe un borrador de compra: inventario + costo promedio + CxP. */
  async receivePurchase(
    ctx: PurchaseServiceContext,
    purchaseId: Id,
    payment: CreatePurchaseInput['payment'],
    idempotencyKey?: string | null,
  ): Promise<CreatePurchaseResult> {
    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'purchase.receive',
      );
      if (guard.existing) return guard.existing as unknown as CreatePurchaseResult;

      const snap = await tx.get(refs.purchase(purchaseId));
      if (!snap.exists) throw errors.notFound('Compra');
      const purchase = { ...(snap.data() as Purchase), id: snap.id };
      if (purchase.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();

      assertPurchaseTransition(purchase.status, 'RECEIVED');

      const productSnaps = await Promise.all(
        purchase.items.map((item) => tx.get(refs.product(item.productId))),
      );

      const supplierSnap = await tx.get(refs.supplier(purchase.supplierId));
      if (!supplierSnap.exists) throw errors.notFound('Proveedor');
      const supplier = { ...(supplierSnap.data() as Supplier), id: supplierSnap.id };

      const wantsPayment = Boolean(payment && payment.amount > 0);
      let account: FinancialAccount | null = null;
      if (wantsPayment) {
        const accSnap = await tx.get(refs.financialAccount(payment!.accountId));
        if (!accSnap.exists) throw errors.notFound('Cuenta financiera');
        account = { ...(accSnap.data() as FinancialAccount), id: accSnap.id };
        if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      }

      const paymentNumber = wantsPayment
        ? await reserveNumber(tx, ctx.actor.organizationId, 'payment', ctx.settings.numbering.payment)
        : null;

      const paidAmount = wantsPayment ? toMinorUnits(payment!.amount) : 0;
      if (paidAmount > purchase.total) {
        throw errors.validation('El pago no puede ser mayor que el total de la compra.');
      }

      const status = derivePurchaseStatus(purchase.total, paidAmount, 'RECEIVED');
      const dueDate =
        purchase.dueDate ??
        new Date(
          new Date(purchase.date).getTime() +
            (supplier.creditDays ?? ctx.settings.defaultCreditDays) * 86400000,
        ).toISOString();

      // ------------------------------ ESCRITURAS ------------------------------
      for (let i = 0; i < purchase.items.length; i += 1) {
        const productSnap = productSnaps[i];
        if (!productSnap.exists) throw errors.notFound('Producto');
        const product = { ...(productSnap.data() as Product), id: productSnap.id };
        if (!product.tracksInventory) continue;
        writeStockMovement(tx, {
          actor: ctx.actor,
          actorName: ctx.actorName,
          product,
          quantity: purchase.items[i].quantity,
          type: 'PURCHASE',
          unitCost: purchase.items[i].landedUnitCost,
          referenceType: 'PURCHASE',
          referenceId: purchaseId,
          referenceNumber: purchase.number,
          warehouseId: purchase.warehouseId,
          recalculateAverageCost: true,
          updateLastCost: true,
        });
      }

      tx.set(
        refs.purchase(purchaseId),
        {
          status,
          paymentStatus: derivePaymentStatus(purchase.total, paidAmount),
          paidAmount,
          dueAmount: purchase.total - paidAmount,
          receivedAt: nowIso(),
          receivedBy: ctx.actor.userId,
          dueDate: purchase.type === 'CREDIT' ? dueDate : null,
          updatedAt: nowIso(),
          updatedBy: ctx.actor.userId,
        },
        { merge: true },
      );

      if (paidAmount > 0 && account && paymentNumber) {
        paymentNumber.commit();
        postLedgerEntry(tx, {
          actor: ctx.actor,
          actorName: ctx.actorName,
          account,
          currentBalance: account.currentBalance,
          amount: paidAmount,
          direction: 'OUT',
          type: 'PURCHASE_PAYMENT',
          referenceType: 'PURCHASE',
          referenceId: purchaseId,
          referenceNumber: purchase.number,
          date: purchase.date,
          description: `Pago de la compra ${purchase.number} a ${supplier.name}`,
        });
        writePayment(tx, {
          actor: ctx.actor,
          number: paymentNumber.number,
          type: 'PURCHASE_PAYMENT',
          referenceType: 'PURCHASE',
          referenceId: purchaseId,
          referenceNumber: purchase.number,
          partyId: supplier.id,
          partyName: supplier.name,
          account,
          amount: paidAmount,
          date: purchase.date,
          method: (payment!.method as PaymentMethod) ?? 'CASH',
          reference: payment!.reference ?? null,
        });
      }

      const pending = purchase.total - paidAmount;
      if (pending > 0) {
        writePayable(tx, {
          actor: ctx.actor,
          supplierId: supplier.id,
          supplierName: supplier.name,
          referenceType: 'PURCHASE',
          referenceId: purchaseId,
          referenceNumber: purchase.number,
          amount: purchase.total,
          paidAmount,
          issueDate: purchase.date,
          dueDate,
        });
      }

      bumpPartyStats(tx, ctx.actor, 'supplier', supplier.id, supplier.stats, {
        totalAmount: purchase.total,
        documentCount: 1,
        outstandingBalance: pending,
        lastDocumentAt: purchase.date,
      });

      auditInTransaction(tx, ctx.actor, {
        action: 'RECEIVE',
        module: 'PURCHASES',
        entityType: 'purchase',
        entityId: purchaseId,
        entityLabel: purchase.number,
        before: { status: purchase.status },
        after: { status, paidAmount },
      });

      const result: CreatePurchaseResult = {
        purchaseId,
        number: purchase.number,
        status,
        total: purchase.total,
      };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /** Registra un pago (total o parcial) sobre una compra a crédito. */
  async registerPayment(
    ctx: PurchaseServiceContext,
    purchaseId: Id,
    input: { accountId: Id; amount: number; method: PaymentMethod; date: string; reference?: string | null; notes?: string | null },
    idempotencyKey?: string | null,
  ): Promise<{ paymentId: Id; number: string; paidAmount: number }> {
    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'purchase.payment',
      );
      if (guard.existing) {
        return guard.existing as unknown as { paymentId: Id; number: string; paidAmount: number };
      }

      const snap = await tx.get(refs.purchase(purchaseId));
      if (!snap.exists) throw errors.notFound('Compra');
      const purchase = { ...(snap.data() as Purchase), id: snap.id };
      if (purchase.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (!ACTIVE_PURCHASE_STATUSES.includes(purchase.status)) {
        throw errors.invalidTransition('Solo se pueden pagar compras recibidas.');
      }

      const amount = toMinorUnits(input.amount);
      if (amount <= 0) throw errors.validation('El importe del pago debe ser mayor que cero.');
      if (amount > purchase.dueAmount) {
        throw errors.validation('El pago excede el saldo pendiente de la compra.');
      }

      const accountSnap = await tx.get(refs.financialAccount(input.accountId));
      if (!accountSnap.exists) throw errors.notFound('Cuenta financiera');
      const account = { ...(accountSnap.data() as FinancialAccount), id: accountSnap.id };
      if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (account.currentBalance < amount) {
        throw errors.insufficientFunds(
          `La cuenta "${account.name}" no tiene saldo suficiente para este pago.`,
        );
      }

      const payableSnap = await tx.get(
        refs
          .payables()
          .where('organizationId', '==', ctx.actor.organizationId)
          .where('referenceId', '==', purchaseId)
          .limit(1),
      );
      const payable = payableSnap.empty
        ? null
        : { ...(payableSnap.docs[0].data() as AccountPayable), id: payableSnap.docs[0].id };

      const supplierSnap = await tx.get(refs.supplier(purchase.supplierId));
      const supplier = supplierSnap.exists
        ? { ...(supplierSnap.data() as Supplier), id: supplierSnap.id }
        : null;

      const paymentNumber = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'payment',
        ctx.settings.numbering.payment,
      );

      const date = parseDate(input.date);
      const paidAmount = purchase.paidAmount + amount;
      const status = derivePurchaseStatus(purchase.total, paidAmount, purchase.status);

      // ------------------------------ ESCRITURAS ------------------------------
      paymentNumber.commit();

      postLedgerEntry(tx, {
        actor: ctx.actor,
        actorName: ctx.actorName,
        account,
        currentBalance: account.currentBalance,
        amount,
        direction: 'OUT',
        type: 'SUPPLIER_PAYMENT',
        referenceType: 'PURCHASE',
        referenceId: purchaseId,
        referenceNumber: purchase.number,
        date,
        description: `Abono a ${purchase.supplierName} por la compra ${purchase.number}`,
      });

      const paymentDoc = writePayment(tx, {
        actor: ctx.actor,
        number: paymentNumber.number,
        type: 'SUPPLIER_PAYMENT',
        referenceType: 'PURCHASE',
        referenceId: purchaseId,
        referenceNumber: purchase.number,
        partyId: purchase.supplierId,
        partyName: purchase.supplierName,
        account,
        amount,
        date,
        method: input.method,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      });

      tx.set(
        refs.purchase(purchaseId),
        {
          paidAmount,
          dueAmount: purchase.total - paidAmount,
          paymentStatus: derivePaymentStatus(purchase.total, paidAmount),
          status,
          updatedAt: nowIso(),
          updatedBy: ctx.actor.userId,
        },
        { merge: true },
      );

      if (payable) applyToPayable(tx, ctx.actor, payable, amount);

      if (supplier) {
        bumpPartyStats(tx, ctx.actor, 'supplier', supplier.id, supplier.stats, {
          outstandingBalance: -amount,
        });
      }

      auditInTransaction(tx, ctx.actor, {
        action: 'PAYMENT',
        module: 'PURCHASES',
        entityType: 'purchase',
        entityId: purchaseId,
        entityLabel: purchase.number,
        after: { amount, paidAmount, account: account.name },
      });

      const result = { paymentId: paymentDoc.id, number: paymentDoc.number, paidAmount };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /** Anula una compra revirtiendo inventario, pagos y cuentas por pagar. */
  async cancelPurchase(ctx: PurchaseServiceContext, purchaseId: Id, reason: string): Promise<void> {
    await runTransaction(async (tx) => {
      const snap = await tx.get(refs.purchase(purchaseId));
      if (!snap.exists) throw errors.notFound('Compra');
      const purchase = { ...(snap.data() as Purchase), id: snap.id };
      if (purchase.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();

      assertPurchaseTransition(purchase.status, 'CANCELLED');
      const wasReceived = purchase.status !== 'DRAFT';

      const productSnaps = wasReceived
        ? await Promise.all(purchase.items.map((item) => tx.get(refs.product(item.productId))))
        : [];

      const paymentsSnap = wasReceived
        ? await tx.get(
            refs
              .payments()
              .where('organizationId', '==', ctx.actor.organizationId)
              .where('referenceId', '==', purchaseId),
          )
        : null;
      const payments = paymentsSnap
        ? paymentsSnap.docs.map((d) => ({
            ...(d.data() as import('@/types/finance').Payment),
            id: d.id,
          }))
        : [];

      const accountIds = [...new Set(payments.filter((p) => !p.cancelledAt).map((p) => p.accountId))];
      const accountSnaps = await Promise.all(accountIds.map((id) => tx.get(refs.financialAccount(id))));
      const accounts = new Map<string, FinancialAccount>();
      for (const accSnap of accountSnaps) {
        if (accSnap.exists) {
          accounts.set(accSnap.id, { ...(accSnap.data() as FinancialAccount), id: accSnap.id });
        }
      }

      const payableSnap = wasReceived
        ? await tx.get(
            refs
              .payables()
              .where('organizationId', '==', ctx.actor.organizationId)
              .where('referenceId', '==', purchaseId)
              .limit(1),
          )
        : null;

      const supplierSnap = wasReceived ? await tx.get(refs.supplier(purchase.supplierId)) : null;
      const supplier =
        supplierSnap && supplierSnap.exists
          ? { ...(supplierSnap.data() as Supplier), id: supplierSnap.id }
          : null;

      // ------------------------------ ESCRITURAS ------------------------------
      if (wasReceived) {
        for (let i = 0; i < purchase.items.length; i += 1) {
          const productSnap = productSnaps[i];
          if (!productSnap.exists) continue;
          const product = { ...(productSnap.data() as Product), id: productSnap.id };
          if (!product.tracksInventory) continue;
          const pendingQty = purchase.items[i].quantity - (purchase.items[i].returnedQuantity ?? 0);
          if (pendingQty <= 0) continue;

          if ((product.stock ?? 0) < pendingQty) {
            throw errors.insufficientStock(
              `No se puede anular: "${product.name}" ya no tiene el inventario recibido en esta compra.`,
            );
          }

          writeStockMovement(tx, {
            actor: ctx.actor,
            actorName: ctx.actorName,
            product,
            quantity: pendingQty,
            type: 'PURCHASE_RETURN',
            unitCost: purchase.items[i].landedUnitCost,
            referenceType: 'PURCHASE',
            referenceId: purchaseId,
            referenceNumber: purchase.number,
            reason: `Anulación de compra: ${reason}`,
            warehouseId: purchase.warehouseId,
          });
        }

        const runningBalances = new Map<string, number>();
        for (const payment of payments) {
          if (payment.cancelledAt) continue;
          const account = accounts.get(payment.accountId);
          if (!account) continue;
          const currentBalance = runningBalances.get(account.id) ?? account.currentBalance;
          const result = postLedgerEntry(tx, {
            actor: ctx.actor,
            actorName: ctx.actorName,
            account,
            currentBalance,
            amount: payment.amount,
            direction: 'IN',
            type: 'PURCHASE_REFUND',
            referenceType: 'PURCHASE',
            referenceId: purchaseId,
            referenceNumber: purchase.number,
            date: nowIso(),
            description: `Reversión por anulación de la compra ${purchase.number}`,
          });
          runningBalances.set(account.id, result.balanceAfter);
          tx.set(refs.payment(payment.id), { cancelledAt: nowIso(), updatedAt: nowIso() }, { merge: true });
        }

        if (payableSnap && !payableSnap.empty) {
          tx.set(
            refs.payable(payableSnap.docs[0].id),
            {
              status: 'CANCELLED',
              remainingAmount: 0,
              updatedAt: nowIso(),
              updatedBy: ctx.actor.userId,
            },
            { merge: true },
          );
        }

        if (supplier) {
          bumpPartyStats(tx, ctx.actor, 'supplier', supplier.id, supplier.stats, {
            totalAmount: -purchase.total,
            documentCount: -1,
            outstandingBalance: -purchase.dueAmount,
          });
        }
      }

      tx.set(
        refs.purchase(purchaseId),
        {
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          dueAmount: 0,
          cancelledAt: nowIso(),
          cancelledBy: ctx.actor.userId,
          cancelReason: reason,
          updatedAt: nowIso(),
          updatedBy: ctx.actor.userId,
        },
        { merge: true },
      );

      auditInTransaction(tx, ctx.actor, {
        action: 'CANCEL',
        module: 'PURCHASES',
        entityType: 'purchase',
        entityId: purchaseId,
        entityLabel: purchase.number,
        before: { status: purchase.status, total: purchase.total },
        after: { status: 'CANCELLED' },
        metadata: { reason },
      });
    });
  },
};

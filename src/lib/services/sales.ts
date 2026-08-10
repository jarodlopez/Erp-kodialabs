import 'server-only';

/**
 * Servicio de ventas.
 *
 * `confirmSale` ejecuta, dentro de UNA sola transacción de Firestore:
 *   1. validación de productos, precios, cantidades y existencias;
 *   2. cálculo de subtotal, descuentos, impuestos y total;
 *   3. congelado del costo de venta (COGS) al costo promedio del momento;
 *   4. creación del documento de venta con numeración correlativa;
 *   5. descuento de inventario + movimiento por cada línea;
 *   6. asiento en el libro mayor si hubo cobro;
 *   7. cuenta por cobrar si la venta es a crédito;
 *   8. documento de pago si se cobró en el acto;
 *   9. actualización de métricas del cliente;
 *  10. registro de auditoría.
 *
 * Si cualquiera de esos pasos falla, la transacción completa se revierte: es
 * imposible que quede una venta sin inventario descontado o sin su asiento.
 */
import type { Transaction } from 'firebase-admin/firestore';

import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { toMinorUnits, toScaledQty } from '@/lib/money';
import { priceDocument } from '@/lib/pricing';
import { nowIso, parseDate } from '@/lib/repositories/base';
import { newDoc, refs } from '@/lib/repositories/refs';
import {
  assertSaleTransition,
  ACTIVE_SALE_STATUSES,
  derivePaymentStatus,
  deriveSaleStatus,
} from '@/lib/state-machines';
import { auditInTransaction } from './audit';
import {
  applyToReceivable,
  bumpPartyStats,
  postLedgerEntry,
  writePayment,
  writeReceivable,
} from './finance';
import { writeStockMovement } from './inventory';
import { guardIdempotency, reserveNumber, runTransaction } from './transaction';
import type { ActorContext, Id } from '@/types/common';
import type { Product } from '@/types/catalog';
import type { Customer } from '@/types/parties';
import type { FinancialAccount, PaymentMethod } from '@/types/finance';
import type { Settings } from '@/types/organization';
import type { CreateSaleInput, Sale, SaleItem } from '@/types/sales';

export interface SaleServiceContext {
  actor: ActorContext;
  actorName: string;
  settings: Settings;
  defaultWarehouseId: Id;
}

export interface CreateSaleResult {
  saleId: Id;
  number: string;
  status: Sale['status'];
  total: number;
}

interface PreparedLine {
  product: Product;
  scaledQty: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  unitCost: number;
}

/** Lee y valida los productos de la venta durante la fase de lectura. */
async function readLines(
  tx: Transaction,
  ctx: SaleServiceContext,
  items: CreateSaleInput['items'],
): Promise<PreparedLine[]> {
  if (items.length === 0) {
    throw errors.validation('La venta debe incluir al menos un producto.');
  }

  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.productId)) {
      throw errors.validation('Hay productos repetidos en la venta. Únelos en una sola línea.');
    }
    seen.add(item.productId);
  }

  const snaps = await Promise.all(items.map((item) => tx.get(refs.product(item.productId))));

  return items.map((item, index) => {
    const snap = snaps[index];
    if (!snap.exists) throw errors.notFound('Producto');
    const product = { ...(snap.data() as Product), id: snap.id };

    if (product.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
    if (product.status !== 'ACTIVE') {
      throw errors.validation(`El producto "${product.name}" está inactivo.`);
    }

    const scaledQty = toScaledQty(item.quantity);
    if (scaledQty <= 0) {
      throw errors.validation(`La cantidad de "${product.name}" debe ser mayor que cero.`);
    }

    const unitPrice =
      item.unitPrice !== undefined && item.unitPrice !== null
        ? toMinorUnits(item.unitPrice)
        : product.salePrice;
    if (unitPrice < 0) {
      throw errors.validation(`El precio de "${product.name}" no puede ser negativo.`);
    }

    if (
      product.tracksInventory &&
      !ctx.settings.allowNegativeStock &&
      (product.stock ?? 0) < scaledQty
    ) {
      throw errors.insufficientStock(
        `"${product.name}": disponible ${(product.stock ?? 0) / 1000}, solicitado ${item.quantity}.`,
      );
    }

    return {
      product,
      scaledQty,
      unitPrice,
      discount: toMinorUnits(item.discount ?? 0),
      taxRate: product.taxRate ?? 0,
      unitCost: product.averageCost ?? product.cost ?? 0,
    };
  });
}

function buildSaleItems(
  prepared: PreparedLine[],
  priced: ReturnType<typeof priceDocument>,
  warehouseId: Id,
): SaleItem[] {
  return prepared.map((line, index) => {
    const p = priced.lines[index];
    return {
      productId: line.product.id,
      sku: line.product.sku,
      name: line.product.name,
      unit: line.product.unit,
      quantity: line.scaledQty,
      unitPrice: line.unitPrice,
      discount: p.discount,
      taxRate: line.taxRate,
      taxAmount: p.taxAmount,
      subtotal: p.subtotal,
      total: p.total,
      unitCost: line.unitCost,
      totalCost: p.totalCost,
      returnedQuantity: 0,
      warehouseId,
    };
  });
}

export const saleService = {
  /**
   * Crea una venta. Si `confirm` es `true` ejecuta el flujo completo
   * (inventario + finanzas + CxC + auditoría) de forma atómica.
   */
  async createSale(
    ctx: SaleServiceContext,
    input: CreateSaleInput,
    options: { confirm: boolean; idempotencyKey?: string | null },
  ): Promise<CreateSaleResult> {
    const warehouseId = input.warehouseId ?? ctx.defaultWarehouseId;
    const date = parseDate(input.date);

    return runTransaction(async (tx) => {
      // ------------------------------- LECTURAS -------------------------------
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        options.idempotencyKey,
        'sale.create',
      );
      if (guard.existing) {
        return guard.existing as unknown as CreateSaleResult;
      }

      const prepared = await readLines(tx, ctx, input.items);

      let customer: Customer | null = null;
      if (input.customerId) {
        const snap = await tx.get(refs.customer(input.customerId));
        if (!snap.exists) throw errors.notFound('Cliente');
        customer = { ...(snap.data() as Customer), id: snap.id };
        if (customer.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      }

      if (input.type === 'CREDIT' && !customer) {
        throw errors.validation('Una venta a crédito requiere un cliente registrado.');
      }

      let account: FinancialAccount | null = null;
      const wantsPayment = Boolean(input.payment && input.payment.amount > 0);
      if (wantsPayment && options.confirm) {
        const snap = await tx.get(refs.financialAccount(input.payment!.accountId));
        if (!snap.exists) throw errors.notFound('Cuenta financiera');
        account = { ...(snap.data() as FinancialAccount), id: snap.id };
        if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      }

      const saleNumber = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'sale',
        ctx.settings.numbering.sale,
      );
      const paymentNumber =
        wantsPayment && options.confirm
          ? await reserveNumber(tx, ctx.actor.organizationId, 'payment', ctx.settings.numbering.payment)
          : null;

      // ------------------------------- CÁLCULO --------------------------------
      const priced = priceDocument(
        prepared.map((l) => ({
          quantity: l.scaledQty,
          unitPrice: l.unitPrice,
          discount: l.discount,
          taxRate: l.taxRate,
          unitCost: l.unitCost,
        })),
        {
          taxMode: ctx.settings.taxMode,
          globalDiscount: toMinorUnits(input.globalDiscount ?? 0),
        },
      );

      const items = buildSaleItems(prepared, priced, warehouseId);
      const total = priced.totals.total;

      const paidAmount = wantsPayment && options.confirm ? toMinorUnits(input.payment!.amount) : 0;
      if (paidAmount > total) {
        throw errors.validation('El pago no puede ser mayor que el total de la venta.');
      }
      if (input.type === 'CASH' && options.confirm && paidAmount < total) {
        throw errors.validation(
          'Una venta de contado debe cobrarse completa. Usa "crédito" para dejar saldo pendiente.',
        );
      }

      const dueDate = input.dueDate
        ? parseDate(input.dueDate)
        : new Date(
            new Date(date).getTime() +
              (customer?.creditDays ?? ctx.settings.defaultCreditDays) * 86400000,
          ).toISOString();

      const status: Sale['status'] = options.confirm
        ? deriveSaleStatus(total, paidAmount, 'CONFIRMED')
        : 'DRAFT';

      const saleRef = newDoc(COLLECTIONS.SALES);
      const sale: Sale = {
        id: saleRef.id,
        organizationId: ctx.actor.organizationId,
        number: saleNumber.number,
        type: input.type,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? 'Cliente ocasional',
        sellerId: ctx.actor.userId,
        sellerName: ctx.actorName,
        date,
        items,
        subtotal: priced.totals.subtotal,
        discount: priced.totals.discount,
        globalDiscount: priced.totals.globalDiscount,
        tax: priced.totals.tax,
        total,
        costOfGoodsSold: options.confirm ? priced.totals.costOfGoodsSold : 0,
        grossProfit: options.confirm ? priced.totals.grossProfit : 0,
        paidAmount,
        dueAmount: total - paidAmount,
        paymentStatus: options.confirm ? derivePaymentStatus(total, paidAmount) : 'UNPAID',
        status,
        dueDate: input.type === 'CREDIT' ? dueDate : null,
        notes: input.notes ?? null,
        delivery: input.delivery ?? null,
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
      saleNumber.commit();
      tx.create(saleRef, sale);

      if (options.confirm) {
        // Inventario
        for (const line of prepared) {
          if (!line.product.tracksInventory) continue;
          writeStockMovement(tx, {
            actor: ctx.actor,
            actorName: ctx.actorName,
            product: line.product,
            quantity: line.scaledQty,
            type: 'SALE',
            unitCost: line.unitCost,
            referenceType: 'SALE',
            referenceId: saleRef.id,
            referenceNumber: sale.number,
            warehouseId,
            allowNegativeStock: ctx.settings.allowNegativeStock,
          });
        }

        // Cobro inmediato
        if (paidAmount > 0 && account && paymentNumber) {
          paymentNumber.commit();
          postLedgerEntry(tx, {
            actor: ctx.actor,
            actorName: ctx.actorName,
            account,
            currentBalance: account.currentBalance,
            amount: paidAmount,
            direction: 'IN',
            type: 'SALE_INCOME',
            referenceType: 'SALE',
            referenceId: saleRef.id,
            referenceNumber: sale.number,
            date,
            description: `Cobro de la venta ${sale.number}`,
          });
          writePayment(tx, {
            actor: ctx.actor,
            number: paymentNumber.number,
            type: 'SALE_PAYMENT',
            referenceType: 'SALE',
            referenceId: saleRef.id,
            referenceNumber: sale.number,
            partyId: customer?.id ?? null,
            partyName: sale.customerName,
            account,
            amount: paidAmount,
            date,
            method: (input.payment!.method as PaymentMethod) ?? 'CASH',
            reference: input.payment!.reference ?? null,
          });
        }

        // Cuenta por cobrar
        const pending = total - paidAmount;
        if (pending > 0 && customer) {
          writeReceivable(tx, {
            actor: ctx.actor,
            customerId: customer.id,
            customerName: customer.name,
            saleId: saleRef.id,
            saleNumber: sale.number,
            amount: total,
            paidAmount,
            issueDate: date,
            dueDate,
          });
        }

        // Métricas del cliente
        if (customer) {
          bumpPartyStats(tx, ctx.actor, 'customer', customer.id, customer.stats, {
            totalAmount: total,
            documentCount: 1,
            outstandingBalance: pending,
            lastDocumentAt: date,
          });
        }
      }

      auditInTransaction(tx, ctx.actor, {
        action: options.confirm ? 'CONFIRM' : 'CREATE',
        module: 'SALES',
        entityType: 'sale',
        entityId: saleRef.id,
        entityLabel: sale.number,
        after: { number: sale.number, total, status, customer: sale.customerName },
        metadata: { items: items.length, paidAmount },
      });

      const result: CreateSaleResult = {
        saleId: saleRef.id,
        number: sale.number,
        status,
        total,
      };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /** Confirma un borrador ejecutando el flujo completo de forma atómica. */
  async confirmSale(
    ctx: SaleServiceContext,
    saleId: Id,
    payment: CreateSaleInput['payment'],
    idempotencyKey?: string | null,
  ): Promise<CreateSaleResult> {
    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'sale.confirm',
      );
      if (guard.existing) return guard.existing as unknown as CreateSaleResult;

      const saleSnap = await tx.get(refs.sale(saleId));
      if (!saleSnap.exists) throw errors.notFound('Venta');
      const sale = { ...(saleSnap.data() as Sale), id: saleSnap.id };
      if (sale.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();

      assertSaleTransition(sale.status, 'CONFIRMED');

      const productSnaps = await Promise.all(
        sale.items.map((item) => tx.get(refs.product(item.productId))),
      );

      let customer: Customer | null = null;
      if (sale.customerId) {
        const snap = await tx.get(refs.customer(sale.customerId));
        if (snap.exists) customer = { ...(snap.data() as Customer), id: snap.id };
      }

      const wantsPayment = Boolean(payment && payment.amount > 0);
      let account: FinancialAccount | null = null;
      if (wantsPayment) {
        const snap = await tx.get(refs.financialAccount(payment!.accountId));
        if (!snap.exists) throw errors.notFound('Cuenta financiera');
        account = { ...(snap.data() as FinancialAccount), id: snap.id };
        if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      }

      const paymentNumber = wantsPayment
        ? await reserveNumber(tx, ctx.actor.organizationId, 'payment', ctx.settings.numbering.payment)
        : null;

      const paidAmount = wantsPayment ? toMinorUnits(payment!.amount) : 0;
      if (paidAmount > sale.total) {
        throw errors.validation('El pago no puede ser mayor que el total de la venta.');
      }

      // Se recalcula el COGS con el costo promedio vigente al confirmar.
      let costOfGoodsSold = 0;
      const updatedItems: SaleItem[] = sale.items.map((item, index) => {
        const snap = productSnaps[index];
        if (!snap.exists) throw errors.notFound('Producto');
        const product = { ...(snap.data() as Product), id: snap.id };
        const unitCost = product.averageCost ?? product.cost ?? 0;
        const totalCost = Math.round((unitCost * item.quantity) / 1000);
        costOfGoodsSold += totalCost;

        if (
          product.tracksInventory &&
          !ctx.settings.allowNegativeStock &&
          (product.stock ?? 0) < item.quantity
        ) {
          throw errors.insufficientStock(
            `"${product.name}": disponible ${(product.stock ?? 0) / 1000}, solicitado ${
              item.quantity / 1000
            }.`,
          );
        }

        return { ...item, unitCost, totalCost };
      });

      const status = deriveSaleStatus(sale.total, paidAmount, 'CONFIRMED');
      const dueDate =
        sale.dueDate ??
        new Date(
          new Date(sale.date).getTime() +
            (customer?.creditDays ?? ctx.settings.defaultCreditDays) * 86400000,
        ).toISOString();

      // ------------------------------ ESCRITURAS ------------------------------
      tx.set(
        refs.sale(saleId),
        {
          items: updatedItems,
          costOfGoodsSold,
          grossProfit: sale.subtotal - costOfGoodsSold,
          status,
          paymentStatus: derivePaymentStatus(sale.total, paidAmount),
          paidAmount,
          dueAmount: sale.total - paidAmount,
          dueDate: sale.type === 'CREDIT' ? dueDate : null,
          updatedAt: nowIso(),
          updatedBy: ctx.actor.userId,
        },
        { merge: true },
      );

      for (let i = 0; i < sale.items.length; i += 1) {
        const snap = productSnaps[i];
        const product = { ...(snap.data() as Product), id: snap.id };
        if (!product.tracksInventory) continue;
        writeStockMovement(tx, {
          actor: ctx.actor,
          actorName: ctx.actorName,
          product,
          quantity: sale.items[i].quantity,
          type: 'SALE',
          unitCost: updatedItems[i].unitCost,
          referenceType: 'SALE',
          referenceId: saleId,
          referenceNumber: sale.number,
          warehouseId: sale.warehouseId,
          allowNegativeStock: ctx.settings.allowNegativeStock,
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
          direction: 'IN',
          type: 'SALE_INCOME',
          referenceType: 'SALE',
          referenceId: saleId,
          referenceNumber: sale.number,
          date: sale.date,
          description: `Cobro de la venta ${sale.number}`,
        });
        writePayment(tx, {
          actor: ctx.actor,
          number: paymentNumber.number,
          type: 'SALE_PAYMENT',
          referenceType: 'SALE',
          referenceId: saleId,
          referenceNumber: sale.number,
          partyId: customer?.id ?? null,
          partyName: sale.customerName,
          account,
          amount: paidAmount,
          date: sale.date,
          method: (payment!.method as PaymentMethod) ?? 'CASH',
          reference: payment!.reference ?? null,
        });
      }

      const pending = sale.total - paidAmount;
      if (pending > 0 && customer) {
        writeReceivable(tx, {
          actor: ctx.actor,
          customerId: customer.id,
          customerName: customer.name,
          saleId,
          saleNumber: sale.number,
          amount: sale.total,
          paidAmount,
          issueDate: sale.date,
          dueDate,
        });
      }

      if (customer) {
        bumpPartyStats(tx, ctx.actor, 'customer', customer.id, customer.stats, {
          totalAmount: sale.total,
          documentCount: 1,
          outstandingBalance: pending,
          lastDocumentAt: sale.date,
        });
      }

      auditInTransaction(tx, ctx.actor, {
        action: 'CONFIRM',
        module: 'SALES',
        entityType: 'sale',
        entityId: saleId,
        entityLabel: sale.number,
        before: { status: sale.status },
        after: { status, paidAmount },
      });

      const result: CreateSaleResult = {
        saleId,
        number: sale.number,
        status,
        total: sale.total,
      };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /** Registra un abono sobre una venta a crédito. */
  async registerPayment(
    ctx: SaleServiceContext,
    saleId: Id,
    input: { accountId: Id; amount: number; method: PaymentMethod; date: string; reference?: string | null; notes?: string | null },
    idempotencyKey?: string | null,
  ): Promise<{ paymentId: Id; number: string; paidAmount: number }> {
    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'sale.payment',
      );
      if (guard.existing) return guard.existing as unknown as { paymentId: Id; number: string; paidAmount: number };

      const saleSnap = await tx.get(refs.sale(saleId));
      if (!saleSnap.exists) throw errors.notFound('Venta');
      const sale = { ...(saleSnap.data() as Sale), id: saleSnap.id };
      if (sale.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (!ACTIVE_SALE_STATUSES.includes(sale.status)) {
        throw errors.invalidTransition('Solo se pueden cobrar ventas confirmadas.');
      }

      const amount = toMinorUnits(input.amount);
      if (amount <= 0) throw errors.validation('El importe del cobro debe ser mayor que cero.');
      if (amount > sale.dueAmount) {
        throw errors.validation('El cobro excede el saldo pendiente de la venta.');
      }

      const accountSnap = await tx.get(refs.financialAccount(input.accountId));
      if (!accountSnap.exists) throw errors.notFound('Cuenta financiera');
      const account = { ...(accountSnap.data() as FinancialAccount), id: accountSnap.id };
      if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();

      const receivableQuery = await tx.get(
        refs
          .receivables()
          .where('organizationId', '==', ctx.actor.organizationId)
          .where('referenceId', '==', saleId)
          .limit(1),
      );
      const receivable = receivableQuery.empty
        ? null
        : { ...(receivableQuery.docs[0].data() as import('@/types/finance').AccountReceivable), id: receivableQuery.docs[0].id };

      let customer: Customer | null = null;
      if (sale.customerId) {
        const snap = await tx.get(refs.customer(sale.customerId));
        if (snap.exists) customer = { ...(snap.data() as Customer), id: snap.id };
      }

      const paymentNumber = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'payment',
        ctx.settings.numbering.payment,
      );

      const date = parseDate(input.date);
      const paidAmount = sale.paidAmount + amount;
      const status = deriveSaleStatus(sale.total, paidAmount, sale.status);

      // ------------------------------ ESCRITURAS ------------------------------
      paymentNumber.commit();

      postLedgerEntry(tx, {
        actor: ctx.actor,
        actorName: ctx.actorName,
        account,
        currentBalance: account.currentBalance,
        amount,
        direction: 'IN',
        type: 'CUSTOMER_PAYMENT',
        referenceType: 'SALE',
        referenceId: saleId,
        referenceNumber: sale.number,
        date,
        description: `Abono de ${sale.customerName} a la venta ${sale.number}`,
      });

      const payment = writePayment(tx, {
        actor: ctx.actor,
        number: paymentNumber.number,
        type: 'CUSTOMER_PAYMENT',
        referenceType: 'SALE',
        referenceId: saleId,
        referenceNumber: sale.number,
        partyId: sale.customerId,
        partyName: sale.customerName,
        account,
        amount,
        date,
        method: input.method,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      });

      tx.set(
        refs.sale(saleId),
        {
          paidAmount,
          dueAmount: sale.total - paidAmount,
          paymentStatus: derivePaymentStatus(sale.total, paidAmount),
          status,
          updatedAt: nowIso(),
          updatedBy: ctx.actor.userId,
        },
        { merge: true },
      );

      if (receivable) {
        applyToReceivable(tx, ctx.actor, receivable, amount);
      }

      if (customer) {
        bumpPartyStats(tx, ctx.actor, 'customer', customer.id, customer.stats, {
          outstandingBalance: -amount,
        });
      }

      auditInTransaction(tx, ctx.actor, {
        action: 'PAYMENT',
        module: 'SALES',
        entityType: 'sale',
        entityId: saleId,
        entityLabel: sale.number,
        after: { amount, paidAmount, account: account.name },
      });

      const result = { paymentId: payment.id, number: payment.number, paidAmount };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /**
   * Anula una venta revirtiendo inventario, dinero y cuentas por cobrar.
   * La venta NO se elimina: queda como `CANCELLED` con su motivo y autor.
   */
  async cancelSale(ctx: SaleServiceContext, saleId: Id, reason: string): Promise<void> {
    await runTransaction(async (tx) => {
      const saleSnap = await tx.get(refs.sale(saleId));
      if (!saleSnap.exists) throw errors.notFound('Venta');
      const sale = { ...(saleSnap.data() as Sale), id: saleSnap.id };
      if (sale.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();

      assertSaleTransition(sale.status, 'CANCELLED');

      const wasConfirmed = sale.status !== 'DRAFT';

      const productSnaps = wasConfirmed
        ? await Promise.all(sale.items.map((item) => tx.get(refs.product(item.productId))))
        : [];

      // Pagos a revertir
      const paymentsSnap = wasConfirmed
        ? await tx.get(
            refs
              .payments()
              .where('organizationId', '==', ctx.actor.organizationId)
              .where('referenceId', '==', saleId),
          )
        : null;
      const payments = paymentsSnap
        ? paymentsSnap.docs.map((d) => ({ ...(d.data() as import('@/types/finance').Payment), id: d.id }))
        : [];

      const accountIds = [...new Set(payments.filter((p) => !p.cancelledAt).map((p) => p.accountId))];
      const accountSnaps = await Promise.all(
        accountIds.map((id) => tx.get(refs.financialAccount(id))),
      );
      const accounts = new Map<string, FinancialAccount>();
      for (const snap of accountSnaps) {
        if (snap.exists) accounts.set(snap.id, { ...(snap.data() as FinancialAccount), id: snap.id });
      }

      const receivableSnap = wasConfirmed
        ? await tx.get(
            refs
              .receivables()
              .where('organizationId', '==', ctx.actor.organizationId)
              .where('referenceId', '==', saleId)
              .limit(1),
          )
        : null;

      let customer: Customer | null = null;
      if (wasConfirmed && sale.customerId) {
        const snap = await tx.get(refs.customer(sale.customerId));
        if (snap.exists) customer = { ...(snap.data() as Customer), id: snap.id };
      }

      // ------------------------------ ESCRITURAS ------------------------------
      if (wasConfirmed) {
        // Reingreso de inventario
        for (let i = 0; i < sale.items.length; i += 1) {
          const snap = productSnaps[i];
          if (!snap.exists) continue;
          const product = { ...(snap.data() as Product), id: snap.id };
          if (!product.tracksInventory) continue;
          const pendingQty = sale.items[i].quantity - (sale.items[i].returnedQuantity ?? 0);
          if (pendingQty <= 0) continue;
          writeStockMovement(tx, {
            actor: ctx.actor,
            actorName: ctx.actorName,
            product,
            quantity: pendingQty,
            type: 'SALE_RETURN',
            unitCost: sale.items[i].unitCost,
            referenceType: 'SALE',
            referenceId: saleId,
            referenceNumber: sale.number,
            reason: `Anulación de venta: ${reason}`,
            warehouseId: sale.warehouseId,
          });
        }

        // Reversión de cobros
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
            direction: 'OUT',
            type: 'SALE_REFUND',
            referenceType: 'SALE',
            referenceId: saleId,
            referenceNumber: sale.number,
            date: nowIso(),
            description: `Reversión por anulación de la venta ${sale.number}`,
          });
          runningBalances.set(account.id, result.balanceAfter);
          tx.set(refs.payment(payment.id), { cancelledAt: nowIso(), updatedAt: nowIso() }, { merge: true });
        }

        // Cancelación de la cuenta por cobrar
        if (receivableSnap && !receivableSnap.empty) {
          const doc = receivableSnap.docs[0];
          tx.set(
            refs.receivable(doc.id),
            {
              status: 'CANCELLED',
              remainingAmount: 0,
              updatedAt: nowIso(),
              updatedBy: ctx.actor.userId,
            },
            { merge: true },
          );
        }

        if (customer) {
          bumpPartyStats(tx, ctx.actor, 'customer', customer.id, customer.stats, {
            totalAmount: -sale.total,
            documentCount: -1,
            outstandingBalance: -sale.dueAmount,
          });
        }
      }

      tx.set(
        refs.sale(saleId),
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
        module: 'SALES',
        entityType: 'sale',
        entityId: saleId,
        entityLabel: sale.number,
        before: { status: sale.status, total: sale.total },
        after: { status: 'CANCELLED' },
        metadata: { reason },
      });
    });
  },
};

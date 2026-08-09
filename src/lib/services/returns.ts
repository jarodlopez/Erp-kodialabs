import 'server-only';

/**
 * Servicio de devoluciones.
 *
 * Una devolución NUNCA borra ni modifica la operación original: crea un
 * documento propio que revierte inventario y dinero, y deja el documento de
 * origen marcado con las cantidades devueltas. Así el historial permanece
 * completo y auditable.
 *
 * Formas de liquidación:
 *  - `CASH_REFUND`  : se devuelve dinero (asiento en el libro mayor).
 *  - `CREDIT_NOTE`  : se reduce la deuda pendiente (CxC o CxP).
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { multiplyByQty, toScaledQty } from '@/lib/money';
import { nowIso, parseDate } from '@/lib/repositories/base';
import { newDoc, refs } from '@/lib/repositories/refs';
import { derivePaymentStatus } from '@/lib/state-machines';
import { auditInTransaction } from './audit';
import { bumpPartyStats, postLedgerEntry } from './finance';
import { writeStockMovement } from './inventory';
import { guardIdempotency, reserveNumber, runTransaction } from './transaction';
import type { ActorContext, Id } from '@/types/common';
import type { Product } from '@/types/catalog';
import type { AccountPayable, AccountReceivable, FinancialAccount } from '@/types/finance';
import type { Settings } from '@/types/organization';
import type { Customer, Supplier } from '@/types/parties';
import type { Purchase } from '@/types/purchases';
import type { CreateReturnInput, ReturnDocument, ReturnItem } from '@/types/returns';
import type { Sale } from '@/types/sales';

export interface ReturnServiceContext {
  actor: ActorContext;
  actorName: string;
  settings: Settings;
}

export interface ReturnResult {
  returnId: Id;
  number: string;
  total: number;
}

export const returnService = {
  /** Devolución de una venta: entra inventario y se reintegra el valor. */
  async createSaleReturn(
    ctx: ReturnServiceContext,
    input: CreateReturnInput,
    idempotencyKey?: string | null,
  ): Promise<ReturnResult> {
    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'return.sale',
      );
      if (guard.existing) return guard.existing as unknown as ReturnResult;

      const saleSnap = await tx.get(refs.sale(input.referenceId));
      if (!saleSnap.exists) throw errors.notFound('Venta');
      const sale = { ...(saleSnap.data() as Sale), id: saleSnap.id };
      if (sale.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (sale.status === 'CANCELLED' || sale.status === 'DRAFT') {
        throw errors.invalidTransition('Solo se pueden devolver ventas confirmadas.');
      }

      if (input.items.length === 0) {
        throw errors.validation('Selecciona al menos un producto a devolver.');
      }

      const lines = input.items.map((line) => {
        const item = sale.items.find((i) => i.productId === line.productId);
        if (!item) {
          throw errors.validation('Uno de los productos no pertenece a esta venta.');
        }
        const scaledQty = toScaledQty(line.quantity);
        const available = item.quantity - (item.returnedQuantity ?? 0);
        if (scaledQty <= 0) {
          throw errors.validation(`La cantidad a devolver de "${item.name}" debe ser mayor que cero.`);
        }
        if (scaledQty > available) {
          throw errors.validation(
            `De "${item.name}" solo quedan ${available / 1000} unidades por devolver.`,
          );
        }
        return { item, scaledQty };
      });

      const productSnaps = await Promise.all(
        lines.map((l) => tx.get(refs.product(l.item.productId))),
      );

      let account: FinancialAccount | null = null;
      if (input.refundMode === 'CASH_REFUND') {
        if (!input.accountId) {
          throw errors.validation('Selecciona la cuenta desde la que se devuelve el dinero.');
        }
        const snap = await tx.get(refs.financialAccount(input.accountId));
        if (!snap.exists) throw errors.notFound('Cuenta financiera');
        account = { ...(snap.data() as FinancialAccount), id: snap.id };
        if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      }

      const receivableSnap = await tx.get(
        refs
          .receivables()
          .where('organizationId', '==', ctx.actor.organizationId)
          .where('referenceId', '==', sale.id)
          .limit(1),
      );
      const receivable = receivableSnap.empty
        ? null
        : {
            ...(receivableSnap.docs[0].data() as AccountReceivable),
            id: receivableSnap.docs[0].id,
          };

      let customer: Customer | null = null;
      if (sale.customerId) {
        const snap = await tx.get(refs.customer(sale.customerId));
        if (snap.exists) customer = { ...(snap.data() as Customer), id: snap.id };
      }

      const numbering = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'return',
        ctx.settings.numbering.return,
      );

      // ------------------------------- CÁLCULO --------------------------------
      const returnItems: ReturnItem[] = lines.map(({ item, scaledQty }) => {
        const ratio = scaledQty / item.quantity;
        const subtotal = Math.round(item.subtotal * ratio);
        const taxAmount = Math.round(item.taxAmount * ratio);
        return {
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          quantity: scaledQty,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          taxAmount,
          subtotal,
          total: subtotal + taxAmount,
          unitCost: item.unitCost,
          totalCost: multiplyByQty(item.unitCost, scaledQty),
        };
      });

      const subtotal = returnItems.reduce((acc, i) => acc + i.subtotal, 0);
      const tax = returnItems.reduce((acc, i) => acc + i.taxAmount, 0);
      const total = subtotal + tax;
      const totalCost = returnItems.reduce((acc, i) => acc + i.totalCost, 0);

      if (input.refundMode === 'CASH_REFUND') {
        if (!account) throw errors.notFound('Cuenta financiera');
        if (account.currentBalance < total) {
          throw errors.insufficientFunds(
            `La cuenta "${account.name}" no tiene saldo suficiente para el reembolso.`,
          );
        }
        if (sale.paidAmount < total) {
          throw errors.validation(
            'No se puede reembolsar en efectivo un importe mayor al cobrado. Usa nota de crédito.',
          );
        }
      }
      if (input.refundMode === 'CREDIT_NOTE' && (!receivable || receivable.remainingAmount <= 0)) {
        throw errors.validation(
          'Esta venta no tiene saldo pendiente: la devolución debe reembolsarse en efectivo.',
        );
      }

      const date = parseDate(input.date);
      const ref = newDoc(COLLECTIONS.RETURNS);
      const document: ReturnDocument = {
        id: ref.id,
        organizationId: ctx.actor.organizationId,
        number: numbering.number,
        type: 'SALE_RETURN',
        referenceType: 'SALE',
        referenceId: sale.id,
        referenceNumber: sale.number,
        partyId: sale.customerId,
        partyName: sale.customerName,
        date,
        items: returnItems,
        subtotal,
        tax,
        total,
        totalCost,
        refundMode: input.refundMode,
        accountId: account?.id ?? null,
        accountName: account?.name ?? null,
        reason: input.reason,
        notes: input.notes ?? null,
        warehouseId: sale.warehouseId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      };

      // ------------------------------ ESCRITURAS ------------------------------
      numbering.commit();
      tx.create(ref, document);

      for (let i = 0; i < lines.length; i += 1) {
        const snap = productSnaps[i];
        if (!snap.exists) continue;
        const product = { ...(snap.data() as Product), id: snap.id };
        if (!product.tracksInventory) continue;
        writeStockMovement(tx, {
          actor: ctx.actor,
          actorName: ctx.actorName,
          product,
          quantity: lines[i].scaledQty,
          type: 'SALE_RETURN',
          unitCost: lines[i].item.unitCost,
          referenceType: 'RETURN',
          referenceId: ref.id,
          referenceNumber: document.number,
          reason: input.reason,
          warehouseId: sale.warehouseId,
        });
      }

      // Liquidación del valor devuelto
      let newPaidAmount = sale.paidAmount;
      if (input.refundMode === 'CASH_REFUND' && account) {
        postLedgerEntry(tx, {
          actor: ctx.actor,
          actorName: ctx.actorName,
          account,
          currentBalance: account.currentBalance,
          amount: total,
          direction: 'OUT',
          type: 'SALE_REFUND',
          referenceType: 'RETURN',
          referenceId: ref.id,
          referenceNumber: document.number,
          date,
          description: `Reembolso por devolución ${document.number} de la venta ${sale.number}`,
        });
        newPaidAmount = sale.paidAmount - total;
      } else if (receivable) {
        const reduced = Math.min(total, receivable.remainingAmount);
        const newOriginal = receivable.originalAmount - reduced;
        tx.set(
          refs.receivable(receivable.id),
          {
            originalAmount: newOriginal,
            remainingAmount: receivable.remainingAmount - reduced,
            status: receivable.remainingAmount - reduced <= 0 ? 'PAID' : receivable.status,
            updatedAt: nowIso(),
            updatedBy: ctx.actor.userId,
          },
          { merge: true },
        );
        if (customer) {
          bumpPartyStats(tx, ctx.actor, 'customer', customer.id, customer.stats, {
            outstandingBalance: -reduced,
          });
        }
      }

      // Actualización del documento original
      const updatedItems = sale.items.map((item) => {
        const line = lines.find((l) => l.item.productId === item.productId);
        if (!line) return item;
        return { ...item, returnedQuantity: (item.returnedQuantity ?? 0) + line.scaledQty };
      });
      const fullyReturned = updatedItems.every((i) => (i.returnedQuantity ?? 0) >= i.quantity);
      const newTotal = sale.total - total;

      tx.set(
        refs.sale(sale.id),
        {
          items: updatedItems,
          returnedAmount: sale.returnedAmount + total,
          paidAmount: newPaidAmount,
          dueAmount: Math.max(0, newTotal - newPaidAmount),
          paymentStatus: derivePaymentStatus(newTotal, newPaidAmount),
          status: fullyReturned ? 'RETURNED' : sale.status,
          costOfGoodsSold: Math.max(0, sale.costOfGoodsSold - totalCost),
          updatedAt: nowIso(),
          updatedBy: ctx.actor.userId,
        },
        { merge: true },
      );

      if (customer) {
        bumpPartyStats(tx, ctx.actor, 'customer', customer.id, customer.stats, {
          totalAmount: -total,
        });
      }

      auditInTransaction(tx, ctx.actor, {
        action: 'RETURN',
        module: 'SALES',
        entityType: 'return',
        entityId: ref.id,
        entityLabel: document.number,
        after: { sale: sale.number, total, mode: input.refundMode },
        metadata: { reason: input.reason },
      });

      const result: ReturnResult = { returnId: ref.id, number: document.number, total };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /** Devolución a proveedor: sale inventario y se recupera el valor. */
  async createPurchaseReturn(
    ctx: ReturnServiceContext,
    input: CreateReturnInput,
    idempotencyKey?: string | null,
  ): Promise<ReturnResult> {
    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'return.purchase',
      );
      if (guard.existing) return guard.existing as unknown as ReturnResult;

      const purchaseSnap = await tx.get(refs.purchase(input.referenceId));
      if (!purchaseSnap.exists) throw errors.notFound('Compra');
      const purchase = { ...(purchaseSnap.data() as Purchase), id: purchaseSnap.id };
      if (purchase.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (purchase.status === 'CANCELLED' || purchase.status === 'DRAFT') {
        throw errors.invalidTransition('Solo se pueden devolver compras recibidas.');
      }

      const lines = input.items.map((line) => {
        const item = purchase.items.find((i) => i.productId === line.productId);
        if (!item) throw errors.validation('Uno de los productos no pertenece a esta compra.');
        const scaledQty = toScaledQty(line.quantity);
        const available = item.quantity - (item.returnedQuantity ?? 0);
        if (scaledQty <= 0) {
          throw errors.validation(`La cantidad a devolver de "${item.name}" debe ser mayor que cero.`);
        }
        if (scaledQty > available) {
          throw errors.validation(
            `De "${item.name}" solo quedan ${available / 1000} unidades por devolver.`,
          );
        }
        return { item, scaledQty };
      });

      const productSnaps = await Promise.all(
        lines.map((l) => tx.get(refs.product(l.item.productId))),
      );

      let account: FinancialAccount | null = null;
      if (input.refundMode === 'CASH_REFUND') {
        if (!input.accountId) {
          throw errors.validation('Selecciona la cuenta donde se recibe el reembolso.');
        }
        const snap = await tx.get(refs.financialAccount(input.accountId));
        if (!snap.exists) throw errors.notFound('Cuenta financiera');
        account = { ...(snap.data() as FinancialAccount), id: snap.id };
        if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      }

      const payableSnap = await tx.get(
        refs
          .payables()
          .where('organizationId', '==', ctx.actor.organizationId)
          .where('referenceId', '==', purchase.id)
          .limit(1),
      );
      const payable = payableSnap.empty
        ? null
        : { ...(payableSnap.docs[0].data() as AccountPayable), id: payableSnap.docs[0].id };

      const supplierSnap = await tx.get(refs.supplier(purchase.supplierId));
      const supplier = supplierSnap.exists
        ? { ...(supplierSnap.data() as Supplier), id: supplierSnap.id }
        : null;

      const numbering = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'return',
        ctx.settings.numbering.return,
      );

      // ------------------------------- CÁLCULO --------------------------------
      const returnItems: ReturnItem[] = lines.map(({ item, scaledQty }) => {
        const ratio = scaledQty / item.quantity;
        const subtotal = Math.round(item.subtotal * ratio);
        const taxAmount = Math.round(item.taxAmount * ratio);
        return {
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          quantity: scaledQty,
          unitPrice: item.unitCost,
          taxRate: item.taxRate,
          taxAmount,
          subtotal,
          total: subtotal + taxAmount,
          unitCost: item.landedUnitCost,
          totalCost: multiplyByQty(item.landedUnitCost, scaledQty),
        };
      });

      const subtotal = returnItems.reduce((acc, i) => acc + i.subtotal, 0);
      const tax = returnItems.reduce((acc, i) => acc + i.taxAmount, 0);
      const total = subtotal + tax;
      const totalCost = returnItems.reduce((acc, i) => acc + i.totalCost, 0);

      // Validación de inventario disponible para devolver
      for (let i = 0; i < lines.length; i += 1) {
        const snap = productSnaps[i];
        if (!snap.exists) throw errors.notFound('Producto');
        const product = snap.data() as Product;
        if (product.tracksInventory && (product.stock ?? 0) < lines[i].scaledQty) {
          throw errors.insufficientStock(
            `No hay suficiente inventario de "${product.name}" para devolver al proveedor.`,
          );
        }
      }

      const date = parseDate(input.date);
      const ref = newDoc(COLLECTIONS.RETURNS);
      const document: ReturnDocument = {
        id: ref.id,
        organizationId: ctx.actor.organizationId,
        number: numbering.number,
        type: 'PURCHASE_RETURN',
        referenceType: 'PURCHASE',
        referenceId: purchase.id,
        referenceNumber: purchase.number,
        partyId: purchase.supplierId,
        partyName: purchase.supplierName,
        date,
        items: returnItems,
        subtotal,
        tax,
        total,
        totalCost,
        refundMode: input.refundMode,
        accountId: account?.id ?? null,
        accountName: account?.name ?? null,
        reason: input.reason,
        notes: input.notes ?? null,
        warehouseId: purchase.warehouseId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      };

      // ------------------------------ ESCRITURAS ------------------------------
      numbering.commit();
      tx.create(ref, document);

      for (let i = 0; i < lines.length; i += 1) {
        const snap = productSnaps[i];
        const product = { ...(snap.data() as Product), id: snap.id };
        if (!product.tracksInventory) continue;
        writeStockMovement(tx, {
          actor: ctx.actor,
          actorName: ctx.actorName,
          product,
          quantity: lines[i].scaledQty,
          type: 'PURCHASE_RETURN',
          unitCost: lines[i].item.landedUnitCost,
          referenceType: 'RETURN',
          referenceId: ref.id,
          referenceNumber: document.number,
          reason: input.reason,
          warehouseId: purchase.warehouseId,
        });
      }

      let newPaidAmount = purchase.paidAmount;
      if (input.refundMode === 'CASH_REFUND' && account) {
        postLedgerEntry(tx, {
          actor: ctx.actor,
          actorName: ctx.actorName,
          account,
          currentBalance: account.currentBalance,
          amount: total,
          direction: 'IN',
          type: 'PURCHASE_REFUND',
          referenceType: 'RETURN',
          referenceId: ref.id,
          referenceNumber: document.number,
          date,
          description: `Reembolso de ${purchase.supplierName} por la devolución ${document.number}`,
        });
        newPaidAmount = Math.max(0, purchase.paidAmount - total);
      } else if (payable) {
        const reduced = Math.min(total, payable.remainingAmount);
        tx.set(
          refs.payable(payable.id),
          {
            originalAmount: payable.originalAmount - reduced,
            remainingAmount: payable.remainingAmount - reduced,
            status: payable.remainingAmount - reduced <= 0 ? 'PAID' : payable.status,
            updatedAt: nowIso(),
            updatedBy: ctx.actor.userId,
          },
          { merge: true },
        );
        if (supplier) {
          bumpPartyStats(tx, ctx.actor, 'supplier', supplier.id, supplier.stats, {
            outstandingBalance: -reduced,
          });
        }
      }

      const updatedItems = purchase.items.map((item) => {
        const line = lines.find((l) => l.item.productId === item.productId);
        if (!line) return item;
        return { ...item, returnedQuantity: (item.returnedQuantity ?? 0) + line.scaledQty };
      });
      const fullyReturned = updatedItems.every((i) => (i.returnedQuantity ?? 0) >= i.quantity);
      const newTotal = purchase.total - total;

      tx.set(
        refs.purchase(purchase.id),
        {
          items: updatedItems,
          returnedAmount: purchase.returnedAmount + total,
          paidAmount: newPaidAmount,
          dueAmount: Math.max(0, newTotal - newPaidAmount),
          paymentStatus: derivePaymentStatus(newTotal, newPaidAmount),
          status: fullyReturned ? 'RETURNED' : purchase.status,
          updatedAt: nowIso(),
          updatedBy: ctx.actor.userId,
        },
        { merge: true },
      );

      if (supplier) {
        bumpPartyStats(tx, ctx.actor, 'supplier', supplier.id, supplier.stats, {
          totalAmount: -total,
        });
      }

      auditInTransaction(tx, ctx.actor, {
        action: 'RETURN',
        module: 'PURCHASES',
        entityType: 'return',
        entityId: ref.id,
        entityLabel: document.number,
        after: { purchase: purchase.number, total, mode: input.refundMode },
        metadata: { reason: input.reason },
      });

      const result: ReturnResult = { returnId: ref.id, number: document.number, total };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },
};

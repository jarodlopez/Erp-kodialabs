import 'server-only';

/**
 * Servicio de caja y bancos: alta de cuentas, transferencias internas,
 * ajustes de saldo y cobros/pagos directos sobre cuentas por cobrar y pagar.
 *
 * Una transferencia interna genera DOS asientos (salida en la cuenta origen y
 * entrada en la cuenta destino) unidos por el mismo `transferId`, y su tipo
 * (`TRANSFER_IN` / `TRANSFER_OUT`) queda excluido del cálculo de ingresos y
 * gastos operativos: mover dinero entre cuentas propias no es ni ingreso ni
 * egreso.
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { toMinorUnits } from '@/lib/money';
import { nowIso, parseDate } from '@/lib/repositories/base';
import { newDoc, refs } from '@/lib/repositories/refs';
import { auditInTransaction } from './audit';
import {
  applyToPayable,
  applyToReceivable,
  bumpPartyStats,
  postLedgerEntry,
  writePayment,
} from './finance';
import { guardIdempotency, reserveNumber, runTransaction } from './transaction';
import type { ActorContext, Id } from '@/types/common';
import type {
  AccountPayable,
  AccountReceivable,
  FinancialAccount,
  FinancialAccountType,
  PaymentMethod,
  Transfer,
} from '@/types/finance';
import type { Settings } from '@/types/organization';
import type { Customer, Supplier } from '@/types/parties';
import type { Sale } from '@/types/sales';
import type { Purchase } from '@/types/purchases';
import { derivePaymentStatus, deriveSaleStatus, derivePurchaseStatus } from '@/lib/state-machines';

export interface TreasuryContext {
  actor: ActorContext;
  actorName: string;
  settings: Settings;
}

export interface CreateAccountInput {
  name: string;
  type: FinancialAccountType;
  bankName?: string | null;
  accountNumber?: string | null;
  initialBalance: number;
  isDefault?: boolean;
  notes?: string | null;
}

export const treasuryService = {
  /** Crea una cuenta financiera y su asiento de saldo inicial. */
  async createAccount(ctx: TreasuryContext, input: CreateAccountInput): Promise<{ accountId: Id }> {
    return runTransaction(async (tx) => {
      const initialBalance = toMinorUnits(input.initialBalance);
      if (initialBalance < 0) {
        throw errors.validation('El saldo inicial no puede ser negativo.');
      }

      const ref = newDoc(COLLECTIONS.FINANCIAL_ACCOUNTS);
      const account: FinancialAccount = {
        id: ref.id,
        organizationId: ctx.actor.organizationId,
        name: input.name.trim(),
        type: input.type,
        currency: ctx.settings.currency,
        bankName: input.bankName ?? null,
        accountNumber: input.accountNumber ?? null,
        initialBalance,
        currentBalance: initialBalance,
        isDefault: Boolean(input.isDefault),
        status: 'ACTIVE',
        notes: input.notes ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      };

      tx.create(ref, account);

      if (initialBalance > 0) {
        postLedgerEntry(tx, {
          actor: ctx.actor,
          actorName: ctx.actorName,
          account: { ...account, currentBalance: 0 },
          currentBalance: 0,
          amount: initialBalance,
          direction: 'IN',
          type: 'OPENING_BALANCE',
          referenceType: 'ACCOUNT',
          referenceId: ref.id,
          referenceNumber: null,
          date: nowIso(),
          description: `Saldo inicial de la cuenta ${account.name}`,
        });
      }

      auditInTransaction(tx, ctx.actor, {
        action: 'CREATE',
        module: 'FINANCE',
        entityType: 'financialAccount',
        entityId: ref.id,
        entityLabel: account.name,
        after: { name: account.name, type: account.type, initialBalance },
      });

      return { accountId: ref.id };
    });
  },

  /** Transferencia interna entre dos cuentas propias. */
  async transfer(
    ctx: TreasuryContext,
    input: {
      sourceAccountId: Id;
      destinationAccountId: Id;
      amount: number;
      date: string;
      reference?: string | null;
      notes?: string | null;
    },
    idempotencyKey?: string | null,
  ): Promise<{ transferId: Id; number: string }> {
    if (input.sourceAccountId === input.destinationAccountId) {
      throw errors.validation('La cuenta de origen y la de destino deben ser distintas.');
    }

    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'finance.transfer',
      );
      if (guard.existing) return guard.existing as unknown as { transferId: Id; number: string };

      const [sourceSnap, destSnap] = await Promise.all([
        tx.get(refs.financialAccount(input.sourceAccountId)),
        tx.get(refs.financialAccount(input.destinationAccountId)),
      ]);
      if (!sourceSnap.exists || !destSnap.exists) throw errors.notFound('Cuenta financiera');

      const source = { ...(sourceSnap.data() as FinancialAccount), id: sourceSnap.id };
      const destination = { ...(destSnap.data() as FinancialAccount), id: destSnap.id };
      if (
        source.organizationId !== ctx.actor.organizationId ||
        destination.organizationId !== ctx.actor.organizationId
      ) {
        throw errors.orgMismatch();
      }

      const amount = toMinorUnits(input.amount);
      if (amount <= 0) throw errors.validation('El importe debe ser mayor que cero.');
      if (source.currentBalance < amount) {
        throw errors.insufficientFunds(`La cuenta "${source.name}" no tiene saldo suficiente.`);
      }

      const numbering = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'transfer',
        ctx.settings.numbering.transfer,
      );

      const date = parseDate(input.date);
      const ref = newDoc(COLLECTIONS.TRANSFERS);

      const transfer: Transfer = {
        id: ref.id,
        organizationId: ctx.actor.organizationId,
        number: numbering.number,
        sourceAccountId: source.id,
        sourceAccountName: source.name,
        destinationAccountId: destination.id,
        destinationAccountName: destination.name,
        amount,
        date,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      };

      numbering.commit();
      tx.create(ref, transfer);

      postLedgerEntry(tx, {
        actor: ctx.actor,
        actorName: ctx.actorName,
        account: source,
        currentBalance: source.currentBalance,
        amount,
        direction: 'OUT',
        type: 'TRANSFER_OUT',
        referenceType: 'TRANSFER',
        referenceId: ref.id,
        referenceNumber: transfer.number,
        date,
        description: `Transferencia ${transfer.number} hacia ${destination.name}`,
        transferId: ref.id,
      });

      postLedgerEntry(tx, {
        actor: ctx.actor,
        actorName: ctx.actorName,
        account: destination,
        currentBalance: destination.currentBalance,
        amount,
        direction: 'IN',
        type: 'TRANSFER_IN',
        referenceType: 'TRANSFER',
        referenceId: ref.id,
        referenceNumber: transfer.number,
        date,
        description: `Transferencia ${transfer.number} desde ${source.name}`,
        transferId: ref.id,
      });

      auditInTransaction(tx, ctx.actor, {
        action: 'TRANSFER',
        module: 'FINANCE',
        entityType: 'transfer',
        entityId: ref.id,
        entityLabel: transfer.number,
        after: { from: source.name, to: destination.name, amount },
      });

      const result = { transferId: ref.id, number: transfer.number };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /** Ajuste manual de saldo (conciliación). Siempre queda auditado. */
  async adjustAccount(
    ctx: TreasuryContext,
    input: { accountId: Id; amount: number; direction: 'IN' | 'OUT'; reason: string; date: string },
  ): Promise<void> {
    await runTransaction(async (tx) => {
      const snap = await tx.get(refs.financialAccount(input.accountId));
      if (!snap.exists) throw errors.notFound('Cuenta financiera');
      const account = { ...(snap.data() as FinancialAccount), id: snap.id };
      if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();

      const amount = toMinorUnits(input.amount);
      if (amount <= 0) throw errors.validation('El importe debe ser mayor que cero.');
      if (input.direction === 'OUT' && account.currentBalance < amount) {
        throw errors.insufficientFunds(`La cuenta "${account.name}" no tiene saldo suficiente.`);
      }

      postLedgerEntry(tx, {
        actor: ctx.actor,
        actorName: ctx.actorName,
        account,
        currentBalance: account.currentBalance,
        amount,
        direction: input.direction,
        type: input.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        referenceType: 'ADJUSTMENT',
        referenceId: account.id,
        referenceNumber: null,
        date: parseDate(input.date),
        description: `Ajuste de saldo: ${input.reason}`,
      });

      auditInTransaction(tx, ctx.actor, {
        action: 'ADJUSTMENT',
        module: 'FINANCE',
        entityType: 'financialAccount',
        entityId: account.id,
        entityLabel: account.name,
        before: { balance: account.currentBalance },
        metadata: { amount, direction: input.direction, reason: input.reason },
      });
    });
  },

  /** Cobro directo sobre una cuenta por cobrar (desde el módulo de CxC). */
  async collectReceivable(
    ctx: TreasuryContext,
    input: {
      receivableId: Id;
      accountId: Id;
      amount: number;
      method: PaymentMethod;
      date: string;
      reference?: string | null;
    },
    idempotencyKey?: string | null,
  ): Promise<{ paymentId: Id; remainingAmount: number }> {
    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'receivable.collect',
      );
      if (guard.existing) {
        return guard.existing as unknown as { paymentId: Id; remainingAmount: number };
      }

      const snap = await tx.get(refs.receivable(input.receivableId));
      if (!snap.exists) throw errors.notFound('Cuenta por cobrar');
      const receivable = { ...(snap.data() as AccountReceivable), id: snap.id };
      if (receivable.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (receivable.status === 'CANCELLED') {
        throw errors.invalidTransition('La cuenta por cobrar está anulada.');
      }

      const amount = toMinorUnits(input.amount);
      if (amount <= 0) throw errors.validation('El importe debe ser mayor que cero.');
      if (amount > receivable.remainingAmount) {
        throw errors.validation('El cobro excede el saldo pendiente.');
      }

      const accountSnap = await tx.get(refs.financialAccount(input.accountId));
      if (!accountSnap.exists) throw errors.notFound('Cuenta financiera');
      const account = { ...(accountSnap.data() as FinancialAccount), id: accountSnap.id };
      if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();

      const saleSnap = await tx.get(refs.sale(receivable.referenceId));
      const sale = saleSnap.exists ? { ...(saleSnap.data() as Sale), id: saleSnap.id } : null;

      const customerSnap = await tx.get(refs.customer(receivable.customerId));
      const customer = customerSnap.exists
        ? { ...(customerSnap.data() as Customer), id: customerSnap.id }
        : null;

      const paymentNumber = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'payment',
        ctx.settings.numbering.payment,
      );
      const date = parseDate(input.date);

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
        referenceType: 'RECEIVABLE',
        referenceId: receivable.id,
        referenceNumber: receivable.referenceNumber,
        date,
        description: `Cobro de ${receivable.customerName} (${receivable.referenceNumber})`,
      });

      const payment = writePayment(tx, {
        actor: ctx.actor,
        number: paymentNumber.number,
        type: 'CUSTOMER_PAYMENT',
        referenceType: 'SALE',
        referenceId: receivable.referenceId,
        referenceNumber: receivable.referenceNumber,
        partyId: receivable.customerId,
        partyName: receivable.customerName,
        account,
        amount,
        date,
        method: input.method,
        reference: input.reference ?? null,
      });

      const applied = applyToReceivable(tx, ctx.actor, receivable, amount);

      if (sale) {
        const paidAmount = sale.paidAmount + amount;
        tx.set(
          refs.sale(sale.id),
          {
            paidAmount,
            dueAmount: sale.total - paidAmount,
            paymentStatus: derivePaymentStatus(sale.total, paidAmount),
            status: deriveSaleStatus(sale.total, paidAmount, sale.status),
            updatedAt: nowIso(),
            updatedBy: ctx.actor.userId,
          },
          { merge: true },
        );
      }

      if (customer) {
        bumpPartyStats(tx, ctx.actor, 'customer', customer.id, customer.stats, {
          outstandingBalance: -amount,
        });
      }

      auditInTransaction(tx, ctx.actor, {
        action: 'PAYMENT',
        module: 'FINANCE',
        entityType: 'accountReceivable',
        entityId: receivable.id,
        entityLabel: receivable.referenceNumber,
        after: { amount, remaining: applied.remainingAmount, status: applied.status },
      });

      const result = { paymentId: payment.id, remainingAmount: applied.remainingAmount };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /** Pago directo sobre una cuenta por pagar (desde el módulo de CxP). */
  async payPayable(
    ctx: TreasuryContext,
    input: {
      payableId: Id;
      accountId: Id;
      amount: number;
      method: PaymentMethod;
      date: string;
      reference?: string | null;
    },
    idempotencyKey?: string | null,
  ): Promise<{ paymentId: Id; remainingAmount: number }> {
    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'payable.pay',
      );
      if (guard.existing) {
        return guard.existing as unknown as { paymentId: Id; remainingAmount: number };
      }

      const snap = await tx.get(refs.payable(input.payableId));
      if (!snap.exists) throw errors.notFound('Cuenta por pagar');
      const payable = { ...(snap.data() as AccountPayable), id: snap.id };
      if (payable.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (payable.status === 'CANCELLED') {
        throw errors.invalidTransition('La cuenta por pagar está anulada.');
      }

      const amount = toMinorUnits(input.amount);
      if (amount <= 0) throw errors.validation('El importe debe ser mayor que cero.');
      if (amount > payable.remainingAmount) {
        throw errors.validation('El pago excede el saldo pendiente.');
      }

      const accountSnap = await tx.get(refs.financialAccount(input.accountId));
      if (!accountSnap.exists) throw errors.notFound('Cuenta financiera');
      const account = { ...(accountSnap.data() as FinancialAccount), id: accountSnap.id };
      if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (account.currentBalance < amount) {
        throw errors.insufficientFunds(`La cuenta "${account.name}" no tiene saldo suficiente.`);
      }

      const purchaseSnap =
        payable.referenceType === 'PURCHASE' ? await tx.get(refs.purchase(payable.referenceId)) : null;
      const purchase =
        purchaseSnap && purchaseSnap.exists
          ? { ...(purchaseSnap.data() as Purchase), id: purchaseSnap.id }
          : null;

      const expenseSnap =
        payable.referenceType === 'EXPENSE' ? await tx.get(refs.expense(payable.referenceId)) : null;

      const supplierSnap = await tx.get(refs.supplier(payable.supplierId));
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
        referenceType: 'PAYABLE',
        referenceId: payable.id,
        referenceNumber: payable.referenceNumber,
        date,
        description: `Pago a ${payable.supplierName} (${payable.referenceNumber})`,
      });

      const payment = writePayment(tx, {
        actor: ctx.actor,
        number: paymentNumber.number,
        type: 'SUPPLIER_PAYMENT',
        referenceType: payable.referenceType,
        referenceId: payable.referenceId,
        referenceNumber: payable.referenceNumber,
        partyId: payable.supplierId,
        partyName: payable.supplierName,
        account,
        amount,
        date,
        method: input.method,
        reference: input.reference ?? null,
      });

      const applied = applyToPayable(tx, ctx.actor, payable, amount);

      if (purchase) {
        const paidAmount = purchase.paidAmount + amount;
        tx.set(
          refs.purchase(purchase.id),
          {
            paidAmount,
            dueAmount: purchase.total - paidAmount,
            paymentStatus: derivePaymentStatus(purchase.total, paidAmount),
            status: derivePurchaseStatus(purchase.total, paidAmount, purchase.status),
            updatedAt: nowIso(),
            updatedBy: ctx.actor.userId,
          },
          { merge: true },
        );
      }

      if (expenseSnap && expenseSnap.exists) {
        const expense = expenseSnap.data() as { total: number; paidAmount: number };
        const paidAmount = expense.paidAmount + amount;
        tx.set(
          refs.expense(payable.referenceId),
          {
            paidAmount,
            dueAmount: expense.total - paidAmount,
            paymentStatus: paidAmount >= expense.total ? 'PAID' : 'PARTIAL',
            updatedAt: nowIso(),
            updatedBy: ctx.actor.userId,
          },
          { merge: true },
        );
      }

      if (supplier) {
        bumpPartyStats(tx, ctx.actor, 'supplier', supplier.id, supplier.stats, {
          outstandingBalance: -amount,
        });
      }

      auditInTransaction(tx, ctx.actor, {
        action: 'PAYMENT',
        module: 'FINANCE',
        entityType: 'accountPayable',
        entityId: payable.id,
        entityLabel: payable.referenceNumber,
        after: { amount, remaining: applied.remainingAmount, status: applied.status },
      });

      const result = { paymentId: payment.id, remainingAmount: applied.remainingAmount };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },
};

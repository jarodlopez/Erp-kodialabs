import 'server-only';

/**
 * Servicio de gastos y gastos recurrentes.
 *
 * Un gasto pagado de inmediato genera su asiento de salida en el libro mayor;
 * un gasto a crédito genera una cuenta por pagar. Ambas rutas son atómicas.
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { applyRate, toMinorUnits } from '@/lib/money';
import { nowIso, parseDate } from '@/lib/repositories/base';
import { newDoc, refs } from '@/lib/repositories/refs';
import { auditInTransaction } from './audit';
import { applyToPayable, bumpPartyStats, postLedgerEntry, writePayable, writePayment } from './finance';
import { guardIdempotency, reserveNumber, runTransaction } from './transaction';
import type { ActorContext, Id } from '@/types/common';
import type { CreateExpenseInput, Expense, ExpenseCategory, RecurringExpense } from '@/types/expenses';
import type { AccountPayable, FinancialAccount, PaymentMethod } from '@/types/finance';
import type { Settings } from '@/types/organization';
import type { Supplier } from '@/types/parties';

export interface ExpenseServiceContext {
  actor: ActorContext;
  actorName: string;
  settings: Settings;
}

export interface CreateExpenseResult {
  expenseId: Id;
  number: string;
  total: number;
}

export const expenseService = {
  async createExpense(
    ctx: ExpenseServiceContext,
    input: CreateExpenseInput,
    idempotencyKey?: string | null,
  ): Promise<CreateExpenseResult> {
    const date = parseDate(input.date);

    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'expense.create',
      );
      if (guard.existing) return guard.existing as unknown as CreateExpenseResult;

      const categorySnap = await tx.get(refs.expenseCategory(input.categoryId));
      if (!categorySnap.exists) throw errors.notFound('Categoría de gasto');
      const category = { ...(categorySnap.data() as ExpenseCategory), id: categorySnap.id };
      if (category.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();

      let supplier: Supplier | null = null;
      if (input.supplierId) {
        const snap = await tx.get(refs.supplier(input.supplierId));
        if (!snap.exists) throw errors.notFound('Proveedor');
        supplier = { ...(snap.data() as Supplier), id: snap.id };
        if (supplier.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      }

      let account: FinancialAccount | null = null;
      if (input.payNow) {
        if (!input.accountId) {
          throw errors.validation('Selecciona la cuenta desde la que se paga el gasto.');
        }
        const snap = await tx.get(refs.financialAccount(input.accountId));
        if (!snap.exists) throw errors.notFound('Cuenta financiera');
        account = { ...(snap.data() as FinancialAccount), id: snap.id };
        if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      }

      const expenseNumber = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'expense',
        ctx.settings.numbering.expense,
      );
      const paymentNumber = input.payNow
        ? await reserveNumber(tx, ctx.actor.organizationId, 'payment', ctx.settings.numbering.payment)
        : null;

      const amount = toMinorUnits(input.amount);
      if (amount <= 0) throw errors.validation('El importe del gasto debe ser mayor que cero.');

      const taxAmount = applyRate(amount, input.taxRate ?? 0);
      const total = amount + taxAmount;

      if (account && input.payNow && account.currentBalance < total) {
        throw errors.insufficientFunds(
          `La cuenta "${account.name}" no tiene saldo suficiente para este gasto.`,
        );
      }

      const dueDate = input.dueDate ? parseDate(input.dueDate) : date;
      const expenseRef = newDoc(COLLECTIONS.EXPENSES);

      const expense: Expense = {
        id: expenseRef.id,
        organizationId: ctx.actor.organizationId,
        number: expenseNumber.number,
        categoryId: category.id,
        categoryName: category.name,
        description: input.description,
        supplierId: supplier?.id ?? null,
        supplierName: supplier?.name ?? null,
        amount,
        taxAmount,
        total,
        date,
        accountId: account?.id ?? null,
        accountName: account?.name ?? null,
        method: input.method ?? (input.payNow ? 'CASH' : null),
        paymentStatus: input.payNow ? 'PAID' : 'UNPAID',
        paidAmount: input.payNow ? total : 0,
        dueAmount: input.payNow ? 0 : total,
        dueDate: input.payNow ? null : dueDate,
        receiptUrl: input.receiptUrl ?? null,
        receiptPath: input.receiptPath ?? null,
        notes: input.notes ?? null,
        status: 'REGISTERED',
        cancelledAt: null,
        cancelledBy: null,
        recurringExpenseId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      };

      // ------------------------------ ESCRITURAS ------------------------------
      expenseNumber.commit();
      tx.create(expenseRef, expense);

      if (input.payNow && account && paymentNumber) {
        paymentNumber.commit();
        postLedgerEntry(tx, {
          actor: ctx.actor,
          actorName: ctx.actorName,
          account,
          currentBalance: account.currentBalance,
          amount: total,
          direction: 'OUT',
          type: 'EXPENSE',
          referenceType: 'EXPENSE',
          referenceId: expenseRef.id,
          referenceNumber: expense.number,
          date,
          description: `${category.name}: ${input.description}`,
        });
        writePayment(tx, {
          actor: ctx.actor,
          number: paymentNumber.number,
          type: 'EXPENSE_PAYMENT',
          referenceType: 'EXPENSE',
          referenceId: expenseRef.id,
          referenceNumber: expense.number,
          partyId: supplier?.id ?? null,
          partyName: supplier?.name ?? category.name,
          account,
          amount: total,
          date,
          method: input.method ?? 'CASH',
        });
      } else if (supplier) {
        writePayable(tx, {
          actor: ctx.actor,
          supplierId: supplier.id,
          supplierName: supplier.name,
          referenceType: 'EXPENSE',
          referenceId: expenseRef.id,
          referenceNumber: expense.number,
          amount: total,
          paidAmount: 0,
          issueDate: date,
          dueDate,
        });
        bumpPartyStats(tx, ctx.actor, 'supplier', supplier.id, supplier.stats, {
          outstandingBalance: total,
        });
      }

      auditInTransaction(tx, ctx.actor, {
        action: 'CREATE',
        module: 'EXPENSES',
        entityType: 'expense',
        entityId: expenseRef.id,
        entityLabel: expense.number,
        after: { total, category: category.name, paid: input.payNow },
      });

      const result: CreateExpenseResult = {
        expenseId: expenseRef.id,
        number: expense.number,
        total,
      };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /** Paga un gasto que había quedado pendiente. */
  async payExpense(
    ctx: ExpenseServiceContext,
    expenseId: Id,
    input: { accountId: Id; amount: number; method: PaymentMethod; date: string; reference?: string | null },
    idempotencyKey?: string | null,
  ): Promise<{ paymentId: Id; paidAmount: number }> {
    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'expense.pay',
      );
      if (guard.existing) return guard.existing as unknown as { paymentId: Id; paidAmount: number };

      const snap = await tx.get(refs.expense(expenseId));
      if (!snap.exists) throw errors.notFound('Gasto');
      const expense = { ...(snap.data() as Expense), id: snap.id };
      if (expense.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (expense.status === 'CANCELLED') {
        throw errors.invalidTransition('El gasto está anulado.');
      }

      const amount = toMinorUnits(input.amount);
      if (amount <= 0) throw errors.validation('El importe debe ser mayor que cero.');
      if (amount > expense.dueAmount) {
        throw errors.validation('El pago excede el saldo pendiente del gasto.');
      }

      const accountSnap = await tx.get(refs.financialAccount(input.accountId));
      if (!accountSnap.exists) throw errors.notFound('Cuenta financiera');
      const account = { ...(accountSnap.data() as FinancialAccount), id: accountSnap.id };
      if (account.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (account.currentBalance < amount) {
        throw errors.insufficientFunds(`La cuenta "${account.name}" no tiene saldo suficiente.`);
      }

      const payableSnap = await tx.get(
        refs
          .payables()
          .where('organizationId', '==', ctx.actor.organizationId)
          .where('referenceId', '==', expenseId)
          .limit(1),
      );
      const payable = payableSnap.empty
        ? null
        : { ...(payableSnap.docs[0].data() as AccountPayable), id: payableSnap.docs[0].id };

      let supplier: Supplier | null = null;
      if (expense.supplierId) {
        const supSnap = await tx.get(refs.supplier(expense.supplierId));
        if (supSnap.exists) supplier = { ...(supSnap.data() as Supplier), id: supSnap.id };
      }

      const paymentNumber = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'payment',
        ctx.settings.numbering.payment,
      );

      const date = parseDate(input.date);
      const paidAmount = expense.paidAmount + amount;

      paymentNumber.commit();
      postLedgerEntry(tx, {
        actor: ctx.actor,
        actorName: ctx.actorName,
        account,
        currentBalance: account.currentBalance,
        amount,
        direction: 'OUT',
        type: 'EXPENSE',
        referenceType: 'EXPENSE',
        referenceId: expenseId,
        referenceNumber: expense.number,
        date,
        description: `Pago del gasto ${expense.number}`,
      });

      const payment = writePayment(tx, {
        actor: ctx.actor,
        number: paymentNumber.number,
        type: 'EXPENSE_PAYMENT',
        referenceType: 'EXPENSE',
        referenceId: expenseId,
        referenceNumber: expense.number,
        partyId: expense.supplierId,
        partyName: expense.supplierName ?? expense.categoryName,
        account,
        amount,
        date,
        method: input.method,
        reference: input.reference ?? null,
      });

      tx.set(
        refs.expense(expenseId),
        {
          paidAmount,
          dueAmount: expense.total - paidAmount,
          paymentStatus: paidAmount >= expense.total ? 'PAID' : 'PARTIAL',
          accountId: account.id,
          accountName: account.name,
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
        module: 'EXPENSES',
        entityType: 'expense',
        entityId: expenseId,
        entityLabel: expense.number,
        after: { amount, paidAmount },
      });

      const result = { paymentId: payment.id, paidAmount };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },

  /** Anula un gasto y revierte sus efectos financieros. */
  async cancelExpense(ctx: ExpenseServiceContext, expenseId: Id, reason: string): Promise<void> {
    await runTransaction(async (tx) => {
      const snap = await tx.get(refs.expense(expenseId));
      if (!snap.exists) throw errors.notFound('Gasto');
      const expense = { ...(snap.data() as Expense), id: snap.id };
      if (expense.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (expense.status === 'CANCELLED') {
        throw errors.invalidTransition('El gasto ya está anulado.');
      }

      const paymentsSnap = await tx.get(
        refs
          .payments()
          .where('organizationId', '==', ctx.actor.organizationId)
          .where('referenceId', '==', expenseId),
      );
      const payments = paymentsSnap.docs.map((d) => ({
        ...(d.data() as import('@/types/finance').Payment),
        id: d.id,
      }));

      const accountIds = [...new Set(payments.filter((p) => !p.cancelledAt).map((p) => p.accountId))];
      const accountSnaps = await Promise.all(accountIds.map((id) => tx.get(refs.financialAccount(id))));
      const accounts = new Map<string, FinancialAccount>();
      for (const accSnap of accountSnaps) {
        if (accSnap.exists) {
          accounts.set(accSnap.id, { ...(accSnap.data() as FinancialAccount), id: accSnap.id });
        }
      }

      const payableSnap = await tx.get(
        refs
          .payables()
          .where('organizationId', '==', ctx.actor.organizationId)
          .where('referenceId', '==', expenseId)
          .limit(1),
      );

      let supplier: Supplier | null = null;
      if (expense.supplierId) {
        const supSnap = await tx.get(refs.supplier(expense.supplierId));
        if (supSnap.exists) supplier = { ...(supSnap.data() as Supplier), id: supSnap.id };
      }

      // ------------------------------ ESCRITURAS ------------------------------
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
          type: 'ADJUSTMENT_IN',
          referenceType: 'EXPENSE',
          referenceId: expenseId,
          referenceNumber: expense.number,
          date: nowIso(),
          description: `Reversión por anulación del gasto ${expense.number}`,
        });
        runningBalances.set(account.id, result.balanceAfter);
        tx.set(refs.payment(payment.id), { cancelledAt: nowIso(), updatedAt: nowIso() }, { merge: true });
      }

      if (!payableSnap.empty) {
        tx.set(
          refs.payable(payableSnap.docs[0].id),
          { status: 'CANCELLED', remainingAmount: 0, updatedAt: nowIso(), updatedBy: ctx.actor.userId },
          { merge: true },
        );
      }

      if (supplier && expense.dueAmount > 0) {
        bumpPartyStats(tx, ctx.actor, 'supplier', supplier.id, supplier.stats, {
          outstandingBalance: -expense.dueAmount,
        });
      }

      tx.set(
        refs.expense(expenseId),
        {
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          dueAmount: 0,
          cancelledAt: nowIso(),
          cancelledBy: ctx.actor.userId,
          notes: expense.notes ? `${expense.notes}\nAnulado: ${reason}` : `Anulado: ${reason}`,
          updatedAt: nowIso(),
          updatedBy: ctx.actor.userId,
        },
        { merge: true },
      );

      auditInTransaction(tx, ctx.actor, {
        action: 'CANCEL',
        module: 'EXPENSES',
        entityType: 'expense',
        entityId: expenseId,
        entityLabel: expense.number,
        before: { total: expense.total, status: expense.status },
        after: { status: 'CANCELLED' },
        metadata: { reason },
      });
    });
  },
};

/** Calcula la siguiente fecha de un gasto recurrente. */
export function nextRecurringDate(current: string, frequency: RecurringExpense['frequency']): string {
  const date = new Date(current);
  switch (frequency) {
    case 'WEEKLY':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'MONTHLY':
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'QUARTERLY':
      date.setUTCMonth(date.getUTCMonth() + 3);
      break;
    case 'YEARLY':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
  }
  return date.toISOString();
}

import 'server-only';

/**
 * Tareas automáticas del sistema.
 *
 * Se ejecutan desde `/api/cron/daily` (Vercel Cron) y NO dependen de que
 * ningún usuario abra la aplicación:
 *   1. generación de gastos recurrentes vencidos;
 *   2. marcado de cuentas por cobrar y por pagar como vencidas.
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { logError } from '@/lib/errors';
import { applyRate } from '@/lib/money';
import { nowIso } from '@/lib/repositories/base';
import { recurringExpenseRepository } from '@/lib/repositories/documents';
import { db, newDoc, refs } from '@/lib/repositories/refs';
import { deriveReceivableStatus } from '@/lib/state-machines';
import { audit } from './audit';
import { nextRecurringDate } from './expenses';
import { postLedgerEntry, writePayment } from './finance';
import { reserveNumber, runTransaction } from './transaction';
import type { ActorContext } from '@/types/common';
import type { Expense, RecurringExpense } from '@/types/expenses';
import type { AccountPayable, AccountReceivable, FinancialAccount } from '@/types/finance';
import type { Settings } from '@/types/organization';

const SYSTEM_USER = 'system-cron';

function systemActor(organizationId: string): ActorContext {
  return {
    userId: SYSTEM_USER,
    organizationId,
    email: 'sistema@erp',
    role: 'SYSTEM',
    permissions: [],
  };
}

export interface CronResult {
  generatedExpenses: number;
  overdueReceivables: number;
  overduePayables: number;
  errors: string[];
}

/** Genera los gastos recurrentes cuya fecha ya venció. */
async function generateRecurringExpenses(reference: string): Promise<{ count: number; errors: string[] }> {
  const due = await recurringExpenseRepository.listDue(reference, 300);
  const errors: string[] = [];
  let count = 0;

  for (const recurring of due) {
    try {
      if (recurring.endDate && new Date(recurring.endDate).getTime() < Date.now()) {
        await refs
          .recurringExpense(recurring.id)
          .set({ status: 'INACTIVE', updatedAt: nowIso() }, { merge: true });
        continue;
      }

      await createExpenseFromRecurring(recurring);
      count += 1;
    } catch (error) {
      const app = logError('cron.recurringExpense', error);
      errors.push(`${recurring.description}: ${app.message}`);
    }
  }

  return { count, errors };
}

async function createExpenseFromRecurring(recurring: RecurringExpense): Promise<void> {
  const actor = systemActor(recurring.organizationId);

  const settingsSnap = await refs.settings(recurring.organizationId).get();
  const settings = (settingsSnap.data() as Settings | undefined) ?? null;
  const prefix = settings?.numbering?.expense ?? 'EXP';
  const paymentPrefix = settings?.numbering?.payment ?? 'PAY';

  await runTransaction(async (tx) => {
    const recurringSnap = await tx.get(refs.recurringExpense(recurring.id));
    if (!recurringSnap.exists) return;
    const current = { ...(recurringSnap.data() as RecurringExpense), id: recurringSnap.id };

    // Otra ejecución del cron pudo haberlo procesado ya.
    if (new Date(current.nextDate).getTime() > Date.now()) return;

    let account: FinancialAccount | null = null;
    if (current.autoPay && current.accountId) {
      const accountSnap = await tx.get(refs.financialAccount(current.accountId));
      if (accountSnap.exists) {
        account = { ...(accountSnap.data() as FinancialAccount), id: accountSnap.id };
      }
    }

    const expenseNumber = await reserveNumber(tx, current.organizationId, 'expense', prefix);
    const paymentNumber = account
      ? await reserveNumber(tx, current.organizationId, 'payment', paymentPrefix)
      : null;

    const taxAmount = applyRate(current.amount, current.taxRate ?? 0);
    const total = current.amount + taxAmount;
    const date = current.nextDate;
    const canPay = Boolean(account && account.currentBalance >= total);

    const expenseRef = newDoc(COLLECTIONS.EXPENSES);
    const expense: Expense = {
      id: expenseRef.id,
      organizationId: current.organizationId,
      number: expenseNumber.number,
      categoryId: current.categoryId,
      categoryName: current.categoryName,
      description: `${current.description} (recurrente)`,
      supplierId: current.supplierId,
      supplierName: current.supplierName,
      amount: current.amount,
      taxAmount,
      total,
      date,
      accountId: canPay ? account!.id : null,
      accountName: canPay ? account!.name : null,
      method: current.method,
      paymentStatus: canPay ? 'PAID' : 'UNPAID',
      paidAmount: canPay ? total : 0,
      dueAmount: canPay ? 0 : total,
      dueDate: canPay ? null : date,
      receiptUrl: null,
      receiptPath: null,
      notes: 'Generado automáticamente por la tarea programada.',
      status: 'REGISTERED',
      cancelledAt: null,
      cancelledBy: null,
      recurringExpenseId: current.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: SYSTEM_USER,
      updatedBy: SYSTEM_USER,
    };

    expenseNumber.commit();
    tx.create(expenseRef, expense);

    if (canPay && account && paymentNumber) {
      paymentNumber.commit();
      postLedgerEntry(tx, {
        actor,
        actorName: 'Sistema',
        account,
        currentBalance: account.currentBalance,
        amount: total,
        direction: 'OUT',
        type: 'EXPENSE',
        referenceType: 'EXPENSE',
        referenceId: expenseRef.id,
        referenceNumber: expense.number,
        date,
        description: `${current.categoryName}: ${current.description}`,
      });
      // Se registra el documento de Pago (igual que un gasto pagado manualmente),
      // para que al anular el gasto la reversión de caja lo encuentre por
      // `referenceId` y restaure el saldo. Sin esto, la anulación no revertía.
      writePayment(tx, {
        actor,
        number: paymentNumber.number,
        type: 'EXPENSE_PAYMENT',
        referenceType: 'EXPENSE',
        referenceId: expenseRef.id,
        referenceNumber: expense.number,
        partyId: current.supplierId,
        partyName: current.supplierName ?? current.categoryName,
        account,
        amount: total,
        date,
        method: current.method ?? 'CASH',
      });
    }

    tx.set(
      refs.recurringExpense(current.id),
      {
        nextDate: nextRecurringDate(current.nextDate, current.frequency),
        lastGeneratedAt: nowIso(),
        generatedCount: (current.generatedCount ?? 0) + 1,
        updatedAt: nowIso(),
      },
      { merge: true },
    );
  });

  await audit(actor, {
    action: 'CRON',
    module: 'EXPENSES',
    entityType: 'recurringExpense',
    entityId: recurring.id,
    entityLabel: recurring.description,
    metadata: { amount: recurring.amount, frequency: recurring.frequency },
  });
}

/** Marca como vencidos los documentos cuya fecha de vencimiento ya pasó. */
async function markOverdue(
  collection: 'receivable' | 'payable',
  reference: Date,
): Promise<number> {
  const collectionName =
    collection === 'receivable' ? COLLECTIONS.ACCOUNTS_RECEIVABLE : COLLECTIONS.ACCOUNTS_PAYABLE;

  const snap = await db()
    .collection(collectionName)
    .where('status', 'in', ['PENDING', 'PARTIAL'])
    .where('dueDate', '<', reference.toISOString())
    .limit(400)
    .get();

  if (snap.empty) return 0;

  const batch = db().batch();
  let count = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as AccountReceivable | AccountPayable;
    const status = deriveReceivableStatus(
      data.originalAmount,
      data.paidAmount,
      data.dueDate,
      reference,
    );
    if (status === 'OVERDUE') {
      batch.set(doc.ref, { status, updatedAt: nowIso() }, { merge: true });
      count += 1;
    }
  }

  if (count > 0) await batch.commit();
  return count;
}

/** Punto de entrada de la tarea diaria. */
export async function runDailyTasks(): Promise<CronResult> {
  const now = new Date();
  const result: CronResult = {
    generatedExpenses: 0,
    overdueReceivables: 0,
    overduePayables: 0,
    errors: [],
  };

  const recurring = await generateRecurringExpenses(now.toISOString());
  result.generatedExpenses = recurring.count;
  result.errors.push(...recurring.errors);

  try {
    result.overdueReceivables = await markOverdue('receivable', now);
  } catch (error) {
    result.errors.push(logError('cron.overdueReceivables', error).message);
  }

  try {
    result.overduePayables = await markOverdue('payable', now);
  } catch (error) {
    result.errors.push(logError('cron.overduePayables', error).message);
  }

  return result;
}

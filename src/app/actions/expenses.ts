'use server';

import { revalidatePath } from 'next/cache';

import { COLLECTIONS } from '@/lib/firebase/collections';
import { fail, logError, ok, type ActionResult } from '@/lib/errors';
import { toMinorUnits } from '@/lib/money';
import { PERMISSIONS } from '@/lib/rbac';
import { nowIso, parseDate } from '@/lib/repositories/base';
import { expenseCategoryRepository } from '@/lib/repositories/documents';
import { newDoc, refs } from '@/lib/repositories/refs';
import { getActorContext, getOperationContext } from '@/lib/server-context';
import { audit } from '@/lib/services/audit';
import { expenseService } from '@/lib/services/expenses';
import { buildIdempotencyKey } from '@/lib/services/transaction';
import { parseOrThrow } from '@/lib/validation/parse';
import {
  cancelSchema,
  expenseCategorySchema,
  expenseSchema,
  recurringExpenseSchema,
} from '@/lib/validation/schemas';
import type { PaymentMethod } from '@/types/finance';
import type { ExpenseCategory, RecurringExpense } from '@/types/expenses';

function refresh() {
  revalidatePath('/gastos');
  revalidatePath('/finanzas');
  revalidatePath('/');
}

export async function createExpenseAction(
  input: unknown,
): Promise<ActionResult<{ expenseId: string; number: string; total: number }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.EXPENSES_CREATE);
    const data = parseOrThrow(expenseSchema, input);

    const key =
      data.idempotencyKey ??
      buildIdempotencyKey([
        ctx.actor.userId,
        data.categoryId,
        data.description,
        data.amount,
        data.date,
      ]);

    const result = await expenseService.createExpense(ctx, data, key);
    refresh();
    return ok(result);
  } catch (error) {
    logError('expenses.create', error);
    return fail(error);
  }
}

export async function payExpenseAction(input: {
  expenseId: string;
  accountId: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  reference?: string | null;
}): Promise<ActionResult<{ paymentId: string; paidAmount: number }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.EXPENSES_UPDATE);
    const key = buildIdempotencyKey([input.expenseId, input.accountId, input.amount, input.date]);
    const result = await expenseService.payExpense(ctx, input.expenseId, input, key);
    refresh();
    revalidatePath('/cuentas-por-pagar');
    return ok(result);
  } catch (error) {
    logError('expenses.pay', error);
    return fail(error);
  }
}

export async function cancelExpenseAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.EXPENSES_CANCEL);
    const data = parseOrThrow(cancelSchema, input);
    await expenseService.cancelExpense(ctx, data.id, data.reason);
    refresh();
    return ok();
  } catch (error) {
    logError('expenses.cancel', error);
    return fail(error);
  }
}

export async function createExpenseCategoryAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.EXPENSES_CREATE);
    const data = parseOrThrow(expenseCategorySchema, input);

    const ref = newDoc(COLLECTIONS.EXPENSE_CATEGORIES);
    const category: ExpenseCategory = {
      id: ref.id,
      organizationId: actor.organizationId,
      name: data.name,
      description: data.description,
      isSystem: false,
      status: data.status,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: actor.userId,
      updatedBy: actor.userId,
    };
    await ref.create(category);

    await audit(actor, {
      action: 'CREATE',
      module: 'EXPENSES',
      entityType: 'expenseCategory',
      entityId: ref.id,
      entityLabel: data.name,
    });

    revalidatePath('/gastos');
    return ok({ id: ref.id });
  } catch (error) {
    logError('expenses.createCategory', error);
    return fail(error);
  }
}

export async function saveRecurringExpenseAction(
  input: unknown,
  id?: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.EXPENSES_CREATE);
    const data = parseOrThrow(recurringExpenseSchema, input);
    const category = await expenseCategoryRepository.require(actor.organizationId, data.categoryId);

    const ref = id ? refs.recurringExpense(id) : newDoc(COLLECTIONS.RECURRING_EXPENSES);
    const payload: Partial<RecurringExpense> = {
      id: ref.id,
      organizationId: actor.organizationId,
      description: data.description,
      categoryId: category.id,
      categoryName: category.name,
      supplierId: data.supplierId,
      supplierName: null,
      amount: toMinorUnits(data.amount),
      taxRate: data.taxRate,
      frequency: data.frequency,
      nextDate: parseDate(data.nextDate),
      endDate: data.endDate ? parseDate(data.endDate) : null,
      accountId: data.accountId,
      accountName: null,
      method: data.method ?? null,
      autoPay: data.autoPay,
      status: data.status,
      updatedAt: nowIso(),
      updatedBy: actor.userId,
    };

    if (id) {
      await ref.set(payload, { merge: true });
    } else {
      await ref.create({
        ...payload,
        lastGeneratedAt: null,
        generatedCount: 0,
        createdAt: nowIso(),
        createdBy: actor.userId,
      });
    }

    await audit(actor, {
      action: id ? 'UPDATE' : 'CREATE',
      module: 'EXPENSES',
      entityType: 'recurringExpense',
      entityId: ref.id,
      entityLabel: data.description,
      after: { amount: payload.amount, frequency: data.frequency },
    });

    revalidatePath('/gastos/recurrentes');
    return ok({ id: ref.id });
  } catch (error) {
    logError('expenses.saveRecurring', error);
    return fail(error);
  }
}

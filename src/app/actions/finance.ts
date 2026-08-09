'use server';

import { revalidatePath } from 'next/cache';

import { fail, logError, ok, type ActionResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/rbac';
import { getOperationContext } from '@/lib/server-context';
import { treasuryService } from '@/lib/services/treasury';
import { buildIdempotencyKey } from '@/lib/services/transaction';
import { parseOrThrow } from '@/lib/validation/parse';
import {
  accountAdjustmentSchema,
  accountSchema,
  collectReceivableSchema,
  payPayableSchema,
  transferSchema,
} from '@/lib/validation/schemas';
import type { PaymentMethod } from '@/types/finance';

function refresh() {
  revalidatePath('/finanzas');
  revalidatePath('/caja-y-bancos');
  revalidatePath('/');
}

export async function createAccountAction(input: unknown): Promise<ActionResult<{ accountId: string }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.FINANCE_CREATE);
    const data = parseOrThrow(accountSchema, input);
    const result = await treasuryService.createAccount(ctx, data);
    refresh();
    return ok(result);
  } catch (error) {
    logError('finance.createAccount', error);
    return fail(error);
  }
}

export async function transferAction(
  input: unknown,
): Promise<ActionResult<{ transferId: string; number: string }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.FINANCE_TRANSFER);
    const data = parseOrThrow(transferSchema, input);
    const key =
      data.idempotencyKey ??
      buildIdempotencyKey([
        data.sourceAccountId,
        data.destinationAccountId,
        data.amount,
        data.date,
      ]);
    const result = await treasuryService.transfer(ctx, data, key);
    refresh();
    return ok(result);
  } catch (error) {
    logError('finance.transfer', error);
    return fail(error);
  }
}

export async function adjustAccountAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.FINANCE_ADJUST);
    const data = parseOrThrow(accountAdjustmentSchema, input);
    await treasuryService.adjustAccount(ctx, data);
    refresh();
    return ok();
  } catch (error) {
    logError('finance.adjust', error);
    return fail(error);
  }
}

export async function collectReceivableAction(
  input: unknown,
): Promise<ActionResult<{ paymentId: string; remainingAmount: number }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.RECEIVABLES_COLLECT);
    const data = parseOrThrow(collectReceivableSchema, input);
    const key =
      data.idempotencyKey ??
      buildIdempotencyKey([data.receivableId, data.accountId, data.amount, data.date]);

    const result = await treasuryService.collectReceivable(
      ctx,
      { ...data, method: data.method as PaymentMethod },
      key,
    );

    refresh();
    revalidatePath('/cuentas-por-cobrar');
    revalidatePath('/ventas');
    return ok(result);
  } catch (error) {
    logError('finance.collect', error);
    return fail(error);
  }
}

export async function payPayableAction(
  input: unknown,
): Promise<ActionResult<{ paymentId: string; remainingAmount: number }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.PAYABLES_PAY);
    const data = parseOrThrow(payPayableSchema, input);
    const key =
      data.idempotencyKey ??
      buildIdempotencyKey([data.payableId, data.accountId, data.amount, data.date]);

    const result = await treasuryService.payPayable(
      ctx,
      { ...data, method: data.method as PaymentMethod },
      key,
    );

    refresh();
    revalidatePath('/cuentas-por-pagar');
    revalidatePath('/compras');
    return ok(result);
  } catch (error) {
    logError('finance.pay', error);
    return fail(error);
  }
}

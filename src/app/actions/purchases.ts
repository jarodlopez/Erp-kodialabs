'use server';

import { revalidatePath } from 'next/cache';

import { fail, logError, ok, type ActionResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/rbac';
import { getOperationContext } from '@/lib/server-context';
import { purchaseService, type CreatePurchaseResult } from '@/lib/services/purchases';
import { buildIdempotencyKey } from '@/lib/services/transaction';
import { parseOrThrow } from '@/lib/validation/parse';
import { cancelSchema, purchasePaymentSchema, purchaseSchema } from '@/lib/validation/schemas';
import type { PaymentMethod } from '@/types/finance';
import type { CreatePurchaseInput } from '@/types/purchases';

function refresh(purchaseId?: string) {
  revalidatePath('/compras');
  revalidatePath('/inventario');
  revalidatePath('/finanzas');
  revalidatePath('/');
  if (purchaseId) revalidatePath(`/compras/${purchaseId}`);
}

export async function createPurchaseAction(
  input: unknown,
  options: { receive: boolean },
): Promise<ActionResult<CreatePurchaseResult>> {
  try {
    const permission = options.receive
      ? PERMISSIONS.PURCHASES_RECEIVE
      : PERMISSIONS.PURCHASES_CREATE;
    const ctx = await getOperationContext(permission);
    const data = parseOrThrow(purchaseSchema, input);

    const idempotencyKey =
      data.idempotencyKey ??
      buildIdempotencyKey([
        ctx.actor.userId,
        data.supplierId,
        data.invoiceNumber,
        data.date,
        JSON.stringify(data.items),
      ]);

    const result = await purchaseService.createPurchase(
      ctx,
      data as unknown as CreatePurchaseInput,
      { receive: options.receive, idempotencyKey },
    );

    refresh(result.purchaseId);
    return ok(result);
  } catch (error) {
    logError('purchases.create', error);
    return fail(error);
  }
}

export async function receivePurchaseAction(
  purchaseId: string,
  payment: { accountId: string; amount: number; method: PaymentMethod; reference?: string | null } | null,
  idempotencyKey?: string,
): Promise<ActionResult<CreatePurchaseResult>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.PURCHASES_RECEIVE);
    const key = idempotencyKey ?? buildIdempotencyKey([purchaseId, 'receive', payment?.amount ?? 0]);
    const result = await purchaseService.receivePurchase(ctx, purchaseId, payment, key);
    refresh(purchaseId);
    return ok(result);
  } catch (error) {
    logError('purchases.receive', error);
    return fail(error);
  }
}

export async function registerPurchasePaymentAction(
  input: unknown,
): Promise<ActionResult<{ paymentId: string; number: string; paidAmount: number }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.PAYABLES_PAY);
    const data = parseOrThrow(purchasePaymentSchema, input);

    const key =
      data.idempotencyKey ??
      buildIdempotencyKey([data.purchaseId, data.accountId, data.amount, data.date, data.method]);

    const result = await purchaseService.registerPayment(
      ctx,
      data.purchaseId,
      {
        accountId: data.accountId,
        amount: data.amount,
        method: data.method as PaymentMethod,
        date: data.date,
        reference: data.reference,
        notes: data.notes,
      },
      key,
    );

    refresh(data.purchaseId);
    revalidatePath('/cuentas-por-pagar');
    return ok(result);
  } catch (error) {
    logError('purchases.payment', error);
    return fail(error);
  }
}

export async function cancelPurchaseAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.PURCHASES_CANCEL);
    const data = parseOrThrow(cancelSchema, input);
    await purchaseService.cancelPurchase(ctx, data.id, data.reason);
    refresh(data.id);
    revalidatePath('/cuentas-por-pagar');
    return ok();
  } catch (error) {
    logError('purchases.cancel', error);
    return fail(error);
  }
}

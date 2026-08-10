'use server';

import { revalidatePath } from 'next/cache';

import { fail, logError, ok, type ActionResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/rbac';
import { getOperationContext } from '@/lib/server-context';
import { saleService, type CreateSaleResult } from '@/lib/services/sales';
import { buildIdempotencyKey } from '@/lib/services/transaction';
import { parseOrThrow } from '@/lib/validation/parse';
import { cancelSchema, salePaymentSchema, saleSchema } from '@/lib/validation/schemas';
import type { PaymentMethod } from '@/types/finance';
import type { CreateSaleInput } from '@/types/sales';

function refresh(saleId?: string) {
  revalidatePath('/ventas');
  revalidatePath('/');
  revalidatePath('/inventario');
  revalidatePath('/finanzas');
  if (saleId) revalidatePath(`/ventas/${saleId}`);
}

/**
 * Crea y (opcionalmente) confirma una venta.
 * La clave de idempotencia evita que un doble clic genere dos ventas.
 */
export async function createSaleAction(
  input: unknown,
  options: { confirm: boolean },
): Promise<ActionResult<CreateSaleResult>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.SALES_CREATE);
    const data = parseOrThrow(saleSchema, input);

    const idempotencyKey =
      data.idempotencyKey ??
      buildIdempotencyKey([
        ctx.actor.userId,
        data.customerId,
        data.date,
        data.type,
        JSON.stringify(data.items),
        data.globalDiscount,
      ]);

    const result = await saleService.createSale(
      ctx,
      data as unknown as CreateSaleInput,
      { confirm: options.confirm, idempotencyKey },
    );

    refresh(result.saleId);
    return ok(result);
  } catch (error) {
    logError('sales.create', error);
    return fail(error);
  }
}

export async function confirmSaleAction(
  saleId: string,
  payment: { accountId: string; amount: number; method: PaymentMethod; reference?: string | null } | null,
  idempotencyKey?: string,
): Promise<ActionResult<CreateSaleResult>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.SALES_CREATE);
    const key = idempotencyKey ?? buildIdempotencyKey([saleId, 'confirm', payment?.amount ?? 0]);
    const result = await saleService.confirmSale(ctx, saleId, payment, key);
    refresh(saleId);
    return ok(result);
  } catch (error) {
    logError('sales.confirm', error);
    return fail(error);
  }
}

export async function registerSalePaymentAction(
  input: unknown,
): Promise<ActionResult<{ paymentId: string; number: string; paidAmount: number }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.RECEIVABLES_COLLECT);
    const data = parseOrThrow(salePaymentSchema, input);

    const key =
      data.idempotencyKey ??
      buildIdempotencyKey([data.saleId, data.accountId, data.amount, data.date, data.method]);

    const result = await saleService.registerPayment(
      ctx,
      data.saleId,
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

    refresh(data.saleId);
    revalidatePath('/cuentas-por-cobrar');
    return ok(result);
  } catch (error) {
    logError('sales.payment', error);
    return fail(error);
  }
}

export async function cancelSaleAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.SALES_CANCEL);
    const data = parseOrThrow(cancelSchema, input);
    await saleService.cancelSale(ctx, data.id, data.reason);
    refresh(data.id);
    revalidatePath('/cuentas-por-cobrar');
    return ok();
  } catch (error) {
    logError('sales.cancel', error);
    return fail(error);
  }
}

/** Elimina un borrador (solo ventas en estado DRAFT). */
export async function deleteSaleDraftAction(saleId: string): Promise<ActionResult<undefined>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.SALES_CANCEL);
    await saleService.deleteDraft(ctx, saleId);
    refresh();
    return ok();
  } catch (error) {
    logError('sales.deleteDraft', error);
    return fail(error);
  }
}

'use server';

import { revalidatePath } from 'next/cache';

import { fail, logError, ok, type ActionResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/rbac';
import { getOperationContext } from '@/lib/server-context';
import { inventoryOpsService } from '@/lib/services/inventory-ops';
import { returnService } from '@/lib/services/returns';
import { buildIdempotencyKey } from '@/lib/services/transaction';
import { parseOrThrow } from '@/lib/validation/parse';
import {
  inventoryAdjustmentSchema,
  inventoryTransferSchema,
  returnSchema,
} from '@/lib/validation/schemas';

function refresh(productId?: string) {
  revalidatePath('/inventario');
  revalidatePath('/');
  if (productId) revalidatePath(`/inventario/${productId}`);
}

export async function adjustInventoryAction(
  input: unknown,
): Promise<ActionResult<{ movementId: string; newStock: number }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.INVENTORY_ADJUST);
    const data = parseOrThrow(inventoryAdjustmentSchema, input);
    const key =
      data.idempotencyKey ??
      buildIdempotencyKey([
        ctx.actor.userId,
        data.productId,
        data.quantity,
        data.direction,
        data.reason,
      ]);
    const result = await inventoryOpsService.adjust(ctx, data, key);
    refresh(data.productId);
    return ok(result);
  } catch (error) {
    logError('inventory.adjust', error);
    return fail(error);
  }
}

export async function transferInventoryAction(
  input: unknown,
): Promise<ActionResult<{ transferId: string; number: string }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.INVENTORY_TRANSFER);
    const data = parseOrThrow(inventoryTransferSchema, input);
    const key =
      data.idempotencyKey ??
      buildIdempotencyKey([
        ctx.actor.userId,
        data.productId,
        data.sourceWarehouseId,
        data.destinationWarehouseId,
        data.quantity,
      ]);
    const result = await inventoryOpsService.transfer(ctx, data, key);
    refresh(data.productId);
    return ok(result);
  } catch (error) {
    logError('inventory.transfer', error);
    return fail(error);
  }
}

export async function createSaleReturnAction(
  input: unknown,
): Promise<ActionResult<{ returnId: string; number: string; total: number }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.SALES_RETURN);
    const data = parseOrThrow(returnSchema, input);
    const key =
      data.idempotencyKey ??
      buildIdempotencyKey([data.referenceId, 'sale-return', JSON.stringify(data.items), data.date]);
    const result = await returnService.createSaleReturn(ctx, data, key);
    refresh();
    revalidatePath('/ventas');
    revalidatePath('/devoluciones');
    return ok(result);
  } catch (error) {
    logError('returns.sale', error);
    return fail(error);
  }
}

export async function createPurchaseReturnAction(
  input: unknown,
): Promise<ActionResult<{ returnId: string; number: string; total: number }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.PURCHASES_RETURN);
    const data = parseOrThrow(returnSchema, input);
    const key =
      data.idempotencyKey ??
      buildIdempotencyKey([
        data.referenceId,
        'purchase-return',
        JSON.stringify(data.items),
        data.date,
      ]);
    const result = await returnService.createPurchaseReturn(ctx, data, key);
    refresh();
    revalidatePath('/compras');
    revalidatePath('/devoluciones');
    return ok(result);
  } catch (error) {
    logError('returns.purchase', error);
    return fail(error);
  }
}

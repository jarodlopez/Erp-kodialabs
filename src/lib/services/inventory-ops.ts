import 'server-only';

/**
 * Operaciones manuales de inventario: ajustes y transferencias entre bodegas.
 * Toda modificación manual exige motivo y queda auditada.
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { toMinorUnits, toScaledQty } from '@/lib/money';
import { nowIso } from '@/lib/repositories/base';
import { newDoc, refs } from '@/lib/repositories/refs';
import { auditInTransaction } from './audit';
import { writeStockMovement } from './inventory';
import { guardIdempotency, reserveNumber, runTransaction } from './transaction';
import type { ActorContext, Id } from '@/types/common';
import type { Product } from '@/types/catalog';
import type { InventoryAdjustmentInput, InventoryTransfer, InventoryTransferInput } from '@/types/inventory';
import type { Settings } from '@/types/organization';

export interface InventoryOpsContext {
  actor: ActorContext;
  actorName: string;
  settings: Settings;
  defaultWarehouseId: Id;
}

export const inventoryOpsService = {
  /** Ajuste manual de existencias (entrada o salida) con motivo obligatorio. */
  async adjust(
    ctx: InventoryOpsContext,
    input: InventoryAdjustmentInput,
    idempotencyKey?: string | null,
  ): Promise<{ movementId: Id; newStock: number }> {
    if (!input.reason || input.reason.trim().length < 3) {
      throw errors.validation('Indica el motivo del ajuste.');
    }

    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'inventory.adjust',
      );
      if (guard.existing) return guard.existing as unknown as { movementId: Id; newStock: number };

      const snap = await tx.get(refs.product(input.productId));
      if (!snap.exists) throw errors.notFound('Producto');
      const product = { ...(snap.data() as Product), id: snap.id };
      if (product.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();
      if (!product.tracksInventory) {
        throw errors.validation('Este producto no controla inventario.');
      }

      const quantity = toScaledQty(input.quantity);
      if (quantity <= 0) throw errors.validation('La cantidad debe ser mayor que cero.');

      const unitCost =
        input.unitCost !== undefined ? toMinorUnits(input.unitCost) : product.averageCost ?? 0;

      const result = writeStockMovement(tx, {
        actor: ctx.actor,
        actorName: ctx.actorName,
        product,
        quantity,
        type: input.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        unitCost,
        referenceType: 'ADJUSTMENT',
        referenceId: null,
        referenceNumber: null,
        reason: input.reason,
        warehouseId: input.warehouseId ?? ctx.defaultWarehouseId,
        // Un ajuste de entrada también actualiza el costo promedio si trae costo.
        recalculateAverageCost: input.direction === 'IN' && input.unitCost !== undefined,
      });

      auditInTransaction(tx, ctx.actor, {
        action: 'ADJUSTMENT',
        module: 'INVENTORY',
        entityType: 'product',
        entityId: product.id,
        entityLabel: `${product.sku} — ${product.name}`,
        before: { stock: result.previousStock },
        after: { stock: result.newStock },
        metadata: { direction: input.direction, quantity, reason: input.reason },
      });

      const payload = { movementId: result.movementId, newStock: result.newStock };
      guard.commit(payload as unknown as Record<string, unknown>);
      return payload;
    });
  },

  /**
   * Transferencia entre bodegas: una sola operación lógica que genera dos
   * movimientos (salida en origen, entrada en destino). El stock total del
   * producto no cambia.
   */
  async transfer(
    ctx: InventoryOpsContext,
    input: InventoryTransferInput,
    idempotencyKey?: string | null,
  ): Promise<{ transferId: Id; number: string }> {
    if (input.sourceWarehouseId === input.destinationWarehouseId) {
      throw errors.validation('La bodega de origen y la de destino deben ser distintas.');
    }

    return runTransaction(async (tx) => {
      const guard = await guardIdempotency(
        tx,
        ctx.actor.organizationId,
        idempotencyKey,
        'inventory.transfer',
      );
      if (guard.existing) return guard.existing as unknown as { transferId: Id; number: string };

      const productSnap = await tx.get(refs.product(input.productId));
      if (!productSnap.exists) throw errors.notFound('Producto');
      const product = { ...(productSnap.data() as Product), id: productSnap.id };
      if (product.organizationId !== ctx.actor.organizationId) throw errors.orgMismatch();

      const [sourceWh, destWh] = await Promise.all([
        tx.get(refs.warehouse(input.sourceWarehouseId)),
        tx.get(refs.warehouse(input.destinationWarehouseId)),
      ]);
      if (!sourceWh.exists || !destWh.exists) throw errors.notFound('Bodega');

      const quantity = toScaledQty(input.quantity);
      if (quantity <= 0) throw errors.validation('La cantidad debe ser mayor que cero.');

      // Existencias específicas de la bodega de origen.
      const sourceStockSnap = await tx.get(
        refs.productStock(ctx.actor.organizationId, product.id, input.sourceWarehouseId),
      );
      const sourceQty = sourceStockSnap.exists
        ? Number((sourceStockSnap.data() as { quantity?: number }).quantity ?? 0)
        : 0;
      if (sourceQty < quantity) {
        throw errors.insufficientStock(
          `La bodega de origen solo tiene ${sourceQty / 1000} unidades de "${product.name}".`,
        );
      }

      const numbering = await reserveNumber(
        tx,
        ctx.actor.organizationId,
        'inventoryTransfer',
        ctx.settings.numbering.transfer,
      );

      // ------------------------------ ESCRITURAS ------------------------------
      numbering.commit();

      const outResult = writeStockMovement(tx, {
        actor: ctx.actor,
        actorName: ctx.actorName,
        product,
        quantity,
        type: 'TRANSFER_OUT',
        unitCost: product.averageCost ?? 0,
        referenceType: 'TRANSFER',
        referenceId: null,
        referenceNumber: numbering.number,
        reason: input.reason,
        warehouseId: input.sourceWarehouseId,
      });

      // La entrada parte del stock ya actualizado por la salida.
      writeStockMovement(tx, {
        actor: ctx.actor,
        actorName: ctx.actorName,
        product: { ...product, stock: outResult.newStock },
        quantity,
        type: 'TRANSFER_IN',
        unitCost: product.averageCost ?? 0,
        referenceType: 'TRANSFER',
        referenceId: null,
        referenceNumber: numbering.number,
        reason: input.reason,
        warehouseId: input.destinationWarehouseId,
      });

      const ref = newDoc(COLLECTIONS.INVENTORY_TRANSFERS);
      const transfer: InventoryTransfer = {
        id: ref.id,
        organizationId: ctx.actor.organizationId,
        number: numbering.number,
        productId: product.id,
        productName: product.name,
        sourceWarehouseId: input.sourceWarehouseId,
        destinationWarehouseId: input.destinationWarehouseId,
        quantity,
        reason: input.reason,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      };
      tx.create(ref, transfer);

      auditInTransaction(tx, ctx.actor, {
        action: 'TRANSFER',
        module: 'INVENTORY',
        entityType: 'inventoryTransfer',
        entityId: ref.id,
        entityLabel: transfer.number,
        after: {
          product: product.name,
          quantity,
          from: input.sourceWarehouseId,
          to: input.destinationWarehouseId,
        },
      });

      const result = { transferId: ref.id, number: transfer.number };
      guard.commit(result as unknown as Record<string, unknown>);
      return result;
    });
  },
};

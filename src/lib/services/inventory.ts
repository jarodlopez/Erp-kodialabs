import 'server-only';

/**
 * Servicio de inventario.
 *
 * REGLA INVIOLABLE: el campo `product.stock` NUNCA se modifica sin crear, en
 * la misma transacción, el `inventoryMovement` que lo justifica. Por eso la
 * única forma de tocar existencias en todo el sistema es `writeStockMovement`.
 *
 * Las funciones de este módulo son de FASE DE ESCRITURA: reciben los datos ya
 * leídos por el servicio que las invoca, porque Firestore exige que todas las
 * lecturas de una transacción ocurran antes de la primera escritura.
 */
import { FieldValue, type Transaction } from 'firebase-admin/firestore';

import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { multiplyByQty, toScaledQty, weightedAverageCost } from '@/lib/money';
import { newDoc, refs } from '@/lib/repositories/refs';
import { nowIso } from '@/lib/repositories/base';
import type { ActorContext, Id, Quantity } from '@/types/common';
import type { Product } from '@/types/catalog';
import type { InventoryMovement, InventoryMovementType, ReferenceType } from '@/types/inventory';
import { isInbound } from '@/types/inventory';

export interface StockMovementInput {
  actor: ActorContext;
  actorName: string;
  product: Product;
  /** Cantidad absoluta escalada (siempre positiva). */
  quantity: Quantity;
  type: InventoryMovementType;
  /** Costo unitario del movimiento en centavos. */
  unitCost: number;
  referenceType: ReferenceType;
  referenceId: Id | null;
  referenceNumber: string | null;
  reason?: string | null;
  warehouseId: Id;
  /** Permite dejar el stock en negativo (según configuración de la organización). */
  allowNegativeStock?: boolean;
  /** Recalcula el costo promedio ponderado (solo entradas de compra). */
  recalculateAverageCost?: boolean;
  /** Actualiza también `product.cost` (último costo de compra). */
  updateLastCost?: boolean;
}

export interface StockMovementResult {
  movementId: Id;
  previousStock: Quantity;
  newStock: Quantity;
  newAverageCost: number;
}

/**
 * Aplica un movimiento de inventario dentro de una transacción.
 * Actualiza: `products/{id}` (stock, costo promedio, bandera de stock bajo),
 * `productStock/{org_prod_wh}` y crea `inventoryMovements/{id}`.
 */
export function writeStockMovement(
  tx: Transaction,
  input: StockMovementInput,
): StockMovementResult {
  const { product, quantity, type } = input;

  if (quantity <= 0) {
    throw errors.validation('La cantidad del movimiento debe ser mayor que cero.');
  }

  const inbound = isInbound(type);
  const signedQuantity = inbound ? quantity : -quantity;
  const previousStock = product.stock ?? 0;
  const newStock = previousStock + signedQuantity;

  if (!inbound && newStock < 0 && !input.allowNegativeStock) {
    throw errors.insufficientStock(
      `No hay suficiente inventario de "${product.name}". Disponible: ${previousStock / 1000}.`,
    );
  }

  // Costo promedio ponderado: solo se recalcula al recibir mercadería.
  const newAverageCost =
    input.recalculateAverageCost && inbound
      ? weightedAverageCost(previousStock, product.averageCost ?? 0, quantity, input.unitCost)
      : product.averageCost ?? 0;

  const minimum = product.minimumStock ?? 0;
  const productUpdate: Record<string, unknown> = {
    stock: newStock,
    isLowStock: newStock <= minimum,
    averageCost: newAverageCost,
    updatedAt: nowIso(),
    updatedBy: input.actor.userId,
  };
  if (input.updateLastCost) {
    productUpdate.cost = input.unitCost;
  }

  tx.set(refs.product(product.id), productUpdate, { merge: true });

  // Existencias por bodega: `increment` no requiere lectura previa.
  tx.set(
    refs.productStock(input.actor.organizationId, product.id, input.warehouseId),
    {
      organizationId: input.actor.organizationId,
      productId: product.id,
      warehouseId: input.warehouseId,
      quantity: FieldValue.increment(signedQuantity),
      updatedAt: nowIso(),
    },
    { merge: true },
  );

  const movementRef = newDoc(COLLECTIONS.INVENTORY_MOVEMENTS);
  const movement: InventoryMovement = {
    id: movementRef.id,
    organizationId: input.actor.organizationId,
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    warehouseId: input.warehouseId,
    type,
    quantity,
    signedQuantity,
    previousStock,
    newStock,
    unitCost: input.unitCost,
    totalCost: multiplyByQty(input.unitCost, quantity),
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber,
    reason: input.reason ?? null,
    createdBy: input.actor.userId,
    createdByName: input.actorName,
    createdAt: nowIso(),
  };
  tx.create(movementRef, movement);

  return {
    movementId: movementRef.id,
    previousStock,
    newStock,
    newAverageCost,
  };
}

/** Valida que exista stock suficiente antes de iniciar la fase de escritura. */
export function assertStockAvailable(
  product: Product,
  requiredScaledQty: number,
  allowNegativeStock: boolean,
): void {
  if (!product.tracksInventory) return;
  if (allowNegativeStock) return;
  if ((product.stock ?? 0) < requiredScaledQty) {
    throw errors.insufficientStock(
      `"${product.name}" tiene ${(product.stock ?? 0) / 1000} disponibles y se requieren ${
        requiredScaledQty / 1000
      }.`,
    );
  }
}

/** Convierte una cantidad decimal validando que sea positiva. */
export function requirePositiveQty(quantity: number, label = 'La cantidad'): number {
  const scaled = toScaledQty(quantity);
  if (scaled <= 0) {
    throw errors.validation(`${label} debe ser mayor que cero.`);
  }
  return scaled;
}

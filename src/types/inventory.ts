import type { BaseEntity, Id, IsoDate, Money, Quantity } from './common';

export type InventoryMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'INITIAL';

export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  SALE_RETURN: 'Devolución de venta',
  PURCHASE_RETURN: 'Devolución a proveedor',
  ADJUSTMENT_IN: 'Ajuste (entrada)',
  ADJUSTMENT_OUT: 'Ajuste (salida)',
  TRANSFER_IN: 'Transferencia (entrada)',
  TRANSFER_OUT: 'Transferencia (salida)',
  INITIAL: 'Inventario inicial',
};

/** Movimientos que incrementan existencias. */
export const INBOUND_MOVEMENTS: InventoryMovementType[] = [
  'PURCHASE',
  'SALE_RETURN',
  'ADJUSTMENT_IN',
  'TRANSFER_IN',
  'INITIAL',
];

export function isInbound(type: InventoryMovementType): boolean {
  return INBOUND_MOVEMENTS.includes(type);
}

export type ReferenceType =
  | 'SALE'
  | 'PURCHASE'
  | 'EXPENSE'
  | 'RETURN'
  | 'ADJUSTMENT'
  | 'TRANSFER'
  | 'PAYMENT'
  | 'OPENING'
  | 'MANUAL';

/**
 * Registro inmutable de todo cambio de existencias.
 * Se crea SIEMPRE dentro de la misma transacción que modifica `product.stock`.
 */
export interface InventoryMovement {
  id: Id;
  organizationId: Id;
  productId: Id;
  productName: string;
  productSku: string;
  warehouseId: Id;
  type: InventoryMovementType;
  /** Cantidad absoluta del movimiento (siempre positiva, escalada). */
  quantity: Quantity;
  /** Delta con signo aplicado al stock. */
  signedQuantity: Quantity;
  previousStock: Quantity;
  newStock: Quantity;
  /** Costo unitario aplicado al movimiento (centavos). */
  unitCost: Money;
  /** `unitCost * quantity` (centavos). */
  totalCost: Money;
  referenceType: ReferenceType;
  referenceId: Id | null;
  referenceNumber: string | null;
  reason: string | null;
  createdBy: Id;
  createdByName: string;
  createdAt: IsoDate;
}

export interface InventoryAdjustmentInput {
  productId: Id;
  warehouseId?: Id;
  /** Cantidad decimal en unidades del producto. */
  quantity: number;
  direction: 'IN' | 'OUT';
  reason: string;
  unitCost?: number;
}

export interface InventoryTransferInput {
  productId: Id;
  sourceWarehouseId: Id;
  destinationWarehouseId: Id;
  quantity: number;
  reason: string;
}

export interface StockValuationRow {
  productId: Id;
  sku: string;
  name: string;
  categoryName: string | null;
  stock: Quantity;
  averageCost: Money;
  totalCost: Money;
  salePrice: Money;
  potentialRevenue: Money;
}

export interface InventoryTransfer extends BaseEntity {
  number: string;
  productId: Id;
  productName: string;
  sourceWarehouseId: Id;
  destinationWarehouseId: Id;
  quantity: Quantity;
  reason: string;
}

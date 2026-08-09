import type { BaseEntity, EntityStatus, Id, Money, Quantity } from './common';

export interface Category extends BaseEntity {
  name: string;
  description: string | null;
  /** Categoría padre para jerarquías simples. */
  parentId: Id | null;
  color: string | null;
  status: EntityStatus;
  /** Contador denormalizado para evitar consultas costosas. */
  productCount: number;
}

export type ProductUnit =
  | 'UNIT'
  | 'BOX'
  | 'PACK'
  | 'KG'
  | 'GRAM'
  | 'LITER'
  | 'METER'
  | 'SERVICE';

export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  UNIT: 'Unidad',
  BOX: 'Caja',
  PACK: 'Paquete',
  KG: 'Kilogramo',
  GRAM: 'Gramo',
  LITER: 'Litro',
  METER: 'Metro',
  SERVICE: 'Servicio',
};

export interface Product extends BaseEntity {
  sku: string;
  barcode: string | null;
  name: string;
  /** Nombre normalizado en minúsculas, usado para búsqueda por prefijo. */
  searchName: string;
  description: string | null;
  categoryId: Id | null;
  categoryName: string | null;
  brand: string | null;
  unit: ProductUnit;
  imageUrl: string | null;
  imagePath: string | null;
  /** Último costo de compra registrado (centavos). */
  cost: Money;
  /** Costo promedio ponderado vigente (centavos). */
  averageCost: Money;
  /** Precio de venta al detalle (centavos). */
  salePrice: Money;
  /** Precio mayorista (centavos). `0` si no aplica. */
  wholesalePrice: Money;
  /** Tasa de impuesto en puntos base. */
  taxRate: number;
  /** Existencias totales (cantidad escalada). */
  stock: Quantity;
  /** Existencias mínimas para alerta (cantidad escalada). */
  minimumStock: Quantity;
  /**
   * Bandera denormalizada `stock <= minimumStock`. Firestore no permite
   * comparar dos campos entre sí, por lo que se mantiene actualizada en la
   * misma transacción que modifica el stock.
   */
  isLowStock: boolean;
  /** Controla inventario. Los servicios no descuentan stock. */
  tracksInventory: boolean;
  status: EntityStatus;
  deletedAt: string | null;
  deletedBy: Id | null;
}

/** Existencias por bodega (`productStock/{organizationId}_{productId}_{warehouseId}`). */
export interface ProductStock {
  id: Id;
  organizationId: Id;
  productId: Id;
  warehouseId: Id;
  quantity: Quantity;
  updatedAt: string;
}

export interface ProductProfitability {
  productId: Id;
  unitsSold: Quantity;
  revenue: Money;
  cost: Money;
  grossProfit: Money;
  /** Margen en puntos base sobre la venta. */
  marginRate: number;
}

import type { BaseEntity, Id, IsoDate, Money, Quantity } from './common';

export type SaleStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIAL'
  | 'PAID'
  | 'CANCELLED'
  | 'RETURNED';

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
  RETURNED: 'Devuelta',
};

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  CANCELLED: 'Anulado',
};

export type SaleType = 'CASH' | 'CREDIT';

/** Datos de entrega a domicilio (delivery). `null` si es venta en mostrador. */
export interface DeliveryInfo {
  recipient: string | null;
  address: string;
  phone: string | null;
  notes: string | null;
}

export interface SaleItem {
  productId: Id;
  sku: string;
  name: string;
  unit: string;
  /** Cantidad escalada por QTY_SCALE. */
  quantity: Quantity;
  /** Precio unitario en centavos (histórico, no se recalcula). */
  unitPrice: Money;
  /** Descuento aplicado a la línea, en centavos. */
  discount: Money;
  /** Tasa de impuesto histórica en puntos base. */
  taxRate: number;
  /** Impuesto calculado de la línea, en centavos. */
  taxAmount: Money;
  /** `unitPrice * quantity - discount` (centavos, sin impuesto). */
  subtotal: Money;
  /** `subtotal + taxAmount` (centavos). */
  total: Money;
  /** Costo unitario congelado al momento de la venta (centavos). */
  unitCost: Money;
  /** `unitCost * quantity` (centavos). */
  totalCost: Money;
  /** Cantidad ya devuelta (escalada). */
  returnedQuantity: Quantity;
  warehouseId: Id;
}

export interface Sale extends BaseEntity {
  number: string;
  type: SaleType;
  customerId: Id | null;
  customerName: string;
  sellerId: Id;
  sellerName: string;
  date: IsoDate;
  items: SaleItem[];
  /** Suma de subtotales de línea (centavos). */
  subtotal: Money;
  /** Descuento total: líneas + descuento global (centavos). */
  discount: Money;
  /** Descuento global aplicado sobre el documento (centavos). */
  globalDiscount: Money;
  tax: Money;
  total: Money;
  /** Costo de la mercadería vendida (centavos). */
  costOfGoodsSold: Money;
  /** Utilidad bruta: `total - tax - costOfGoodsSold`. */
  grossProfit: Money;
  paidAmount: Money;
  dueAmount: Money;
  paymentStatus: PaymentStatus;
  status: SaleStatus;
  dueDate: IsoDate | null;
  notes: string | null;
  /** Datos de entrega si la venta es delivery; `null` en mostrador. */
  delivery: DeliveryInfo | null;
  /**
   * Envío cobrado al cliente (centavos).
   *
   * El importe viaja además como una LÍNEA de la venta —por eso ya está dentro
   * de `total`— pero se guarda también aparte porque como línea es
   * indistinguible de cualquier otro producto. Tenerlo aislado permite dos
   * cosas que de otro modo hay que adivinar: cuánto se facturó en envíos, y
   * qué importe hereda el reparto para calcular su margen.
   *
   * Opcional porque las ventas registradas antes de que existiera el cobro de
   * envío no lo tienen; se lee siempre con `?? 0`.
   */
  shippingCost?: Money;
  cancelledAt: IsoDate | null;
  cancelledBy: Id | null;
  cancelReason: string | null;
  /** Total devuelto acumulado (centavos). */
  returnedAmount: Money;
  warehouseId: Id;
}

export interface SaleLineInput {
  productId: Id;
  /** Cantidad decimal en unidades del producto. */
  quantity: number;
  /** Precio unitario decimal en unidad mayor. Si se omite se usa el del producto. */
  unitPrice?: number;
  /** Descuento decimal de la línea, en unidad mayor. */
  discount?: number;
}

export interface CreateSaleInput {
  customerId: Id | null;
  date: string;
  items: SaleLineInput[];
  globalDiscount?: number;
  type: SaleType;
  notes?: string | null;
  dueDate?: string | null;
  warehouseId?: Id;
  delivery?: DeliveryInfo | null;
  /** Envío a cobrar, en unidad mayor. El servicio lo agrega como una línea más. */
  shippingCost?: number;
  /**
   * `true` cuando `items` YA trae la línea de envío, de modo que el servicio la
   * registre pero no la duplique.
   *
   * Lo usa la aprobación de pedidos web: esa ruta arma sus líneas con
   * `buildSaleLines`, que reconstruye la base gravable de TODO el documento
   * —envío incluido— para que el total de la venta cuadre al centavo con lo que
   * el comprador pagó. Delegar esa línea la dejaría fuera de ese cálculo.
   */
  shippingAlreadyInItems?: boolean;
  /** Pago inmediato registrado junto con la venta. */
  payment?: {
    accountId: Id;
    amount: number;
    method: string;
    reference?: string | null;
  } | null;
}

export interface SaleTotals {
  subtotal: Money;
  lineDiscount: Money;
  globalDiscount: Money;
  discount: Money;
  tax: Money;
  total: Money;
  costOfGoodsSold: Money;
  grossProfit: Money;
}

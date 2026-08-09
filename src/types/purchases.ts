import type { BaseEntity, Id, IsoDate, Money, Quantity } from './common';
import type { PaymentStatus } from './sales';

export type PurchaseStatus =
  | 'DRAFT'
  | 'RECEIVED'
  | 'PARTIAL'
  | 'PAID'
  | 'CANCELLED'
  | 'RETURNED';

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  DRAFT: 'Borrador',
  RECEIVED: 'Recibida',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
  RETURNED: 'Devuelta',
};

export type PurchaseType = 'CASH' | 'CREDIT';

export interface PurchaseItem {
  productId: Id;
  sku: string;
  name: string;
  unit: string;
  quantity: Quantity;
  /** Costo unitario negociado (centavos). */
  unitCost: Money;
  discount: Money;
  taxRate: number;
  taxAmount: Money;
  subtotal: Money;
  total: Money;
  /**
   * Costo unitario final tras prorratear flete y otros costos.
   * Es el que alimenta el costo promedio ponderado.
   */
  landedUnitCost: Money;
  returnedQuantity: Quantity;
  warehouseId: Id;
}

export interface Purchase extends BaseEntity {
  number: string;
  type: PurchaseType;
  supplierId: Id;
  supplierName: string;
  invoiceNumber: string | null;
  date: IsoDate;
  items: PurchaseItem[];
  subtotal: Money;
  discount: Money;
  globalDiscount: Money;
  tax: Money;
  /** Flete, prorrateado sobre el costo de los ítems. */
  shipping: Money;
  /** Otros costos capitalizables, también prorrateados. */
  otherCosts: Money;
  total: Money;
  paidAmount: Money;
  dueAmount: Money;
  status: PurchaseStatus;
  paymentStatus: PaymentStatus;
  dueDate: IsoDate | null;
  notes: string | null;
  receivedAt: IsoDate | null;
  receivedBy: Id | null;
  cancelledAt: IsoDate | null;
  cancelledBy: Id | null;
  cancelReason: string | null;
  returnedAmount: Money;
  warehouseId: Id;
}

export interface PurchaseLineInput {
  productId: Id;
  quantity: number;
  unitCost: number;
  discount?: number;
}

export interface CreatePurchaseInput {
  supplierId: Id;
  invoiceNumber?: string | null;
  date: string;
  items: PurchaseLineInput[];
  globalDiscount?: number;
  shipping?: number;
  otherCosts?: number;
  type: PurchaseType;
  notes?: string | null;
  dueDate?: string | null;
  warehouseId?: Id;
  payment?: {
    accountId: Id;
    amount: number;
    method: string;
    reference?: string | null;
  } | null;
}

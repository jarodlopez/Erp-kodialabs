import type { BaseEntity, Id, IsoDate, Money, Quantity } from './common';

export type ReturnType = 'SALE_RETURN' | 'PURCHASE_RETURN';

export const RETURN_TYPE_LABELS: Record<ReturnType, string> = {
  SALE_RETURN: 'Devolución de venta',
  PURCHASE_RETURN: 'Devolución a proveedor',
};

/** Forma en que se liquida el valor devuelto. */
export type RefundMode =
  /** Se devuelve dinero desde/hacia una cuenta financiera. */
  | 'CASH_REFUND'
  /** Se reduce la deuda pendiente (CxC o CxP). */
  | 'CREDIT_NOTE';

export interface ReturnItem {
  productId: Id;
  sku: string;
  name: string;
  quantity: Quantity;
  unitPrice: Money;
  taxRate: number;
  taxAmount: Money;
  subtotal: Money;
  total: Money;
  unitCost: Money;
  totalCost: Money;
}

/**
 * Documento de devolución. NUNCA se borra ni se modifica la operación
 * original: la devolución es un documento independiente que revierte
 * inventario y dinero de forma trazable.
 */
export interface ReturnDocument extends BaseEntity {
  number: string;
  type: ReturnType;
  referenceType: 'SALE' | 'PURCHASE';
  referenceId: Id;
  referenceNumber: string;
  partyId: Id | null;
  partyName: string;
  date: IsoDate;
  items: ReturnItem[];
  subtotal: Money;
  tax: Money;
  total: Money;
  totalCost: Money;
  refundMode: RefundMode;
  accountId: Id | null;
  accountName: string | null;
  reason: string;
  notes: string | null;
  warehouseId: Id;
}

export interface ReturnLineInput {
  productId: Id;
  quantity: number;
}

export interface CreateReturnInput {
  referenceId: Id;
  date: string;
  items: ReturnLineInput[];
  refundMode: RefundMode;
  accountId?: Id | null;
  reason: string;
  notes?: string | null;
}

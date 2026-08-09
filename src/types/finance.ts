import type { BaseEntity, EntityStatus, Id, IsoDate, Money } from './common';

export type FinancialAccountType =
  | 'CASH'
  | 'BANK'
  | 'CARD'
  | 'DIGITAL_WALLET'
  | 'OTHER';

export const ACCOUNT_TYPE_LABELS: Record<FinancialAccountType, string> = {
  CASH: 'Caja',
  BANK: 'Banco',
  CARD: 'Tarjeta',
  DIGITAL_WALLET: 'Billetera digital',
  OTHER: 'Otra',
};

export interface FinancialAccount extends BaseEntity {
  name: string;
  type: FinancialAccountType;
  currency: string;
  bankName: string | null;
  accountNumber: string | null;
  initialBalance: Money;
  /** Saldo vigente, actualizado siempre dentro de una transacción. */
  currentBalance: Money;
  isDefault: boolean;
  status: EntityStatus;
  notes: string | null;
}

export type TransactionDirection = 'IN' | 'OUT';

export type FinancialTransactionType =
  | 'SALE_INCOME'
  | 'CUSTOMER_PAYMENT'
  | 'PURCHASE_PAYMENT'
  | 'SUPPLIER_PAYMENT'
  | 'EXPENSE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'SALE_REFUND'
  | 'PURCHASE_REFUND'
  | 'OPENING_BALANCE';

export const TRANSACTION_TYPE_LABELS: Record<FinancialTransactionType, string> = {
  SALE_INCOME: 'Ingreso por venta',
  CUSTOMER_PAYMENT: 'Cobro a cliente',
  PURCHASE_PAYMENT: 'Pago de compra',
  SUPPLIER_PAYMENT: 'Pago a proveedor',
  EXPENSE: 'Gasto',
  TRANSFER_IN: 'Transferencia recibida',
  TRANSFER_OUT: 'Transferencia enviada',
  ADJUSTMENT_IN: 'Ajuste positivo',
  ADJUSTMENT_OUT: 'Ajuste negativo',
  SALE_REFUND: 'Devolución a cliente',
  PURCHASE_REFUND: 'Reembolso de proveedor',
  OPENING_BALANCE: 'Saldo inicial',
};

/**
 * Movimientos que NO deben contarse como ingreso ni egreso operativo
 * (las transferencias internas solo mueven dinero entre cuentas propias).
 */
export const NON_OPERATIONAL_TYPES: FinancialTransactionType[] = [
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'OPENING_BALANCE',
];

/** Libro mayor financiero: fuente única de verdad del flujo de caja. */
export interface FinancialTransaction {
  id: Id;
  organizationId: Id;
  type: FinancialTransactionType;
  referenceType: string;
  referenceId: Id | null;
  referenceNumber: string | null;
  accountId: Id;
  accountName: string;
  amount: Money;
  direction: TransactionDirection;
  /** Saldo de la cuenta después de aplicar el movimiento. */
  balanceAfter: Money;
  date: IsoDate;
  description: string;
  /** Agrupa las dos patas de una transferencia. */
  transferId: Id | null;
  createdBy: Id;
  createdByName: string;
  createdAt: IsoDate;
}

export interface Transfer extends BaseEntity {
  number: string;
  sourceAccountId: Id;
  sourceAccountName: string;
  destinationAccountId: Id;
  destinationAccountName: string;
  amount: Money;
  date: IsoDate;
  reference: string | null;
  notes: string | null;
}

export type ReceivableStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Abonada',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Anulada',
};

export interface AccountReceivable extends BaseEntity {
  customerId: Id;
  customerName: string;
  referenceType: 'SALE';
  referenceId: Id;
  referenceNumber: string;
  originalAmount: Money;
  paidAmount: Money;
  remainingAmount: Money;
  issueDate: IsoDate;
  dueDate: IsoDate;
  status: ReceivableStatus;
  notes: string | null;
}

export interface AccountPayable extends BaseEntity {
  supplierId: Id;
  supplierName: string;
  referenceType: 'PURCHASE' | 'EXPENSE';
  referenceId: Id;
  referenceNumber: string;
  originalAmount: Money;
  paidAmount: Money;
  remainingAmount: Money;
  issueDate: IsoDate;
  dueDate: IsoDate;
  status: ReceivableStatus;
  notes: string | null;
}

export type PaymentType =
  | 'SALE_PAYMENT'
  | 'CUSTOMER_PAYMENT'
  | 'SUPPLIER_PAYMENT'
  | 'PURCHASE_PAYMENT'
  | 'EXPENSE_PAYMENT'
  | 'REFUND_OUT'
  | 'REFUND_IN'
  | 'OTHER';

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  SALE_PAYMENT: 'Pago de venta',
  CUSTOMER_PAYMENT: 'Abono de cliente',
  SUPPLIER_PAYMENT: 'Abono a proveedor',
  PURCHASE_PAYMENT: 'Pago de compra',
  EXPENSE_PAYMENT: 'Pago de gasto',
  REFUND_OUT: 'Reembolso a cliente',
  REFUND_IN: 'Reembolso de proveedor',
  OTHER: 'Otro',
};

export type PaymentMethod =
  | 'CASH'
  | 'TRANSFER'
  | 'CARD'
  | 'CHECK'
  | 'DIGITAL_WALLET'
  | 'CREDIT_NOTE'
  | 'OTHER';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  CHECK: 'Cheque',
  DIGITAL_WALLET: 'Billetera digital',
  CREDIT_NOTE: 'Nota de crédito',
  OTHER: 'Otro',
};

export interface Payment extends BaseEntity {
  number: string;
  type: PaymentType;
  referenceType: string;
  referenceId: Id;
  referenceNumber: string;
  partyId: Id | null;
  partyName: string;
  accountId: Id;
  accountName: string;
  amount: Money;
  date: IsoDate;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  cancelledAt: IsoDate | null;
}

export interface CashFlowSummary {
  openingBalance: Money;
  inflows: Money;
  outflows: Money;
  closingBalance: Money;
  byAccount: { accountId: Id; accountName: string; inflows: Money; outflows: Money; balance: Money }[];
}

export interface IncomeStatement {
  revenue: Money;
  costOfGoodsSold: Money;
  grossProfit: Money;
  operatingExpenses: Money;
  netProfit: Money;
  expensesByCategory: { categoryId: Id; categoryName: string; amount: Money }[];
  /** Margen bruto en puntos base. */
  grossMarginRate: number;
  netMarginRate: number;
}

import type { BaseEntity, EntityStatus, Id, IsoDate, Money } from './common';
import type { PaymentMethod } from './finance';
import type { PaymentStatus } from './sales';

export interface ExpenseCategory extends BaseEntity {
  name: string;
  description: string | null;
  /** Categorías creadas por el sistema en el seed inicial. */
  isSystem: boolean;
  status: EntityStatus;
}

/** Catálogo base de categorías de gasto creado al provisionar la organización. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Alquiler',
  'Electricidad',
  'Internet',
  'Publicidad',
  'Transporte',
  'Combustible',
  'Salarios',
  'Software',
  'Comisiones',
  'Mantenimiento',
  'Papelería',
  'Otros',
] as const;

export type ExpenseStatus = 'REGISTERED' | 'CANCELLED';

export interface Expense extends BaseEntity {
  number: string;
  categoryId: Id;
  categoryName: string;
  description: string;
  supplierId: Id | null;
  supplierName: string | null;
  amount: Money;
  taxAmount: Money;
  total: Money;
  date: IsoDate;
  /** Cuenta desde la que se pagó. `null` cuando queda como cuenta por pagar. */
  accountId: Id | null;
  accountName: string | null;
  method: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paidAmount: Money;
  dueAmount: Money;
  dueDate: IsoDate | null;
  receiptUrl: string | null;
  receiptPath: string | null;
  notes: string | null;
  status: ExpenseStatus;
  cancelledAt: IsoDate | null;
  cancelledBy: Id | null;
  /** Gasto recurrente que lo generó, si aplica. */
  recurringExpenseId: Id | null;
}

export type RecurringFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  YEARLY: 'Anual',
};

export interface RecurringExpense extends BaseEntity {
  description: string;
  categoryId: Id;
  categoryName: string;
  supplierId: Id | null;
  supplierName: string | null;
  amount: Money;
  taxRate: number;
  frequency: RecurringFrequency;
  /** Próxima fecha de generación (ISO, a las 00:00 UTC). */
  nextDate: IsoDate;
  /** Fecha de finalización opcional. */
  endDate: IsoDate | null;
  accountId: Id | null;
  accountName: string | null;
  method: PaymentMethod | null;
  /** Si `true`, el gasto generado se marca como pagado automáticamente. */
  autoPay: boolean;
  status: EntityStatus;
  lastGeneratedAt: IsoDate | null;
  generatedCount: number;
}

export interface CreateExpenseInput {
  categoryId: Id;
  description: string;
  supplierId?: Id | null;
  amount: number;
  taxRate?: number;
  date: string;
  accountId?: Id | null;
  method?: PaymentMethod | null;
  payNow: boolean;
  dueDate?: string | null;
  notes?: string | null;
  receiptUrl?: string | null;
  receiptPath?: string | null;
}

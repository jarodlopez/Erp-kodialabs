/**
 * Máquinas de estado centralizadas.
 *
 * Toda transición de estado de un documento pasa por aquí. Ningún servicio
 * asigna un `status` "a mano": así resulta imposible producir combinaciones
 * inválidas como `CANCELLED -> PAID`.
 */
import { errors } from './errors';
import type { PurchaseStatus } from '@/types/purchases';
import type { PaymentStatus, SaleStatus } from '@/types/sales';
import type { ReceivableStatus } from '@/types/finance';

export const SALE_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  DRAFT: ['DRAFT', 'CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PARTIAL', 'PAID', 'CANCELLED', 'RETURNED'],
  PARTIAL: ['PARTIAL', 'PAID', 'CANCELLED', 'RETURNED'],
  PAID: ['RETURNED', 'CANCELLED'],
  CANCELLED: [],
  RETURNED: ['RETURNED'],
};

export const PURCHASE_TRANSITIONS: Record<PurchaseStatus, PurchaseStatus[]> = {
  DRAFT: ['DRAFT', 'RECEIVED', 'CANCELLED'],
  RECEIVED: ['PARTIAL', 'PAID', 'CANCELLED', 'RETURNED'],
  PARTIAL: ['PARTIAL', 'PAID', 'CANCELLED', 'RETURNED'],
  PAID: ['RETURNED', 'CANCELLED'],
  CANCELLED: [],
  RETURNED: ['RETURNED'],
};

export const RECEIVABLE_TRANSITIONS: Record<ReceivableStatus, ReceivableStatus[]> = {
  PENDING: ['PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'],
  PARTIAL: ['PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'],
  OVERDUE: ['PARTIAL', 'PAID', 'CANCELLED'],
  PAID: ['PARTIAL', 'CANCELLED'],
  CANCELLED: [],
};

function assertTransition<S extends string>(
  table: Record<S, S[]>,
  from: S,
  to: S,
  label: string,
  labels: Record<S, string>,
): void {
  const allowed = table[from];
  if (!allowed || !allowed.includes(to)) {
    throw errors.invalidTransition(
      `${label} en estado "${labels[from] ?? from}" no puede pasar a "${labels[to] ?? to}".`,
    );
  }
}

const SALE_LABELS: Record<SaleStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
  RETURNED: 'Devuelta',
};

const PURCHASE_LABELS: Record<PurchaseStatus, string> = {
  DRAFT: 'Borrador',
  RECEIVED: 'Recibida',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
  RETURNED: 'Devuelta',
};

const RECEIVABLE_LABELS: Record<ReceivableStatus, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Abonada',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Anulada',
};

export function assertSaleTransition(from: SaleStatus, to: SaleStatus): void {
  assertTransition(SALE_TRANSITIONS, from, to, 'La venta', SALE_LABELS);
}

export function assertPurchaseTransition(from: PurchaseStatus, to: PurchaseStatus): void {
  assertTransition(PURCHASE_TRANSITIONS, from, to, 'La compra', PURCHASE_LABELS);
}

export function assertReceivableTransition(from: ReceivableStatus, to: ReceivableStatus): void {
  assertTransition(RECEIVABLE_TRANSITIONS, from, to, 'La cuenta', RECEIVABLE_LABELS);
}

export function canTransitionSale(from: SaleStatus, to: SaleStatus): boolean {
  return SALE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionPurchase(from: PurchaseStatus, to: PurchaseStatus): boolean {
  return PURCHASE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Deriva el estado de pago a partir de los importes.
 * Es la única función autorizada para calcular `paymentStatus`.
 */
export function derivePaymentStatus(total: number, paid: number): PaymentStatus {
  if (paid <= 0) return 'UNPAID';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

/** Deriva el estado de una venta activa según lo cobrado. */
export function deriveSaleStatus(total: number, paid: number, current: SaleStatus): SaleStatus {
  if (current === 'CANCELLED' || current === 'RETURNED' || current === 'DRAFT') return current;
  if (paid <= 0) return 'CONFIRMED';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

/** Deriva el estado de una compra recibida según lo pagado. */
export function derivePurchaseStatus(
  total: number,
  paid: number,
  current: PurchaseStatus,
): PurchaseStatus {
  if (current === 'CANCELLED' || current === 'RETURNED' || current === 'DRAFT') return current;
  if (paid <= 0) return 'RECEIVED';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

/** Deriva el estado de una CxC/CxP según lo abonado y su vencimiento. */
export function deriveReceivableStatus(
  originalAmount: number,
  paidAmount: number,
  dueDate: string,
  reference: Date = new Date(),
): ReceivableStatus {
  if (paidAmount >= originalAmount) return 'PAID';
  const due = new Date(dueDate);
  const isOverdue = !Number.isNaN(due.getTime()) && due.getTime() < reference.getTime();
  if (isOverdue) return 'OVERDUE';
  return paidAmount > 0 ? 'PARTIAL' : 'PENDING';
}

/** Estados que representan un documento vigente (no anulado). */
export const ACTIVE_SALE_STATUSES: SaleStatus[] = ['CONFIRMED', 'PARTIAL', 'PAID', 'RETURNED'];
export const ACTIVE_PURCHASE_STATUSES: PurchaseStatus[] = ['RECEIVED', 'PARTIAL', 'PAID', 'RETURNED'];

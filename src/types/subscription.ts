import type { Id, IsoDate } from './common';

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIAL: 'Prueba gratis',
  ACTIVE: 'Activa',
  EXPIRED: 'Vencida',
  SUSPENDED: 'Suspendida',
};

/**
 * Suscripción de un comercio (tenant). Documento en `subscriptions/{orgId}`.
 * El cobro es manual: un súper-admin extiende `validUntil` al validar el pago.
 */
export interface Subscription {
  organizationId: Id;
  plan: string;
  status: SubscriptionStatus;
  /** Fecha hasta la que la suscripción (o prueba) es válida. */
  validUntil: IsoDate;
  note: string | null;
  updatedAt: IsoDate;
  updatedBy: Id;
}

export type PaymentReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const PAYMENT_REPORT_STATUS_LABELS: Record<PaymentReportStatus, string> = {
  PENDING: 'Pendiente de revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

/** Reporte de pago manual enviado por un comercio para validación. */
export interface SubscriptionPayment {
  id: Id;
  organizationId: Id;
  organizationName: string;
  reportedBy: Id;
  reporterEmail: string;
  plan: string;
  /** Monto reportado, en unidades mayores (texto libre convertido a número). */
  amount: number;
  method: string;
  reference: string | null;
  /** Fecha en que el comercio dice haber pagado. */
  paidAt: IsoDate;
  note: string | null;
  status: PaymentReportStatus;
  reviewedBy: Id | null;
  reviewedAt: IsoDate | null;
  reviewNote: string | null;
  createdAt: IsoDate;
}

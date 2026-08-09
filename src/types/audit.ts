import type { Id, IsoDate } from './common';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'CANCEL'
  | 'CONFIRM'
  | 'RECEIVE'
  | 'PAYMENT'
  | 'RETURN'
  | 'ADJUSTMENT'
  | 'TRANSFER'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ROLE_CHANGE'
  | 'EXPORT'
  | 'CRON';

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Modificación',
  DELETE: 'Eliminación',
  CANCEL: 'Anulación',
  CONFIRM: 'Confirmación',
  RECEIVE: 'Recepción',
  PAYMENT: 'Pago',
  RETURN: 'Devolución',
  ADJUSTMENT: 'Ajuste',
  TRANSFER: 'Transferencia',
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  ROLE_CHANGE: 'Cambio de rol',
  EXPORT: 'Exportación',
  CRON: 'Tarea automática',
};

export type AuditModule =
  | 'AUTH'
  | 'SALES'
  | 'PURCHASES'
  | 'EXPENSES'
  | 'INVENTORY'
  | 'FINANCE'
  | 'CATALOG'
  | 'PARTIES'
  | 'ADMIN'
  | 'REPORTS'
  | 'SYSTEM';

/**
 * Registro de auditoría. Es inmutable: las Security Rules impiden
 * `update` y `delete` para cualquier cliente, y el servidor solo crea.
 */
export interface AuditLog {
  id: Id;
  organizationId: Id;
  userId: Id;
  userEmail: string;
  userName: string;
  action: AuditAction;
  module: AuditModule;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  /** Estado previo (recortado a campos relevantes). */
  before: Record<string, unknown> | null;
  /** Estado posterior. */
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  timestamp: IsoDate;
}

export interface AuditEntryInput {
  action: AuditAction;
  module: AuditModule;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

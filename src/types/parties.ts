import type { BaseEntity, EntityStatus, Id, IsoDate, Money } from './common';

export type DocumentType = 'CEDULA' | 'RUC' | 'PASSPORT' | 'OTHER';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CEDULA: 'Cédula',
  RUC: 'RUC',
  PASSPORT: 'Pasaporte',
  OTHER: 'Otro',
};

export interface Customer extends BaseEntity {
  name: string;
  searchName: string;
  documentType: DocumentType | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  /** Límite de crédito autorizado (centavos). `0` = sin crédito. */
  creditLimit: Money;
  /** Días de crédito por defecto. */
  creditDays: number;
  status: EntityStatus;
  /** Métricas denormalizadas, actualizadas transaccionalmente. */
  stats: PartyStats;
}

export interface Supplier extends BaseEntity {
  name: string;
  searchName: string;
  documentType: DocumentType | null;
  document: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  creditDays: number;
  status: EntityStatus;
  stats: PartyStats;
}

/** Métricas acumuladas de un cliente o proveedor. */
export interface PartyStats {
  /** Importe total transado (ventas para clientes, compras para proveedores). */
  totalAmount: Money;
  /** Número de documentos confirmados. */
  documentCount: number;
  /** Saldo pendiente vigente (CxC para clientes, CxP para proveedores). */
  outstandingBalance: Money;
  lastDocumentAt: IsoDate | null;
}

export const EMPTY_PARTY_STATS: PartyStats = {
  totalAmount: 0,
  documentCount: 0,
  outstandingBalance: 0,
  lastDocumentAt: null,
};

export interface CustomerInsights {
  customer: Customer;
  averageTicket: Money;
}

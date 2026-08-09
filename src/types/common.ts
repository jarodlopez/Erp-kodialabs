/**
 * Tipos base compartidos por todo el dominio del ERP.
 *
 * CONVENCIONES GLOBALES
 * ---------------------
 * 1. DINERO: todos los importes se representan como enteros en la unidad
 *    mínima de la moneda (centavos). `10000` === C$100.00. Ver `lib/money.ts`.
 * 2. FECHAS: en Firestore se almacenan como `Timestamp`. Al salir de un
 *    repositorio se convierten a ISO-8601 (`string`) para que sean
 *    serializables entre Server Components y Client Components.
 * 3. CANTIDADES: enteros escalados por `QTY_SCALE` (3 decimales) para evitar
 *    aritmética de punto flotante en inventario. Ver `lib/money.ts`.
 */

/** Importe monetario en unidades mínimas enteras (centavos). */
export type Money = number;

/** Cantidad de inventario escalada (ver `QTY_SCALE`). */
export type Quantity = number;

/** Fecha ISO-8601 en UTC, p. ej. `2026-08-08T14:03:00.000Z`. */
export type IsoDate = string;

/** Identificador de documento de Firestore. */
export type Id = string;

/** Campos de auditoría presentes en toda entidad de negocio. */
export interface BaseEntity {
  id: Id;
  organizationId: Id;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  createdBy: Id;
  updatedBy: Id;
}

/** Entidades que soportan borrado lógico. */
export interface SoftDeletable {
  deletedAt: IsoDate | null;
  deletedBy: Id | null;
}

export type EntityStatus = 'ACTIVE' | 'INACTIVE';

/** Página de resultados con cursor opaco para paginación eficiente. */
export interface Page<T> {
  items: T[];
  /** Cursor para solicitar la siguiente página. `null` si no hay más. */
  nextCursor: string | null;
  /** Indica si existen más resultados después de esta página. */
  hasMore: boolean;
}

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

/** Contexto del actor que ejecuta una operación de negocio. */
export interface ActorContext {
  userId: Id;
  organizationId: Id;
  email: string;
  role: string;
  permissions: string[];
  ip?: string | null;
  userAgent?: string | null;
}

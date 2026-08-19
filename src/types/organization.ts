import type { BaseEntity, EntityStatus, Id, IsoDate, Money } from './common';
import type { Role } from '@/lib/rbac';

/** Organización = tenant. Toda entidad de negocio referencia su `organizationId`. */
export interface Organization {
  id: Id;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  /** Código ISO-4217 de la moneda principal, p. ej. `NIO`. */
  currency: string;
  /** Locale usado para formateo, p. ej. `es-NI`. */
  locale: string;
  timezone: string;
  status: EntityStatus;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  createdBy: Id;
  updatedBy: Id;
}

/** Perfil del usuario. El documento vive en `users/{uid}`. */
export interface UserProfile {
  id: Id;
  email: string;
  displayName: string;
  phone: string | null;
  photoUrl: string | null;
  /** Organización activa del usuario. */
  organizationId: Id;
  /** Organizaciones a las que pertenece (preparado para multi-organización). */
  organizationIds: Id[];
  role: Role;
  status: EntityStatus;
  lastLoginAt: IsoDate | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  createdBy: Id;
  updatedBy: Id;
}

/** Membresía usuario ↔ organización, con el rol asignado en esa organización. */
export interface Membership extends BaseEntity {
  userId: Id;
  email: string;
  displayName: string;
  role: Role;
  status: EntityStatus;
}

export type TaxMode = 'EXCLUSIVE' | 'INCLUSIVE';

/** Configuración de la organización (`settings/{organizationId}`). */
export interface Settings {
  id: Id;
  organizationId: Id;
  currency: string;
  locale: string;
  timezone: string;
  /** Si los precios de venta incluyen impuesto o se le suma al subtotal. */
  taxMode: TaxMode;
  /** Impuesto aplicado por defecto a nuevos productos (puntos base). */
  defaultTaxRate: number;
  /** Días de crédito por defecto para ventas a crédito. */
  defaultCreditDays: number;
  /** Umbral global de stock bajo cuando el producto no define el suyo. */
  lowStockThreshold: number;
  /** Permitir confirmar ventas que dejen el stock en negativo. */
  allowNegativeStock: boolean;
  /** Prefijos de numeración por documento. */
  numbering: {
    sale: string;
    purchase: string;
    expense: string;
    payment: string;
    return: string;
    transfer: string;
    adjustment: string;
    /**
     * Prefijo de los pedidos de la tienda online. Opcional: las
     * organizaciones creadas antes del módulo no lo tienen y se resuelve
     * con `DEFAULT_STORE_ORDER_PREFIX`.
     */
    storeOrder?: string;
    /** Prefijo de los repartos. Opcional por la misma razón que el anterior. */
    delivery?: string;
  };
  /**
   * Producto de servicio con el que se cobra el envío. Se crea solo la primera
   * vez que alguien cobra un envío, venga de la tienda o de una venta a mano.
   */
  shippingProductId?: Id | null;
  invoiceFooter: string | null;
  updatedAt: IsoDate;
  updatedBy: Id;
}

/** Tasa de impuesto configurable. Las operaciones guardan la tasa histórica. */
export interface Tax extends BaseEntity {
  name: string;
  /** Tasa en puntos base: 15 % === 1500. */
  rate: number;
  isDefault: boolean;
  active: boolean;
}

/** Bodega / ubicación de inventario. */
export interface Warehouse extends BaseEntity {
  name: string;
  code: string;
  address: string | null;
  isDefault: boolean;
  status: EntityStatus;
}

export interface OrganizationSummary {
  organization: Organization;
  settings: Settings;
  totals: {
    products: number;
    customers: number;
    suppliers: number;
    cashBalance: Money;
  };
}

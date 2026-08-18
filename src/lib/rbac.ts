/**
 * RBAC — Control de acceso basado en roles con permisos granulares.
 *
 * El rol del usuario viaja en los *custom claims* del token de Firebase Auth
 * (`role` y `organizationId`), por lo que puede evaluarse tanto en el servidor
 * de Next.js como en las Security Rules de Firestore/Storage.
 *
 * La UI usa estos permisos para ocultar acciones, pero la validación
 * **autoritativa** ocurre siempre en el servidor (`requirePermission`).
 */

export const PERMISSIONS = {
  // Panel general
  DASHBOARD_VIEW: 'dashboard.view',

  // Catálogo
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DEACTIVATE: 'products.deactivate',
  CATEGORIES_VIEW: 'categories.view',
  CATEGORIES_MANAGE: 'categories.manage',

  // Relaciones
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_UPDATE: 'customers.update',
  SUPPLIERS_VIEW: 'suppliers.view',
  SUPPLIERS_CREATE: 'suppliers.create',
  SUPPLIERS_UPDATE: 'suppliers.update',

  // Ventas
  SALES_VIEW: 'sales.view',
  SALES_CREATE: 'sales.create',
  SALES_UPDATE: 'sales.update',
  SALES_CANCEL: 'sales.cancel',
  SALES_RETURN: 'sales.return',

  // Compras
  PURCHASES_VIEW: 'purchases.view',
  PURCHASES_CREATE: 'purchases.create',
  PURCHASES_UPDATE: 'purchases.update',
  PURCHASES_RECEIVE: 'purchases.receive',
  PURCHASES_CANCEL: 'purchases.cancel',
  PURCHASES_RETURN: 'purchases.return',

  // Inventario
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_TRANSFER: 'inventory.transfer',

  // Gastos
  EXPENSES_VIEW: 'expenses.view',
  EXPENSES_CREATE: 'expenses.create',
  EXPENSES_UPDATE: 'expenses.update',
  EXPENSES_CANCEL: 'expenses.cancel',

  // Finanzas
  FINANCE_VIEW: 'finance.view',
  FINANCE_CREATE: 'finance.create',
  FINANCE_TRANSFER: 'finance.transfer',
  FINANCE_ADJUST: 'finance.adjust',
  RECEIVABLES_VIEW: 'receivables.view',
  RECEIVABLES_COLLECT: 'receivables.collect',
  PAYABLES_VIEW: 'payables.view',
  PAYABLES_PAY: 'payables.pay',

  // Tienda online
  STORE_VIEW: 'store.view',
  STORE_MANAGE: 'store.manage',
  STORE_ORDERS_VIEW: 'store.orders.view',
  STORE_ORDERS_MANAGE: 'store.orders.manage',

  // Análisis
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  // Administración
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SALES: 'SALES',
  WAREHOUSE: 'WAREHOUSE',
  ACCOUNTANT: 'ACCOUNTANT',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LIST: Role[] = Object.values(ROLES);

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  SALES: 'Ventas',
  WAREHOUSE: 'Bodega',
  ACCOUNTANT: 'Contabilidad',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Acceso total al sistema, incluida la administración de usuarios y la auditoría.',
  MANAGER: 'Gestión operativa completa: inventario, ventas, compras, gastos y finanzas.',
  SALES: 'Registro de ventas, cobros y gestión de clientes.',
  WAREHOUSE: 'Inventario, recepción de compras y ajustes de existencias.',
  ACCOUNTANT: 'Finanzas, gastos, cuentas por cobrar y pagar, y reportes.',
};

const P = PERMISSIONS;

const MANAGER_PERMISSIONS: Permission[] = [
  P.DASHBOARD_VIEW,
  P.PRODUCTS_VIEW, P.PRODUCTS_CREATE, P.PRODUCTS_UPDATE, P.PRODUCTS_DEACTIVATE,
  P.CATEGORIES_VIEW, P.CATEGORIES_MANAGE,
  P.CUSTOMERS_VIEW, P.CUSTOMERS_CREATE, P.CUSTOMERS_UPDATE,
  P.SUPPLIERS_VIEW, P.SUPPLIERS_CREATE, P.SUPPLIERS_UPDATE,
  P.SALES_VIEW, P.SALES_CREATE, P.SALES_UPDATE, P.SALES_CANCEL, P.SALES_RETURN,
  P.PURCHASES_VIEW, P.PURCHASES_CREATE, P.PURCHASES_UPDATE, P.PURCHASES_RECEIVE,
  P.PURCHASES_CANCEL, P.PURCHASES_RETURN,
  P.INVENTORY_VIEW, P.INVENTORY_ADJUST, P.INVENTORY_TRANSFER,
  P.EXPENSES_VIEW, P.EXPENSES_CREATE, P.EXPENSES_UPDATE, P.EXPENSES_CANCEL,
  P.FINANCE_VIEW, P.FINANCE_CREATE, P.FINANCE_TRANSFER, P.FINANCE_ADJUST,
  P.RECEIVABLES_VIEW, P.RECEIVABLES_COLLECT,
  P.PAYABLES_VIEW, P.PAYABLES_PAY,
  P.STORE_VIEW, P.STORE_MANAGE, P.STORE_ORDERS_VIEW, P.STORE_ORDERS_MANAGE,
  P.REPORTS_VIEW, P.REPORTS_EXPORT,
  P.SETTINGS_VIEW,
];

const SALES_PERMISSIONS: Permission[] = [
  P.DASHBOARD_VIEW,
  P.PRODUCTS_VIEW,
  P.CATEGORIES_VIEW,
  P.CUSTOMERS_VIEW, P.CUSTOMERS_CREATE, P.CUSTOMERS_UPDATE,
  P.SALES_VIEW, P.SALES_CREATE, P.SALES_UPDATE,
  P.INVENTORY_VIEW,
  P.RECEIVABLES_VIEW, P.RECEIVABLES_COLLECT,
  P.STORE_VIEW, P.STORE_ORDERS_VIEW, P.STORE_ORDERS_MANAGE,
  P.REPORTS_VIEW,
];

const WAREHOUSE_PERMISSIONS: Permission[] = [
  P.DASHBOARD_VIEW,
  P.PRODUCTS_VIEW, P.PRODUCTS_CREATE, P.PRODUCTS_UPDATE,
  P.CATEGORIES_VIEW, P.CATEGORIES_MANAGE,
  P.SUPPLIERS_VIEW, P.SUPPLIERS_CREATE, P.SUPPLIERS_UPDATE,
  P.PURCHASES_VIEW, P.PURCHASES_CREATE, P.PURCHASES_UPDATE, P.PURCHASES_RECEIVE,
  P.PURCHASES_RETURN,
  P.INVENTORY_VIEW, P.INVENTORY_ADJUST, P.INVENTORY_TRANSFER,
  P.STORE_VIEW, P.STORE_ORDERS_VIEW,
  P.REPORTS_VIEW,
];

const ACCOUNTANT_PERMISSIONS: Permission[] = [
  P.DASHBOARD_VIEW,
  P.PRODUCTS_VIEW,
  P.CATEGORIES_VIEW,
  P.CUSTOMERS_VIEW,
  P.SUPPLIERS_VIEW,
  P.SALES_VIEW,
  P.PURCHASES_VIEW,
  P.INVENTORY_VIEW,
  P.EXPENSES_VIEW, P.EXPENSES_CREATE, P.EXPENSES_UPDATE, P.EXPENSES_CANCEL,
  P.FINANCE_VIEW, P.FINANCE_CREATE, P.FINANCE_TRANSFER, P.FINANCE_ADJUST,
  P.RECEIVABLES_VIEW, P.RECEIVABLES_COLLECT,
  P.PAYABLES_VIEW, P.PAYABLES_PAY,
  P.STORE_VIEW, P.STORE_ORDERS_VIEW,
  P.REPORTS_VIEW, P.REPORTS_EXPORT,
  P.AUDIT_VIEW,
  P.SETTINGS_VIEW,
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  SALES: SALES_PERMISSIONS,
  WAREHOUSE: WAREHOUSE_PERMISSIONS,
  ACCOUNTANT: ACCOUNTANT_PERMISSIONS,
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLE_LIST as string[]).includes(value);
}

export function permissionsForRole(role: string): Permission[] {
  return isRole(role) ? ROLE_PERMISSIONS[role] : [];
}

/**
 * Evalúa si un conjunto de permisos incluye el permiso requerido.
 * El rol ADMIN se resuelve por lista completa, no por casos especiales.
 */
export function hasPermission(
  granted: readonly string[] | undefined,
  required: Permission,
): boolean {
  if (!granted) return false;
  return granted.includes(required);
}

export function hasAnyPermission(
  granted: readonly string[] | undefined,
  required: readonly Permission[],
): boolean {
  if (!granted) return false;
  return required.some((p) => granted.includes(p));
}

export function hasAllPermissions(
  granted: readonly string[] | undefined,
  required: readonly Permission[],
): boolean {
  if (!granted) return false;
  return required.every((p) => granted.includes(p));
}

/** Agrupación de permisos para la pantalla de Roles y permisos. */
export const PERMISSION_GROUPS: { module: string; permissions: { key: Permission; label: string }[] }[] = [
  {
    module: 'General',
    permissions: [{ key: P.DASHBOARD_VIEW, label: 'Ver dashboard' }],
  },
  {
    module: 'Catálogo',
    permissions: [
      { key: P.PRODUCTS_VIEW, label: 'Ver productos' },
      { key: P.PRODUCTS_CREATE, label: 'Crear productos' },
      { key: P.PRODUCTS_UPDATE, label: 'Editar productos' },
      { key: P.PRODUCTS_DEACTIVATE, label: 'Desactivar productos' },
      { key: P.CATEGORIES_VIEW, label: 'Ver categorías' },
      { key: P.CATEGORIES_MANAGE, label: 'Gestionar categorías' },
    ],
  },
  {
    module: 'Relaciones',
    permissions: [
      { key: P.CUSTOMERS_VIEW, label: 'Ver clientes' },
      { key: P.CUSTOMERS_CREATE, label: 'Crear clientes' },
      { key: P.CUSTOMERS_UPDATE, label: 'Editar clientes' },
      { key: P.SUPPLIERS_VIEW, label: 'Ver proveedores' },
      { key: P.SUPPLIERS_CREATE, label: 'Crear proveedores' },
      { key: P.SUPPLIERS_UPDATE, label: 'Editar proveedores' },
    ],
  },
  {
    module: 'Ventas',
    permissions: [
      { key: P.SALES_VIEW, label: 'Ver ventas' },
      { key: P.SALES_CREATE, label: 'Crear ventas' },
      { key: P.SALES_UPDATE, label: 'Editar borradores' },
      { key: P.SALES_CANCEL, label: 'Anular ventas' },
      { key: P.SALES_RETURN, label: 'Registrar devoluciones' },
    ],
  },
  {
    module: 'Compras',
    permissions: [
      { key: P.PURCHASES_VIEW, label: 'Ver compras' },
      { key: P.PURCHASES_CREATE, label: 'Crear compras' },
      { key: P.PURCHASES_UPDATE, label: 'Editar borradores' },
      { key: P.PURCHASES_RECEIVE, label: 'Recibir inventario' },
      { key: P.PURCHASES_CANCEL, label: 'Anular compras' },
      { key: P.PURCHASES_RETURN, label: 'Devolver a proveedor' },
    ],
  },
  {
    module: 'Inventario',
    permissions: [
      { key: P.INVENTORY_VIEW, label: 'Ver inventario' },
      { key: P.INVENTORY_ADJUST, label: 'Ajustar existencias' },
      { key: P.INVENTORY_TRANSFER, label: 'Transferir entre bodegas' },
    ],
  },
  {
    module: 'Gastos',
    permissions: [
      { key: P.EXPENSES_VIEW, label: 'Ver gastos' },
      { key: P.EXPENSES_CREATE, label: 'Registrar gastos' },
      { key: P.EXPENSES_UPDATE, label: 'Editar gastos' },
      { key: P.EXPENSES_CANCEL, label: 'Anular gastos' },
    ],
  },
  {
    module: 'Finanzas',
    permissions: [
      { key: P.FINANCE_VIEW, label: 'Ver cuentas y movimientos' },
      { key: P.FINANCE_CREATE, label: 'Registrar movimientos' },
      { key: P.FINANCE_TRANSFER, label: 'Transferir entre cuentas' },
      { key: P.FINANCE_ADJUST, label: 'Ajustar saldos' },
      { key: P.RECEIVABLES_VIEW, label: 'Ver cuentas por cobrar' },
      { key: P.RECEIVABLES_COLLECT, label: 'Registrar cobros' },
      { key: P.PAYABLES_VIEW, label: 'Ver cuentas por pagar' },
      { key: P.PAYABLES_PAY, label: 'Registrar pagos a proveedores' },
    ],
  },
  {
    module: 'Tienda online',
    permissions: [
      { key: P.STORE_VIEW, label: 'Ver la tienda' },
      { key: P.STORE_MANAGE, label: 'Configurar tienda y catálogo' },
      { key: P.STORE_ORDERS_VIEW, label: 'Ver pedidos online' },
      { key: P.STORE_ORDERS_MANAGE, label: 'Aprobar y rechazar pedidos' },
    ],
  },
  {
    module: 'Análisis',
    permissions: [
      { key: P.REPORTS_VIEW, label: 'Ver reportes' },
      { key: P.REPORTS_EXPORT, label: 'Exportar reportes' },
    ],
  },
  {
    module: 'Administración',
    permissions: [
      { key: P.USERS_MANAGE, label: 'Gestionar usuarios' },
      { key: P.ROLES_MANAGE, label: 'Gestionar roles' },
      { key: P.AUDIT_VIEW, label: 'Ver auditoría' },
      { key: P.SETTINGS_VIEW, label: 'Ver configuración' },
      { key: P.SETTINGS_MANAGE, label: 'Modificar configuración' },
    ],
  },
];

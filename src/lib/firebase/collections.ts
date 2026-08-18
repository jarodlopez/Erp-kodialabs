/**
 * Nombres canónicos de las colecciones de Firestore.
 *
 * Modelo de datos: colecciones de primer nivel con el campo `organizationId`
 * en cada documento. Esta forma permite:
 *  - Reglas de seguridad simples y baratas
 *    (`resource.data.organizationId == request.auth.token.organizationId`).
 *  - Consultas con índices compuestos eficientes.
 *  - Migración futura a múltiples organizaciones por usuario sin mover datos.
 */
export const COLLECTIONS = {
  ORGANIZATIONS: 'organizations',
  USERS: 'users',
  MEMBERSHIPS: 'memberships',
  SETTINGS: 'settings',
  TAXES: 'taxes',
  WAREHOUSES: 'warehouses',

  CATEGORIES: 'categories',
  PRODUCTS: 'products',
  PRODUCT_STOCK: 'productStock',

  CUSTOMERS: 'customers',
  SUPPLIERS: 'suppliers',

  SALES: 'sales',
  PURCHASES: 'purchases',
  EXPENSES: 'expenses',
  EXPENSE_CATEGORIES: 'expenseCategories',
  RECURRING_EXPENSES: 'recurringExpenses',

  INVENTORY_MOVEMENTS: 'inventoryMovements',
  INVENTORY_TRANSFERS: 'inventoryTransfers',

  FINANCIAL_ACCOUNTS: 'financialAccounts',
  FINANCIAL_TRANSACTIONS: 'financialTransactions',
  TRANSFERS: 'transfers',

  ACCOUNTS_RECEIVABLE: 'accountsReceivable',
  ACCOUNTS_PAYABLE: 'accountsPayable',

  PAYMENTS: 'payments',
  RETURNS: 'returns',

  STORE_SETTINGS: 'storeSettings',
  STORE_LISTINGS: 'storeListings',
  STORE_ORDERS: 'storeOrders',
  STORE_DISCOUNTS: 'storeDiscounts',
  STORE_BANNERS: 'storeBanners',

  AUDIT_LOGS: 'auditLogs',
  COUNTERS: 'counters',
  IDEMPOTENCY: 'idempotencyKeys',

  SUBSCRIPTIONS: 'subscriptions',
  SUBSCRIPTION_PAYMENTS: 'subscriptionPayments',
  PLATFORM_CONFIG: 'platformConfig',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

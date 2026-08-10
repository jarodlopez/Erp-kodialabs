import 'server-only';

/**
 * Referencias tipadas a documentos y colecciones.
 *
 * Los servicios de negocio construyen sus transacciones a partir de estas
 * referencias, de modo que ningún módulo escribe rutas de Firestore "a mano".
 */
import type { CollectionReference, DocumentReference } from 'firebase-admin/firestore';

import { COLLECTIONS } from '@/lib/firebase/collections';
import { db } from './base';
import type { Id } from '@/types/common';

export { db };

export function col(name: string): CollectionReference {
  return db().collection(name);
}

export function newDoc(name: string): DocumentReference {
  return db().collection(name).doc();
}

export function docRef(name: string, id: Id): DocumentReference {
  return db().collection(name).doc(id);
}

export const refs = {
  organization: (id: Id) => docRef(COLLECTIONS.ORGANIZATIONS, id),
  organizations: () => col(COLLECTIONS.ORGANIZATIONS),

  user: (uid: Id) => docRef(COLLECTIONS.USERS, uid),
  users: () => col(COLLECTIONS.USERS),

  membership: (organizationId: Id, uid: Id) =>
    docRef(COLLECTIONS.MEMBERSHIPS, `${organizationId}_${uid}`),
  memberships: () => col(COLLECTIONS.MEMBERSHIPS),

  settings: (organizationId: Id) => docRef(COLLECTIONS.SETTINGS, organizationId),

  taxes: () => col(COLLECTIONS.TAXES),
  tax: (id: Id) => docRef(COLLECTIONS.TAXES, id),

  warehouses: () => col(COLLECTIONS.WAREHOUSES),
  warehouse: (id: Id) => docRef(COLLECTIONS.WAREHOUSES, id),

  categories: () => col(COLLECTIONS.CATEGORIES),
  category: (id: Id) => docRef(COLLECTIONS.CATEGORIES, id),

  products: () => col(COLLECTIONS.PRODUCTS),
  product: (id: Id) => docRef(COLLECTIONS.PRODUCTS, id),

  productStock: (organizationId: Id, productId: Id, warehouseId: Id) =>
    docRef(COLLECTIONS.PRODUCT_STOCK, `${organizationId}_${productId}_${warehouseId}`),
  productStocks: () => col(COLLECTIONS.PRODUCT_STOCK),

  customers: () => col(COLLECTIONS.CUSTOMERS),
  customer: (id: Id) => docRef(COLLECTIONS.CUSTOMERS, id),

  suppliers: () => col(COLLECTIONS.SUPPLIERS),
  supplier: (id: Id) => docRef(COLLECTIONS.SUPPLIERS, id),

  sales: () => col(COLLECTIONS.SALES),
  sale: (id: Id) => docRef(COLLECTIONS.SALES, id),

  purchases: () => col(COLLECTIONS.PURCHASES),
  purchase: (id: Id) => docRef(COLLECTIONS.PURCHASES, id),

  expenses: () => col(COLLECTIONS.EXPENSES),
  expense: (id: Id) => docRef(COLLECTIONS.EXPENSES, id),

  expenseCategories: () => col(COLLECTIONS.EXPENSE_CATEGORIES),
  expenseCategory: (id: Id) => docRef(COLLECTIONS.EXPENSE_CATEGORIES, id),

  recurringExpenses: () => col(COLLECTIONS.RECURRING_EXPENSES),
  recurringExpense: (id: Id) => docRef(COLLECTIONS.RECURRING_EXPENSES, id),

  inventoryMovements: () => col(COLLECTIONS.INVENTORY_MOVEMENTS),
  inventoryMovement: (id: Id) => docRef(COLLECTIONS.INVENTORY_MOVEMENTS, id),

  inventoryTransfers: () => col(COLLECTIONS.INVENTORY_TRANSFERS),
  inventoryTransfer: (id: Id) => docRef(COLLECTIONS.INVENTORY_TRANSFERS, id),

  financialAccounts: () => col(COLLECTIONS.FINANCIAL_ACCOUNTS),
  financialAccount: (id: Id) => docRef(COLLECTIONS.FINANCIAL_ACCOUNTS, id),

  financialTransactions: () => col(COLLECTIONS.FINANCIAL_TRANSACTIONS),
  financialTransaction: (id: Id) => docRef(COLLECTIONS.FINANCIAL_TRANSACTIONS, id),

  transfers: () => col(COLLECTIONS.TRANSFERS),
  transfer: (id: Id) => docRef(COLLECTIONS.TRANSFERS, id),

  receivables: () => col(COLLECTIONS.ACCOUNTS_RECEIVABLE),
  receivable: (id: Id) => docRef(COLLECTIONS.ACCOUNTS_RECEIVABLE, id),

  payables: () => col(COLLECTIONS.ACCOUNTS_PAYABLE),
  payable: (id: Id) => docRef(COLLECTIONS.ACCOUNTS_PAYABLE, id),

  payments: () => col(COLLECTIONS.PAYMENTS),
  payment: (id: Id) => docRef(COLLECTIONS.PAYMENTS, id),

  returns: () => col(COLLECTIONS.RETURNS),
  return: (id: Id) => docRef(COLLECTIONS.RETURNS, id),

  auditLogs: () => col(COLLECTIONS.AUDIT_LOGS),
  auditLog: (id: Id) => docRef(COLLECTIONS.AUDIT_LOGS, id),

  subscription: (organizationId: Id) => docRef(COLLECTIONS.SUBSCRIPTIONS, organizationId),
  subscriptions: () => col(COLLECTIONS.SUBSCRIPTIONS),

  subscriptionPayment: (id: Id) => docRef(COLLECTIONS.SUBSCRIPTION_PAYMENTS, id),
  subscriptionPayments: () => col(COLLECTIONS.SUBSCRIPTION_PAYMENTS),

  counter: (organizationId: Id, key: string) =>
    docRef(COLLECTIONS.COUNTERS, `${organizationId}_${key}`),

  idempotency: (organizationId: Id, key: string) =>
    docRef(COLLECTIONS.IDEMPOTENCY, `${organizationId}_${key}`),
};

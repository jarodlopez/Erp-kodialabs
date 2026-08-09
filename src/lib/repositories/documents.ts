import 'server-only';

/**
 * Repositorios de documentos operativos: ventas, compras, gastos y
 * devoluciones. Todas las consultas están acotadas por `organizationId` y
 * ordenadas por fecha descendente con paginación por cursor.
 */
import type { Query } from 'firebase-admin/firestore';

import { errors } from '@/lib/errors';
import type { Id, Page } from '@/types/common';
import type { Expense, ExpenseCategory, RecurringExpense } from '@/types/expenses';
import type { Purchase, PurchaseStatus } from '@/types/purchases';
import type { ReturnDocument } from '@/types/returns';
import type { Sale, SaleStatus } from '@/types/sales';
import {
  collectQuery,
  endOfDayIso,
  mapDoc,
  nowIso,
  paginateQuery,
  startOfDayIso,
  type PaginationOptions,
} from './base';
import { refs } from './refs';

export interface DocumentFilters {
  from?: string | null;
  to?: string | null;
  status?: string | null;
  partyId?: string | null;
  sellerId?: string | null;
  categoryId?: string | null;
  number?: string | null;
}

function applyDateRange(query: Query, filters: DocumentFilters): Query {
  let q = query;
  if (filters.from) q = q.where('date', '>=', startOfDayIso(filters.from));
  if (filters.to) q = q.where('date', '<=', endOfDayIso(filters.to));
  return q;
}

export const saleRepository = {
  async list(
    organizationId: Id,
    filters: DocumentFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<Sale>> {
    if (filters.number) {
      const snap = await refs
        .sales()
        .where('organizationId', '==', organizationId)
        .where('number', '==', filters.number.trim().toUpperCase())
        .limit(1)
        .get();
      const items = snap.docs
        .map((d) => mapDoc<Sale>(d))
        .filter((s): s is Sale => s !== null);
      return { items, nextCursor: null, hasMore: false };
    }

    let query: Query = refs.sales().where('organizationId', '==', organizationId);
    if (filters.status) query = query.where('status', '==', filters.status);
    if (filters.partyId) query = query.where('customerId', '==', filters.partyId);
    if (filters.sellerId) query = query.where('sellerId', '==', filters.sellerId);
    query = applyDateRange(query, filters).orderBy('date', 'desc').orderBy('__name__', 'desc');

    return paginateQuery<Sale>(query, pagination, ['date', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<Sale | null> {
    const snap = await refs.sale(id).get();
    const sale = mapDoc<Sale>(snap);
    if (!sale || sale.organizationId !== organizationId) return null;
    return sale;
  },

  async require(organizationId: Id, id: Id): Promise<Sale> {
    const sale = await saleRepository.get(organizationId, id);
    if (!sale) throw errors.notFound('Venta');
    return sale;
  },

  /** Ventas de un rango, para reportes y estado de resultados. */
  async inRange(organizationId: Id, from: string, to: string, statuses: SaleStatus[]): Promise<Sale[]> {
    const sales = await collectQuery<Sale>(
      refs
        .sales()
        .where('organizationId', '==', organizationId)
        .where('date', '>=', startOfDayIso(from))
        .where('date', '<=', endOfDayIso(to))
        .orderBy('date', 'desc'),
      5000,
    );
    return sales.filter((s) => statuses.includes(s.status));
  },

  async recent(organizationId: Id, max = 5): Promise<Sale[]> {
    return collectQuery<Sale>(
      refs.sales().where('organizationId', '==', organizationId).orderBy('date', 'desc'),
      max,
    );
  },

  async byCustomer(organizationId: Id, customerId: Id, max = 20): Promise<Sale[]> {
    return collectQuery<Sale>(
      refs
        .sales()
        .where('organizationId', '==', organizationId)
        .where('customerId', '==', customerId)
        .orderBy('date', 'desc'),
      max,
    );
  },
};

export const purchaseRepository = {
  async list(
    organizationId: Id,
    filters: DocumentFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<Purchase>> {
    let query: Query = refs.purchases().where('organizationId', '==', organizationId);
    if (filters.status) query = query.where('status', '==', filters.status);
    if (filters.partyId) query = query.where('supplierId', '==', filters.partyId);
    query = applyDateRange(query, filters).orderBy('date', 'desc').orderBy('__name__', 'desc');
    return paginateQuery<Purchase>(query, pagination, ['date', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<Purchase | null> {
    const snap = await refs.purchase(id).get();
    const purchase = mapDoc<Purchase>(snap);
    if (!purchase || purchase.organizationId !== organizationId) return null;
    return purchase;
  },

  async require(organizationId: Id, id: Id): Promise<Purchase> {
    const purchase = await purchaseRepository.get(organizationId, id);
    if (!purchase) throw errors.notFound('Compra');
    return purchase;
  },

  async inRange(
    organizationId: Id,
    from: string,
    to: string,
    statuses: PurchaseStatus[],
  ): Promise<Purchase[]> {
    const purchases = await collectQuery<Purchase>(
      refs
        .purchases()
        .where('organizationId', '==', organizationId)
        .where('date', '>=', startOfDayIso(from))
        .where('date', '<=', endOfDayIso(to))
        .orderBy('date', 'desc'),
      5000,
    );
    return purchases.filter((p) => statuses.includes(p.status));
  },

  async bySupplier(organizationId: Id, supplierId: Id, max = 20): Promise<Purchase[]> {
    return collectQuery<Purchase>(
      refs
        .purchases()
        .where('organizationId', '==', organizationId)
        .where('supplierId', '==', supplierId)
        .orderBy('date', 'desc'),
      max,
    );
  },
};

export const expenseCategoryRepository = {
  async list(organizationId: Id, includeInactive = false): Promise<ExpenseCategory[]> {
    let query: Query = refs.expenseCategories().where('organizationId', '==', organizationId);
    if (!includeInactive) query = query.where('status', '==', 'ACTIVE');
    return collectQuery<ExpenseCategory>(query.orderBy('name'), 200);
  },

  async get(organizationId: Id, id: Id): Promise<ExpenseCategory | null> {
    const snap = await refs.expenseCategory(id).get();
    const category = mapDoc<ExpenseCategory>(snap);
    if (!category || category.organizationId !== organizationId) return null;
    return category;
  },

  async require(organizationId: Id, id: Id): Promise<ExpenseCategory> {
    const category = await expenseCategoryRepository.get(organizationId, id);
    if (!category) throw errors.notFound('Categoría de gasto');
    return category;
  },
};

export const expenseRepository = {
  async list(
    organizationId: Id,
    filters: DocumentFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<Expense>> {
    let query: Query = refs.expenses().where('organizationId', '==', organizationId);
    if (filters.status) query = query.where('status', '==', filters.status);
    if (filters.categoryId) query = query.where('categoryId', '==', filters.categoryId);
    if (filters.partyId) query = query.where('supplierId', '==', filters.partyId);
    query = applyDateRange(query, filters).orderBy('date', 'desc').orderBy('__name__', 'desc');
    return paginateQuery<Expense>(query, pagination, ['date', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<Expense | null> {
    const snap = await refs.expense(id).get();
    const expense = mapDoc<Expense>(snap);
    if (!expense || expense.organizationId !== organizationId) return null;
    return expense;
  },

  async require(organizationId: Id, id: Id): Promise<Expense> {
    const expense = await expenseRepository.get(organizationId, id);
    if (!expense) throw errors.notFound('Gasto');
    return expense;
  },

  async inRange(organizationId: Id, from: string, to: string): Promise<Expense[]> {
    const expenses = await collectQuery<Expense>(
      refs
        .expenses()
        .where('organizationId', '==', organizationId)
        .where('date', '>=', startOfDayIso(from))
        .where('date', '<=', endOfDayIso(to))
        .orderBy('date', 'desc'),
      5000,
    );
    return expenses.filter((e) => e.status === 'REGISTERED');
  },
};

export const recurringExpenseRepository = {
  async list(organizationId: Id): Promise<RecurringExpense[]> {
    return collectQuery<RecurringExpense>(
      refs
        .recurringExpenses()
        .where('organizationId', '==', organizationId)
        .orderBy('nextDate'),
      200,
    );
  },

  async get(organizationId: Id, id: Id): Promise<RecurringExpense | null> {
    const snap = await refs.recurringExpense(id).get();
    const item = mapDoc<RecurringExpense>(snap);
    if (!item || item.organizationId !== organizationId) return null;
    return item;
  },

  /** Recurrencias vencidas de TODAS las organizaciones (uso exclusivo del cron). */
  async listDue(reference: string = nowIso(), max = 500): Promise<RecurringExpense[]> {
    return collectQuery<RecurringExpense>(
      refs
        .recurringExpenses()
        .where('status', '==', 'ACTIVE')
        .where('nextDate', '<=', reference)
        .orderBy('nextDate'),
      max,
    );
  },
};

export const returnRepository = {
  async list(
    organizationId: Id,
    filters: DocumentFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<ReturnDocument>> {
    let query: Query = refs.returns().where('organizationId', '==', organizationId);
    if (filters.status) query = query.where('type', '==', filters.status);
    query = applyDateRange(query, filters).orderBy('date', 'desc').orderBy('__name__', 'desc');
    return paginateQuery<ReturnDocument>(query, pagination, ['date', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<ReturnDocument | null> {
    const snap = await refs.return(id).get();
    const doc = mapDoc<ReturnDocument>(snap);
    if (!doc || doc.organizationId !== organizationId) return null;
    return doc;
  },

  async byReference(organizationId: Id, referenceId: Id): Promise<ReturnDocument[]> {
    return collectQuery<ReturnDocument>(
      refs
        .returns()
        .where('organizationId', '==', organizationId)
        .where('referenceId', '==', referenceId)
        .orderBy('date', 'desc'),
      100,
    );
  },

  async inRange(organizationId: Id, from: string, to: string): Promise<ReturnDocument[]> {
    return collectQuery<ReturnDocument>(
      refs
        .returns()
        .where('organizationId', '==', organizationId)
        .where('date', '>=', startOfDayIso(from))
        .where('date', '<=', endOfDayIso(to))
        .orderBy('date', 'desc'),
      2000,
    );
  },
};

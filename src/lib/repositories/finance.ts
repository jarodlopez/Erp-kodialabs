import 'server-only';

import type { Query } from 'firebase-admin/firestore';

import { errors } from '@/lib/errors';
import type { Id, Page } from '@/types/common';
import type {
  AccountPayable,
  AccountReceivable,
  FinancialAccount,
  FinancialTransaction,
  Payment,
  Transfer,
} from '@/types/finance';
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

export const accountRepository = {
  async list(organizationId: Id, includeInactive = false): Promise<FinancialAccount[]> {
    let query: Query = refs.financialAccounts().where('organizationId', '==', organizationId);
    if (!includeInactive) query = query.where('status', '==', 'ACTIVE');
    return collectQuery<FinancialAccount>(query.orderBy('name'), 100);
  },

  async get(organizationId: Id, id: Id): Promise<FinancialAccount | null> {
    const snap = await refs.financialAccount(id).get();
    const account = mapDoc<FinancialAccount>(snap);
    if (!account || account.organizationId !== organizationId) return null;
    return account;
  },

  async require(organizationId: Id, id: Id): Promise<FinancialAccount> {
    const account = await accountRepository.get(organizationId, id);
    if (!account) throw errors.notFound('Cuenta financiera');
    return account;
  },

  async getDefault(organizationId: Id): Promise<FinancialAccount | null> {
    const snap = await refs
      .financialAccounts()
      .where('organizationId', '==', organizationId)
      .where('isDefault', '==', true)
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<FinancialAccount>(snap.docs[0]);
  },

  async update(id: Id, data: Partial<FinancialAccount>, userId: Id): Promise<void> {
    await refs
      .financialAccount(id)
      .set({ ...data, updatedAt: nowIso(), updatedBy: userId }, { merge: true });
  },
};

export interface LedgerFilters {
  accountId?: string | null;
  from?: string | null;
  to?: string | null;
  direction?: 'IN' | 'OUT' | null;
  type?: string | null;
}

export const ledgerRepository = {
  async list(
    organizationId: Id,
    filters: LedgerFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<FinancialTransaction>> {
    let query: Query = refs.financialTransactions().where('organizationId', '==', organizationId);
    if (filters.accountId) query = query.where('accountId', '==', filters.accountId);
    if (filters.direction) query = query.where('direction', '==', filters.direction);
    if (filters.type) query = query.where('type', '==', filters.type);
    if (filters.from) query = query.where('date', '>=', startOfDayIso(filters.from));
    if (filters.to) query = query.where('date', '<=', endOfDayIso(filters.to));
    query = query.orderBy('date', 'desc').orderBy('__name__', 'desc');
    return paginateQuery<FinancialTransaction>(query, pagination, ['date', '__name__']);
  },

  async inRange(
    organizationId: Id,
    from: string,
    to: string,
    accountId?: Id | null,
  ): Promise<FinancialTransaction[]> {
    let query: Query = refs
      .financialTransactions()
      .where('organizationId', '==', organizationId)
      .where('date', '>=', startOfDayIso(from))
      .where('date', '<=', endOfDayIso(to));
    if (accountId) query = query.where('accountId', '==', accountId);
    return collectQuery<FinancialTransaction>(query.orderBy('date', 'desc'), 5000);
  },

  /** Suma de movimientos anteriores a una fecha, para calcular saldo inicial. */
  async sumBefore(organizationId: Id, date: string, accountId?: Id | null): Promise<{ in: number; out: number }> {
    let query: Query = refs
      .financialTransactions()
      .where('organizationId', '==', organizationId)
      .where('date', '<', startOfDayIso(date));
    if (accountId) query = query.where('accountId', '==', accountId);

    const rows = await collectQuery<FinancialTransaction>(query.orderBy('date'), 20000);
    let inflow = 0;
    let outflow = 0;
    for (const row of rows) {
      if (row.direction === 'IN') inflow += row.amount;
      else outflow += row.amount;
    }
    return { in: inflow, out: outflow };
  },

  async byReference(organizationId: Id, referenceId: Id): Promise<FinancialTransaction[]> {
    return collectQuery<FinancialTransaction>(
      refs
        .financialTransactions()
        .where('organizationId', '==', organizationId)
        .where('referenceId', '==', referenceId)
        .orderBy('date', 'desc'),
      200,
    );
  },
};

export const transferRepository = {
  async list(organizationId: Id, pagination: PaginationOptions = {}): Promise<Page<Transfer>> {
    const query = refs
      .transfers()
      .where('organizationId', '==', organizationId)
      .orderBy('date', 'desc')
      .orderBy('__name__', 'desc');
    return paginateQuery<Transfer>(query, pagination, ['date', '__name__']);
  },
};

export interface DebtFilters {
  status?: string | null;
  partyId?: string | null;
  overdueOnly?: boolean;
  dueBefore?: string | null;
}

export const receivableRepository = {
  async list(
    organizationId: Id,
    filters: DebtFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<AccountReceivable>> {
    let query: Query = refs.receivables().where('organizationId', '==', organizationId);
    if (filters.status) query = query.where('status', '==', filters.status);
    if (filters.partyId) query = query.where('customerId', '==', filters.partyId);
    query = query.orderBy('dueDate').orderBy('__name__');
    return paginateQuery<AccountReceivable>(query, pagination, ['dueDate', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<AccountReceivable | null> {
    const snap = await refs.receivable(id).get();
    const item = mapDoc<AccountReceivable>(snap);
    if (!item || item.organizationId !== organizationId) return null;
    return item;
  },

  async require(organizationId: Id, id: Id): Promise<AccountReceivable> {
    const item = await receivableRepository.get(organizationId, id);
    if (!item) throw errors.notFound('Cuenta por cobrar');
    return item;
  },

  async bySale(organizationId: Id, saleId: Id): Promise<AccountReceivable | null> {
    const snap = await refs
      .receivables()
      .where('organizationId', '==', organizationId)
      .where('referenceId', '==', saleId)
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<AccountReceivable>(snap.docs[0]);
  },

  async outstanding(organizationId: Id, max = 2000): Promise<AccountReceivable[]> {
    return collectQuery<AccountReceivable>(
      refs
        .receivables()
        .where('organizationId', '==', organizationId)
        .where('status', 'in', ['PENDING', 'PARTIAL', 'OVERDUE'])
        .orderBy('dueDate'),
      max,
    );
  },

  async byCustomer(organizationId: Id, customerId: Id, max = 100): Promise<AccountReceivable[]> {
    return collectQuery<AccountReceivable>(
      refs
        .receivables()
        .where('organizationId', '==', organizationId)
        .where('customerId', '==', customerId)
        .orderBy('dueDate', 'desc'),
      max,
    );
  },
};

export const payableRepository = {
  async list(
    organizationId: Id,
    filters: DebtFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<AccountPayable>> {
    let query: Query = refs.payables().where('organizationId', '==', organizationId);
    if (filters.status) query = query.where('status', '==', filters.status);
    if (filters.partyId) query = query.where('supplierId', '==', filters.partyId);
    query = query.orderBy('dueDate').orderBy('__name__');
    return paginateQuery<AccountPayable>(query, pagination, ['dueDate', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<AccountPayable | null> {
    const snap = await refs.payable(id).get();
    const item = mapDoc<AccountPayable>(snap);
    if (!item || item.organizationId !== organizationId) return null;
    return item;
  },

  async require(organizationId: Id, id: Id): Promise<AccountPayable> {
    const item = await payableRepository.get(organizationId, id);
    if (!item) throw errors.notFound('Cuenta por pagar');
    return item;
  },

  async byReference(organizationId: Id, referenceId: Id): Promise<AccountPayable | null> {
    const snap = await refs
      .payables()
      .where('organizationId', '==', organizationId)
      .where('referenceId', '==', referenceId)
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<AccountPayable>(snap.docs[0]);
  },

  async outstanding(organizationId: Id, max = 2000): Promise<AccountPayable[]> {
    return collectQuery<AccountPayable>(
      refs
        .payables()
        .where('organizationId', '==', organizationId)
        .where('status', 'in', ['PENDING', 'PARTIAL', 'OVERDUE'])
        .orderBy('dueDate'),
      max,
    );
  },

  async bySupplier(organizationId: Id, supplierId: Id, max = 100): Promise<AccountPayable[]> {
    return collectQuery<AccountPayable>(
      refs
        .payables()
        .where('organizationId', '==', organizationId)
        .where('supplierId', '==', supplierId)
        .orderBy('dueDate', 'desc'),
      max,
    );
  },
};

export const paymentRepository = {
  async list(
    organizationId: Id,
    filters: { from?: string | null; to?: string | null; type?: string | null } = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<Payment>> {
    let query: Query = refs.payments().where('organizationId', '==', organizationId);
    if (filters.type) query = query.where('type', '==', filters.type);
    if (filters.from) query = query.where('date', '>=', startOfDayIso(filters.from));
    if (filters.to) query = query.where('date', '<=', endOfDayIso(filters.to));
    query = query.orderBy('date', 'desc').orderBy('__name__', 'desc');
    return paginateQuery<Payment>(query, pagination, ['date', '__name__']);
  },

  async byReference(organizationId: Id, referenceId: Id): Promise<Payment[]> {
    return collectQuery<Payment>(
      refs
        .payments()
        .where('organizationId', '==', organizationId)
        .where('referenceId', '==', referenceId)
        .orderBy('date', 'desc'),
      100,
    );
  },
};

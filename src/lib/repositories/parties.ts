import 'server-only';

import type { Query } from 'firebase-admin/firestore';

import { errors } from '@/lib/errors';
import type { EntityStatus, Id, Page } from '@/types/common';
import type { Customer, Supplier } from '@/types/parties';
import {
  collectQuery,
  mapDoc,
  nowIso,
  paginateQuery,
  prefixRange,
  type PaginationOptions,
} from './base';
import { refs } from './refs';

export interface PartyFilters {
  search?: string | null;
  status?: EntityStatus | 'ALL';
  withDebtOnly?: boolean;
}

function buildPartyQuery(base: Query, organizationId: Id, filters: PartyFilters): Query {
  let query = base.where('organizationId', '==', organizationId);
  if (filters.status && filters.status !== 'ALL') {
    query = query.where('status', '==', filters.status);
  }
  if (filters.withDebtOnly) {
    query = query.where('stats.outstandingBalance', '>', 0);
  }
  const term = filters.search?.trim();
  if (term) {
    const [start, end] = prefixRange(term);
    query = query.where('searchName', '>=', start).where('searchName', '<=', end);
  }
  return query;
}

export const customerRepository = {
  async list(
    organizationId: Id,
    filters: PartyFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<Customer>> {
    if (filters.withDebtOnly) {
      const query = refs
        .customers()
        .where('organizationId', '==', organizationId)
        .where('stats.outstandingBalance', '>', 0)
        .orderBy('stats.outstandingBalance', 'desc')
        .orderBy('__name__');
      return paginateQuery<Customer>(query, pagination, ['stats.outstandingBalance', '__name__']);
    }
    const query = buildPartyQuery(refs.customers(), organizationId, filters)
      .orderBy('searchName')
      .orderBy('__name__');
    return paginateQuery<Customer>(query, pagination, ['searchName', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<Customer | null> {
    const snap = await refs.customer(id).get();
    const customer = mapDoc<Customer>(snap);
    if (!customer || customer.organizationId !== organizationId) return null;
    return customer;
  },

  async require(organizationId: Id, id: Id): Promise<Customer> {
    const customer = await customerRepository.get(organizationId, id);
    if (!customer) throw errors.notFound('Cliente');
    return customer;
  },

  async findByDocument(organizationId: Id, document: string): Promise<Customer | null> {
    const snap = await refs
      .customers()
      .where('organizationId', '==', organizationId)
      .where('document', '==', document.trim())
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<Customer>(snap.docs[0]);
  },

  /**
   * Cliente por teléfono. Es la llave natural de los pedidos web: el
   * comprador deja su número, no su cédula, y así los pedidos repetidos se
   * acumulan en la misma ficha en lugar de crear un cliente por compra.
   */
  async findByPhone(organizationId: Id, phone: string): Promise<Customer | null> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (!clean) return null;
    const snap = await refs
      .customers()
      .where('organizationId', '==', organizationId)
      .where('phone', '==', clean)
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<Customer>(snap.docs[0]);
  },

  async quickSearch(organizationId: Id, term: string, max = 15): Promise<Customer[]> {
    const clean = term.trim();
    let query: Query = refs
      .customers()
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE');
    if (clean) {
      const [start, end] = prefixRange(clean);
      query = query.where('searchName', '>=', start).where('searchName', '<=', end);
    }
    return collectQuery<Customer>(query.orderBy('searchName'), max);
  },

  async count(organizationId: Id): Promise<number> {
    const snap = await refs
      .customers()
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE')
      .count()
      .get();
    return snap.data().count;
  },

  async update(id: Id, data: Partial<Customer>, userId: Id): Promise<void> {
    await refs.customer(id).set({ ...data, updatedAt: nowIso(), updatedBy: userId }, { merge: true });
  },
};

export const supplierRepository = {
  async list(
    organizationId: Id,
    filters: PartyFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<Supplier>> {
    if (filters.withDebtOnly) {
      const query = refs
        .suppliers()
        .where('organizationId', '==', organizationId)
        .where('stats.outstandingBalance', '>', 0)
        .orderBy('stats.outstandingBalance', 'desc')
        .orderBy('__name__');
      return paginateQuery<Supplier>(query, pagination, ['stats.outstandingBalance', '__name__']);
    }
    const query = buildPartyQuery(refs.suppliers(), organizationId, filters)
      .orderBy('searchName')
      .orderBy('__name__');
    return paginateQuery<Supplier>(query, pagination, ['searchName', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<Supplier | null> {
    const snap = await refs.supplier(id).get();
    const supplier = mapDoc<Supplier>(snap);
    if (!supplier || supplier.organizationId !== organizationId) return null;
    return supplier;
  },

  async require(organizationId: Id, id: Id): Promise<Supplier> {
    const supplier = await supplierRepository.get(organizationId, id);
    if (!supplier) throw errors.notFound('Proveedor');
    return supplier;
  },

  async quickSearch(organizationId: Id, term: string, max = 15): Promise<Supplier[]> {
    const clean = term.trim();
    let query: Query = refs
      .suppliers()
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE');
    if (clean) {
      const [start, end] = prefixRange(clean);
      query = query.where('searchName', '>=', start).where('searchName', '<=', end);
    }
    return collectQuery<Supplier>(query.orderBy('searchName'), max);
  },

  async count(organizationId: Id): Promise<number> {
    const snap = await refs
      .suppliers()
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE')
      .count()
      .get();
    return snap.data().count;
  },

  async update(id: Id, data: Partial<Supplier>, userId: Id): Promise<void> {
    await refs.supplier(id).set({ ...data, updatedAt: nowIso(), updatedBy: userId }, { merge: true });
  },
};

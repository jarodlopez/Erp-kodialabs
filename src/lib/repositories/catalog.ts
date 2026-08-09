import 'server-only';

import type { Query } from 'firebase-admin/firestore';

import { errors } from '@/lib/errors';
import type { EntityStatus, Id, Page } from '@/types/common';
import type { Category, Product } from '@/types/catalog';
import {
  chunk,
  collectQuery,
  mapDoc,
  nowIso,
  paginateQuery,
  prefixRange,
  requireDoc,
  type PaginationOptions,
} from './base';
import { refs } from './refs';

export const categoryRepository = {
  async list(organizationId: Id, includeInactive = false): Promise<Category[]> {
    let query: Query = refs.categories().where('organizationId', '==', organizationId);
    if (!includeInactive) query = query.where('status', '==', 'ACTIVE');
    return collectQuery<Category>(query.orderBy('name'), 500);
  },

  async get(organizationId: Id, id: Id): Promise<Category | null> {
    const snap = await refs.category(id).get();
    const category = mapDoc<Category>(snap);
    if (!category || category.organizationId !== organizationId) return null;
    return category;
  },

  async require(organizationId: Id, id: Id): Promise<Category> {
    const category = await categoryRepository.get(organizationId, id);
    if (!category) throw errors.notFound('Categoría');
    return category;
  },

  async findByName(organizationId: Id, name: string): Promise<Category | null> {
    const snap = await refs
      .categories()
      .where('organizationId', '==', organizationId)
      .where('name', '==', name)
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<Category>(snap.docs[0]);
  },

  async countProducts(organizationId: Id, categoryId: Id): Promise<number> {
    const snap = await refs
      .products()
      .where('organizationId', '==', organizationId)
      .where('categoryId', '==', categoryId)
      .count()
      .get();
    return snap.data().count;
  },
};

export interface ProductFilters {
  search?: string | null;
  categoryId?: Id | null;
  status?: EntityStatus | 'ALL';
  lowStockOnly?: boolean;
  outOfStockOnly?: boolean;
}

export const productRepository = {
  async list(
    organizationId: Id,
    filters: ProductFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<Product>> {
    let query: Query = refs.products().where('organizationId', '==', organizationId);

    if (filters.status && filters.status !== 'ALL') {
      query = query.where('status', '==', filters.status);
    }
    if (filters.categoryId) {
      query = query.where('categoryId', '==', filters.categoryId);
    }
    if (filters.lowStockOnly) {
      query = query.where('isLowStock', '==', true);
    }

    // Cuando se filtra por "sin existencias" el orden debe empezar por el
    // campo con desigualdad (`stock`), que es lo que exige Firestore.
    if (filters.outOfStockOnly) {
      query = query.where('stock', '<=', 0).orderBy('stock').orderBy('__name__');
      return paginateQuery<Product>(query, pagination, ['stock', '__name__']);
    }

    const term = filters.search?.trim();
    if (term) {
      const [start, end] = prefixRange(term);
      query = query.where('searchName', '>=', start).where('searchName', '<=', end);
    }

    query = query.orderBy('searchName').orderBy('__name__');
    return paginateQuery<Product>(query, pagination, ['searchName', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<Product | null> {
    const snap = await refs.product(id).get();
    const product = mapDoc<Product>(snap);
    if (!product || product.organizationId !== organizationId) return null;
    return product;
  },

  async require(organizationId: Id, id: Id): Promise<Product> {
    const product = await productRepository.get(organizationId, id);
    if (!product) throw errors.notFound('Producto');
    return product;
  },

  async findBySku(organizationId: Id, sku: string): Promise<Product | null> {
    const snap = await refs
      .products()
      .where('organizationId', '==', organizationId)
      .where('sku', '==', sku.trim().toUpperCase())
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<Product>(snap.docs[0]);
  },

  async findByBarcode(organizationId: Id, barcode: string): Promise<Product | null> {
    const snap = await refs
      .products()
      .where('organizationId', '==', organizationId)
      .where('barcode', '==', barcode.trim())
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<Product>(snap.docs[0]);
  },

  /** Lee varios productos por id respetando el límite de 30 de `in`. */
  async listByIds(organizationId: Id, ids: Id[]): Promise<Product[]> {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return [];

    const results: Product[] = [];
    for (const group of chunk(unique, 30)) {
      const snap = await refs.products().where('__name__', 'in', group).get();
      for (const doc of snap.docs) {
        const product = mapDoc<Product>(doc);
        if (product && product.organizationId === organizationId) results.push(product);
      }
    }
    return results;
  },

  /** Búsqueda rápida para selectores (nombre o SKU). */
  async quickSearch(organizationId: Id, term: string, max = 15): Promise<Product[]> {
    const clean = term.trim();
    if (!clean) {
      return collectQuery<Product>(
        refs
          .products()
          .where('organizationId', '==', organizationId)
          .where('status', '==', 'ACTIVE')
          .orderBy('searchName')
          .limit(max),
        max,
      );
    }

    const [start, end] = prefixRange(clean);
    const byName = await refs
      .products()
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE')
      .where('searchName', '>=', start)
      .where('searchName', '<=', end)
      .orderBy('searchName')
      .limit(max)
      .get();

    const found = byName.docs
      .map((d) => mapDoc<Product>(d))
      .filter((p): p is Product => p !== null);

    if (found.length > 0) return found;

    const upper = clean.toUpperCase();
    const bySku = await refs
      .products()
      .where('organizationId', '==', organizationId)
      .where('sku', '>=', upper)
      .where('sku', '<=', `${upper}\uf8ff`)
      .orderBy('sku')
      .limit(max)
      .get();

    return bySku.docs.map((d) => mapDoc<Product>(d)).filter((p): p is Product => p !== null);
  },

  async lowStock(organizationId: Id, max = 50): Promise<Product[]> {
    return collectQuery<Product>(
      refs
        .products()
        .where('organizationId', '==', organizationId)
        .where('status', '==', 'ACTIVE')
        .where('isLowStock', '==', true)
        .orderBy('searchName')
        .limit(max),
      max,
    );
  },

  async countActive(organizationId: Id): Promise<number> {
    const snap = await refs
      .products()
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE')
      .count()
      .get();
    return snap.data().count;
  },

  async allActive(organizationId: Id, max = 5000): Promise<Product[]> {
    return collectQuery<Product>(
      refs
        .products()
        .where('organizationId', '==', organizationId)
        .where('status', '==', 'ACTIVE')
        .orderBy('__name__'),
      max,
    );
  },

  async update(id: Id, data: Partial<Product>, userId: Id): Promise<void> {
    await refs.product(id).set({ ...data, updatedAt: nowIso(), updatedBy: userId }, { merge: true });
  },

  async requireRaw(id: Id): Promise<Product> {
    const snap = await refs.product(id).get();
    return requireDoc<Product>(snap, 'Producto');
  },
};

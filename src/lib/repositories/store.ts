import 'server-only';

/**
 * Repositorios de la tienda online.
 *
 * La búsqueda por `slug` es el único acceso que ocurre SIN sesión: el sitio
 * público resuelve la organización a partir de la URL. Por eso todas las
 * lecturas públicas parten de aquí y nunca reciben un `organizationId` desde
 * el navegador.
 */
import type { Query } from 'firebase-admin/firestore';

import { errors } from '@/lib/errors';
import type { EntityStatus, Id, Page } from '@/types/common';
import type {
  StoreBanner,
  StoreDiscount,
  StoreListing,
  StoreOrder,
  StoreOrderStatus,
  StoreSettings,
} from '@/types/store';
import {
  collectQuery,
  mapDoc,
  nowIso,
  normalizeSearch,
  paginateQuery,
  type PaginationOptions,
} from './base';
import { refs } from './refs';

export const storeSettingsRepository = {
  async get(organizationId: Id): Promise<StoreSettings | null> {
    const snap = await refs.storeSetting(organizationId).get();
    return mapDoc<StoreSettings>(snap);
  },

  async require(organizationId: Id): Promise<StoreSettings> {
    const settings = await storeSettingsRepository.get(organizationId);
    if (!settings) throw errors.notFound('Tienda');
    return settings;
  },

  /** Resuelve la tienda a partir del slug público. */
  async findBySlug(slug: string): Promise<StoreSettings | null> {
    const snap = await refs
      .storeSettings()
      .where('slug', '==', slug.trim().toLowerCase())
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<StoreSettings>(snap.docs[0]);
  },

  /** `true` si el slug ya lo usa OTRA organización. */
  async slugTaken(slug: string, organizationId: Id): Promise<boolean> {
    const existing = await storeSettingsRepository.findBySlug(slug);
    return Boolean(existing && existing.organizationId !== organizationId);
  },

  async save(settings: StoreSettings): Promise<void> {
    await refs.storeSetting(settings.organizationId).set(settings, { merge: true });
  },

  async patch(organizationId: Id, data: Partial<StoreSettings>, userId: Id): Promise<void> {
    await refs.storeSetting(organizationId).set(
      { ...data, updatedAt: nowIso(), updatedBy: userId },
      { merge: true },
    );
  },
};

export const storeListingRepository = {
  /** Fichas de la organización, ordenadas como se muestran en la vitrina. */
  async list(organizationId: Id, visibleOnly = false): Promise<StoreListing[]> {
    let query: Query = refs.storeListings().where('organizationId', '==', organizationId);
    if (visibleOnly) query = query.where('visible', '==', true);
    const items = await collectQuery<StoreListing>(query, 1000);
    return items.sort(
      (a, b) => a.position - b.position || a.searchTitle.localeCompare(b.searchTitle),
    );
  },

  async get(organizationId: Id, productId: Id): Promise<StoreListing | null> {
    const snap = await refs.storeListing(organizationId, productId).get();
    const listing = mapDoc<StoreListing>(snap);
    if (!listing || listing.organizationId !== organizationId) return null;
    return listing;
  },

  async require(organizationId: Id, productId: Id): Promise<StoreListing> {
    const listing = await storeListingRepository.get(organizationId, productId);
    if (!listing) throw errors.notFound('Producto publicado');
    return listing;
  },

  async save(listing: StoreListing): Promise<void> {
    await refs.storeListing(listing.organizationId, listing.productId).set(listing);
  },

  async patch(
    organizationId: Id,
    productId: Id,
    data: Partial<StoreListing>,
    userId: Id,
  ): Promise<void> {
    await refs
      .storeListing(organizationId, productId)
      .set({ ...data, updatedAt: nowIso(), updatedBy: userId }, { merge: true });
  },

  async remove(organizationId: Id, productId: Id): Promise<void> {
    await refs.storeListing(organizationId, productId).delete();
  },

  async count(organizationId: Id, visibleOnly = false): Promise<number> {
    let query: Query = refs.storeListings().where('organizationId', '==', organizationId);
    if (visibleOnly) query = query.where('visible', '==', true);
    const snap = await query.count().get();
    return snap.data().count;
  },

  /**
   * Todas las fichas que referencian un producto, sea como principal o como
   * variante. Se usa al despublicar o desactivar un producto del ERP.
   */
  async findByProduct(organizationId: Id, productId: Id): Promise<StoreListing[]> {
    const all = await storeListingRepository.list(organizationId);
    return all.filter(
      (listing) =>
        listing.productId === productId ||
        listing.variants.some((variant) => variant.productId === productId),
    );
  },
};

export interface StoreOrderFilters {
  status?: StoreOrderStatus | 'ALL';
  from?: string | null;
  to?: string | null;
}

export const storeOrderRepository = {
  async list(
    organizationId: Id,
    filters: StoreOrderFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<StoreOrder>> {
    let query: Query = refs.storeOrders().where('organizationId', '==', organizationId);

    if (filters.status && filters.status !== 'ALL') {
      query = query.where('status', '==', filters.status);
    }
    if (filters.from) query = query.where('createdAt', '>=', filters.from);
    if (filters.to) query = query.where('createdAt', '<=', filters.to);

    query = query.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    return paginateQuery<StoreOrder>(query, pagination, ['createdAt', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<StoreOrder | null> {
    const snap = await refs.storeOrder(id).get();
    const order = mapDoc<StoreOrder>(snap);
    if (!order || order.organizationId !== organizationId) return null;
    return order;
  },

  async require(organizationId: Id, id: Id): Promise<StoreOrder> {
    const order = await storeOrderRepository.get(organizationId, id);
    if (!order) throw errors.notFound('Pedido');
    return order;
  },

  async countByStatus(organizationId: Id, status: StoreOrderStatus): Promise<number> {
    const snap = await refs
      .storeOrders()
      .where('organizationId', '==', organizationId)
      .where('status', '==', status)
      .count()
      .get();
    return snap.data().count;
  },

  /** Pedidos aprobados desde una fecha, para el resumen del panel. */
  async approvedSince(organizationId: Id, from: string): Promise<StoreOrder[]> {
    return collectQuery<StoreOrder>(
      refs
        .storeOrders()
        .where('organizationId', '==', organizationId)
        .where('status', '==', 'APPROVED')
        .where('createdAt', '>=', from),
      1000,
    );
  },
};

export const storeDiscountRepository = {
  async list(organizationId: Id, activeOnly = false): Promise<StoreDiscount[]> {
    let query: Query = refs.storeDiscounts().where('organizationId', '==', organizationId);
    if (activeOnly) query = query.where('status', '==', 'ACTIVE');
    const items = await collectQuery<StoreDiscount>(query, 500);
    return items.sort((a, b) => a.code.localeCompare(b.code));
  },

  async get(organizationId: Id, id: Id): Promise<StoreDiscount | null> {
    const snap = await refs.storeDiscount(id).get();
    const discount = mapDoc<StoreDiscount>(snap);
    if (!discount || discount.organizationId !== organizationId) return null;
    return discount;
  },

  async findByCode(organizationId: Id, code: string): Promise<StoreDiscount | null> {
    const snap = await refs
      .storeDiscounts()
      .where('organizationId', '==', organizationId)
      .where('code', '==', code.trim().toUpperCase())
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<StoreDiscount>(snap.docs[0]);
  },

  async count(organizationId: Id, status: EntityStatus = 'ACTIVE'): Promise<number> {
    const snap = await refs
      .storeDiscounts()
      .where('organizationId', '==', organizationId)
      .where('status', '==', status)
      .count()
      .get();
    return snap.data().count;
  },
};

export const storeBannerRepository = {
  async list(organizationId: Id, activeOnly = false): Promise<StoreBanner[]> {
    let query: Query = refs.storeBanners().where('organizationId', '==', organizationId);
    if (activeOnly) query = query.where('status', '==', 'ACTIVE');
    const items = await collectQuery<StoreBanner>(query, 100);
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(organizationId: Id, id: Id): Promise<StoreBanner | null> {
    const snap = await refs.storeBanner(id).get();
    const banner = mapDoc<StoreBanner>(snap);
    if (!banner || banner.organizationId !== organizationId) return null;
    return banner;
  },
};

/** Normaliza un título de vitrina para ordenar y buscar sin acentos. */
export function listingSearchTitle(title: string): string {
  return normalizeSearch(title);
}

import 'server-only';

/**
 * Repositorios del módulo de reparto.
 *
 * El rastro vive en su propia colección con el id del reparto: la lista y el
 * mapa en vivo leen solo los repartos (documentos chicos, con la última
 * posición dentro) y el rastro completo se pide únicamente al abrir un
 * detalle. Así seguir diez riders en pantalla cuesta diez lecturas, no diez
 * mil.
 */
import type { Query } from 'firebase-admin/firestore';

import { errors } from '@/lib/errors';
import type { Id, Page } from '@/types/common';
import type {
  Delivery,
  DeliverySettings,
  DeliveryStatus,
  DeliveryTrack,
} from '@/types/delivery';
import { DEFAULT_DELIVERY_SETTINGS } from '@/types/delivery';
import {
  collectQuery,
  mapDoc,
  nowIso,
  paginateQuery,
  type PaginationOptions,
} from './base';
import { refs } from './refs';

export const deliverySettingsRepository = {
  /**
   * Configuración de la organización, con los valores por defecto cuando
   * todavía no se guardó ninguna. Devolver siempre un objeto usable evita que
   * cada llamador tenga que decidir qué hacer con un `null`.
   */
  async get(organizationId: Id): Promise<DeliverySettings> {
    const snap = await refs.deliverySettings(organizationId).get();
    const stored = mapDoc<DeliverySettings>(snap);
    if (stored) return stored;

    return {
      ...DEFAULT_DELIVERY_SETTINGS,
      id: organizationId,
      organizationId,
      updatedAt: nowIso(),
      updatedBy: 'system',
    };
  },

  async save(organizationId: Id, data: Partial<DeliverySettings>, userId: Id): Promise<void> {
    await refs.deliverySettings(organizationId).set(
      { ...data, id: organizationId, organizationId, updatedAt: nowIso(), updatedBy: userId },
      { merge: true },
    );
  },
};

export interface DeliveryFilters {
  status?: DeliveryStatus | 'ALL';
  /** Solo repartos vivos: los que el mapa tiene que mostrar. */
  activeOnly?: boolean;
  riderId?: Id | null;
  from?: string | null;
  to?: string | null;
}

export const deliveryRepository = {
  async list(
    organizationId: Id,
    filters: DeliveryFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<Delivery>> {
    let query: Query = refs.deliveries().where('organizationId', '==', organizationId);

    if (filters.status && filters.status !== 'ALL') {
      query = query.where('status', '==', filters.status);
    }
    if (filters.riderId) query = query.where('riderId', '==', filters.riderId);
    if (filters.from) query = query.where('createdAt', '>=', filters.from);
    if (filters.to) query = query.where('createdAt', '<=', filters.to);

    query = query.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    return paginateQuery<Delivery>(query, pagination, ['createdAt', '__name__']);
  },

  async get(organizationId: Id, id: Id): Promise<Delivery | null> {
    const snap = await refs.delivery(id).get();
    const delivery = mapDoc<Delivery>(snap);
    if (!delivery || delivery.organizationId !== organizationId) return null;
    return delivery;
  },

  async require(organizationId: Id, id: Id): Promise<Delivery> {
    const delivery = await deliveryRepository.get(organizationId, id);
    if (!delivery) throw errors.notFound('Reparto');
    return delivery;
  },

  /**
   * Repartos vivos de la organización. Es la consulta del mapa: pocos
   * documentos y con la última posición ya dentro de cada uno.
   */
  async active(organizationId: Id, statuses: DeliveryStatus[]): Promise<Delivery[]> {
    return collectQuery<Delivery>(
      refs
        .deliveries()
        .where('organizationId', '==', organizationId)
        .where('status', 'in', statuses),
      200,
    );
  },

  /** Repartos vivos de un rider concreto: su cola de trabajo del día. */
  async activeForRider(
    organizationId: Id,
    riderId: Id,
    statuses: DeliveryStatus[],
  ): Promise<Delivery[]> {
    const items = await collectQuery<Delivery>(
      refs
        .deliveries()
        .where('organizationId', '==', organizationId)
        .where('riderId', '==', riderId)
        .where('status', 'in', statuses),
      100,
    );
    // El más viejo primero: al rider le importa el orden de llegada, no el de
    // creación inversa que usa el panel.
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  /** Cuántos repartos vivos tiene cada rider, para repartir la carga. */
  async activeCountByRider(
    organizationId: Id,
    statuses: DeliveryStatus[],
  ): Promise<Map<Id, number>> {
    const active = await deliveryRepository.active(organizationId, statuses);
    const counts = new Map<Id, number>();
    for (const delivery of active) {
      if (!delivery.riderId) continue;
      counts.set(delivery.riderId, (counts.get(delivery.riderId) ?? 0) + 1);
    }
    return counts;
  },

  /** `true` si el documento de origen ya tiene un reparto vivo o entregado. */
  async findBySource(organizationId: Id, sourceId: Id): Promise<Delivery | null> {
    const snap = await refs
      .deliveries()
      .where('organizationId', '==', organizationId)
      .where('sourceId', '==', sourceId)
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<Delivery>(snap.docs[0]);
  },

/**
   * Identificadores de los documentos que ya generaron un reparto.
   *
   * Se usa para no ofrecer dos veces la misma venta al despachar. Devuelve un
   * `Set` y no una lista porque el llamador solo pregunta "¿este ya está?".
   */
  async sourceIdsSince(organizationId: Id, from: string): Promise<Set<Id>> {
    const items = await collectQuery<Delivery>(
      refs
        .deliveries()
        .where('organizationId', '==', organizationId)
        .where('createdAt', '>=', from),
      1000,
    );
    return new Set(items.map((item) => item.sourceId));
  },

  async countByStatus(organizationId: Id, status: DeliveryStatus): Promise<number> {
    const snap = await refs
      .deliveries()
      .where('organizationId', '==', organizationId)
      .where('status', '==', status)
      .count()
      .get();
    return snap.data().count;
  },

  /** Entregados desde una fecha, para los totales del resumen. */
  async deliveredSince(organizationId: Id, from: string): Promise<Delivery[]> {
    return collectQuery<Delivery>(
      refs
        .deliveries()
        .where('organizationId', '==', organizationId)
        .where('status', '==', 'DELIVERED')
        .where('createdAt', '>=', from),
      1000,
    );
  },
};

export const deliveryTrackRepository = {
  async get(organizationId: Id, deliveryId: Id): Promise<DeliveryTrack | null> {
    const snap = await refs.deliveryTrack(deliveryId).get();
    const track = mapDoc<DeliveryTrack>(snap);
    if (!track || track.organizationId !== organizationId) return null;
    return track;
  },
};

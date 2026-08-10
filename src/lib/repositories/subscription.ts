import 'server-only';

import type { Id } from '@/types/common';
import type { Subscription, SubscriptionPayment } from '@/types/subscription';
import { collectQuery, mapDoc, nowIso } from './base';
import { refs } from './refs';

export const subscriptionRepository = {
  async get(organizationId: Id): Promise<Subscription | null> {
    const snap = await refs.subscription(organizationId).get();
    return mapDoc<Subscription>(snap);
  },

  /** Crea o actualiza la suscripción de un comercio. */
  async set(organizationId: Id, data: Partial<Subscription>, userId: Id): Promise<void> {
    await refs.subscription(organizationId).set(
      { ...data, organizationId, updatedAt: nowIso(), updatedBy: userId },
      { merge: true },
    );
  },

  /** Todas las suscripciones (solo súper-admin). */
  async listAll(max = 1000): Promise<Subscription[]> {
    return collectQuery<Subscription>(refs.subscriptions(), max);
  },
};

export const subscriptionPaymentRepository = {
  async create(payment: SubscriptionPayment): Promise<void> {
    await refs.subscriptionPayment(payment.id).set(payment);
  },

  async get(id: Id): Promise<SubscriptionPayment | null> {
    const snap = await refs.subscriptionPayment(id).get();
    return mapDoc<SubscriptionPayment>(snap);
  },

  async update(id: Id, data: Partial<SubscriptionPayment>): Promise<void> {
    await refs.subscriptionPayment(id).set(data, { merge: true });
  },

  /** Reportes de un comercio (para su propia vista). */
  async listByOrg(organizationId: Id, max = 50): Promise<SubscriptionPayment[]> {
    const items = await collectQuery<SubscriptionPayment>(
      refs.subscriptionPayments().where('organizationId', '==', organizationId),
      max,
    );
    return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  /** Todos los reportes (solo súper-admin). */
  async listAll(max = 500): Promise<SubscriptionPayment[]> {
    const items = await collectQuery<SubscriptionPayment>(refs.subscriptionPayments(), max);
    return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },
};

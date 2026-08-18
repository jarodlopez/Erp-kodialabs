import 'server-only';

import { errors } from '@/lib/errors';
import type { Role } from '@/lib/rbac';
import type { EntityStatus, Id } from '@/types/common';
import type {
  Membership,
  Organization,
  Settings,
  Tax,
  UserProfile,
  Warehouse,
} from '@/types/organization';
import { collectQuery, mapDoc, nowIso, requireDoc, serialize } from './base';
import { refs } from './refs';

export const DEFAULT_SETTINGS: Omit<Settings, 'id' | 'organizationId' | 'updatedAt' | 'updatedBy'> = {
  currency: 'NIO',
  locale: 'es-NI',
  timezone: 'America/Managua',
  taxMode: 'EXCLUSIVE',
  defaultTaxRate: 1500,
  defaultCreditDays: 30,
  lowStockThreshold: 5000,
  allowNegativeStock: false,
  numbering: {
    sale: 'SALE',
    purchase: 'PUR',
    expense: 'EXP',
    payment: 'PAY',
    return: 'RET',
    transfer: 'TRF',
    adjustment: 'ADJ',
    storeOrder: 'WEB',
    delivery: 'DEL',
  },
  invoiceFooter: null,
};

export const organizationRepository = {
  async get(id: Id): Promise<Organization | null> {
    const snap = await refs.organization(id).get();
    return mapDoc<Organization>(snap);
  },

  async require(id: Id): Promise<Organization> {
    const snap = await refs.organization(id).get();
    return requireDoc<Organization>(snap, 'Organización');
  },

  /** Todas las organizaciones (uso exclusivo del súper-admin de la plataforma). */
  async listAll(max = 1000): Promise<Organization[]> {
    return collectQuery<Organization>(refs.organizations(), max);
  },

  async update(id: Id, data: Partial<Organization>, userId: Id): Promise<void> {
    await refs.organization(id).set(
      { ...data, updatedAt: nowIso(), updatedBy: userId },
      { merge: true },
    );
  },

  async getSettings(organizationId: Id): Promise<Settings> {
    const snap = await refs.settings(organizationId).get();
    const existing = mapDoc<Settings>(snap);
    if (existing) return existing;
    return serialize<Settings>({
      ...DEFAULT_SETTINGS,
      id: organizationId,
      organizationId,
      updatedAt: nowIso(),
      updatedBy: 'system',
    });
  },

  async saveSettings(organizationId: Id, data: Partial<Settings>, userId: Id): Promise<void> {
    await refs.settings(organizationId).set(
      { ...data, organizationId, updatedAt: nowIso(), updatedBy: userId },
      { merge: true },
    );
  },
};

export const taxRepository = {
  async list(organizationId: Id): Promise<Tax[]> {
    return collectQuery<Tax>(
      refs.taxes().where('organizationId', '==', organizationId).orderBy('name'),
      200,
    );
  },

  async getDefault(organizationId: Id): Promise<Tax | null> {
    const snap = await refs
      .taxes()
      .where('organizationId', '==', organizationId)
      .where('isDefault', '==', true)
      .limit(1)
      .get();
    return snap.empty ? null : mapDoc<Tax>(snap.docs[0]);
  },
};

export const warehouseRepository = {
  async list(organizationId: Id): Promise<Warehouse[]> {
    return collectQuery<Warehouse>(
      refs.warehouses().where('organizationId', '==', organizationId).orderBy('name'),
      100,
    );
  },

  async getDefault(organizationId: Id): Promise<Warehouse> {
    const snap = await refs
      .warehouses()
      .where('organizationId', '==', organizationId)
      .where('isDefault', '==', true)
      .limit(1)
      .get();
    if (snap.empty) {
      throw errors.configuration('La organización no tiene una bodega principal configurada.');
    }
    return requireDoc<Warehouse>(snap.docs[0], 'Bodega');
  },

  async get(organizationId: Id, id: Id): Promise<Warehouse | null> {
    const snap = await refs.warehouse(id).get();
    const warehouse = mapDoc<Warehouse>(snap);
    if (!warehouse || warehouse.organizationId !== organizationId) return null;
    return warehouse;
  },
};

export const userRepository = {
  async getProfile(uid: Id): Promise<UserProfile | null> {
    const snap = await refs.user(uid).get();
    return mapDoc<UserProfile>(snap);
  },

  async requireProfile(uid: Id): Promise<UserProfile> {
    const snap = await refs.user(uid).get();
    return requireDoc<UserProfile>(snap, 'Usuario');
  },

  async findByEmail(email: string): Promise<UserProfile | null> {
    const snap = await refs.users().where('email', '==', email.toLowerCase()).limit(1).get();
    return snap.empty ? null : mapDoc<UserProfile>(snap.docs[0]);
  },

  async listByOrganization(organizationId: Id): Promise<UserProfile[]> {
    return collectQuery<UserProfile>(
      refs
        .users()
        .where('organizationIds', 'array-contains', organizationId)
        .orderBy('displayName'),
      500,
    );
  },

  async createProfile(profile: UserProfile): Promise<void> {
    await refs.user(profile.id).set(profile);
  },

  async updateProfile(uid: Id, data: Partial<UserProfile>, updatedBy: Id): Promise<void> {
    await refs.user(uid).set({ ...data, updatedAt: nowIso(), updatedBy }, { merge: true });
  },

  async setRole(uid: Id, organizationId: Id, role: Role, updatedBy: Id): Promise<void> {
    await refs.user(uid).set({ role, updatedAt: nowIso(), updatedBy }, { merge: true });
    await refs.membership(organizationId, uid).set(
      { role, updatedAt: nowIso(), updatedBy },
      { merge: true },
    );
  },

  async setStatus(uid: Id, organizationId: Id, status: EntityStatus, updatedBy: Id): Promise<void> {
    await refs.user(uid).set({ status, updatedAt: nowIso(), updatedBy }, { merge: true });
    await refs.membership(organizationId, uid).set(
      { status, updatedAt: nowIso(), updatedBy },
      { merge: true },
    );
  },

  async listMemberships(organizationId: Id): Promise<Membership[]> {
    return collectQuery<Membership>(
      refs.memberships().where('organizationId', '==', organizationId).orderBy('displayName'),
      500,
    );
  },

  async getMembership(organizationId: Id, uid: Id): Promise<Membership | null> {
    const snap = await refs.membership(organizationId, uid).get();
    return mapDoc<Membership>(snap);
  },

  async countMemberships(organizationId: Id): Promise<number> {
    const snap = await refs
      .memberships()
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE')
      .count()
      .get();
    return snap.data().count;
  },

  async touchLogin(uid: Id): Promise<void> {
    await refs.user(uid).set({ lastLoginAt: nowIso() }, { merge: true });
  },
};

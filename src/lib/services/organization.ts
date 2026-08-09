import 'server-only';

/**
 * Provisión de organizaciones y administración de usuarios.
 *
 * Al registrarse, un usuario crea su organización y queda como ADMIN. El
 * aprovisionamiento deja el sistema listo para operar: configuración, bodega
 * principal, impuesto por defecto, categorías de gasto y una caja inicial.
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { getAdminAuth } from '@/lib/firebase/admin';
import { ROLE_PERMISSIONS, type Role } from '@/lib/rbac';
import { nowIso } from '@/lib/repositories/base';
import { DEFAULT_SETTINGS, userRepository } from '@/lib/repositories/organization';
import { db, newDoc, refs } from '@/lib/repositories/refs';
import { setUserClaims } from '@/lib/auth/session';
import { audit } from './audit';
import type { ActorContext, Id } from '@/types/common';
import { DEFAULT_EXPENSE_CATEGORIES } from '@/types/expenses';
import type { Organization, Settings, UserProfile } from '@/types/organization';

export interface ProvisionInput {
  uid: string;
  email: string;
  displayName: string;
  organizationName: string;
  currency?: string;
  locale?: string;
  timezone?: string;
}

export const organizationService = {
  /** Crea una organización completa y deja al usuario como ADMIN. */
  async provision(input: ProvisionInput): Promise<{ organizationId: Id }> {
    const existingProfile = await userRepository.getProfile(input.uid);
    if (existingProfile?.organizationId) {
      return { organizationId: existingProfile.organizationId };
    }

    const orgRef = newDoc(COLLECTIONS.ORGANIZATIONS);
    const organizationId = orgRef.id;
    const timestamp = nowIso();
    const batch = db().batch();

    const organization: Organization = {
      id: organizationId,
      name: input.organizationName.trim(),
      legalName: null,
      taxId: null,
      email: input.email,
      phone: null,
      address: null,
      logoUrl: null,
      currency: input.currency ?? DEFAULT_SETTINGS.currency,
      locale: input.locale ?? DEFAULT_SETTINGS.locale,
      timezone: input.timezone ?? DEFAULT_SETTINGS.timezone,
      status: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: input.uid,
      updatedBy: input.uid,
    };
    batch.create(orgRef, organization);

    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      id: organizationId,
      organizationId,
      currency: organization.currency,
      locale: organization.locale,
      timezone: organization.timezone,
      updatedAt: timestamp,
      updatedBy: input.uid,
    };
    batch.set(refs.settings(organizationId), settings);

    // Bodega principal
    const warehouseRef = newDoc(COLLECTIONS.WAREHOUSES);
    batch.create(warehouseRef, {
      id: warehouseRef.id,
      organizationId,
      name: 'Bodega principal',
      code: 'MAIN',
      address: null,
      isDefault: true,
      status: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: input.uid,
      updatedBy: input.uid,
    });

    // Impuesto por defecto
    const taxRef = newDoc(COLLECTIONS.TAXES);
    batch.create(taxRef, {
      id: taxRef.id,
      organizationId,
      name: 'IVA 15%',
      rate: 1500,
      isDefault: true,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: input.uid,
      updatedBy: input.uid,
    });

    // Caja inicial
    const accountRef = newDoc(COLLECTIONS.FINANCIAL_ACCOUNTS);
    batch.create(accountRef, {
      id: accountRef.id,
      organizationId,
      name: 'Caja general',
      type: 'CASH',
      currency: organization.currency,
      bankName: null,
      accountNumber: null,
      initialBalance: 0,
      currentBalance: 0,
      isDefault: true,
      status: 'ACTIVE',
      notes: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: input.uid,
      updatedBy: input.uid,
    });

    // Categorías de gasto base
    for (const name of DEFAULT_EXPENSE_CATEGORIES) {
      const ref = newDoc(COLLECTIONS.EXPENSE_CATEGORIES);
      batch.create(ref, {
        id: ref.id,
        organizationId,
        name,
        description: null,
        isSystem: true,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: input.uid,
        updatedBy: input.uid,
      });
    }

    // Perfil y membresía
    const profile: UserProfile = {
      id: input.uid,
      email: input.email.toLowerCase(),
      displayName: input.displayName.trim() || input.email,
      phone: null,
      photoUrl: null,
      organizationId,
      organizationIds: [organizationId],
      role: 'ADMIN',
      status: 'ACTIVE',
      lastLoginAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: input.uid,
      updatedBy: input.uid,
    };
    batch.set(refs.user(input.uid), profile);

    batch.set(refs.membership(organizationId, input.uid), {
      id: `${organizationId}_${input.uid}`,
      organizationId,
      userId: input.uid,
      email: profile.email,
      displayName: profile.displayName,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: input.uid,
      updatedBy: input.uid,
    });

    await batch.commit();
    await setUserClaims(input.uid, {
      organizationId,
      role: 'ADMIN',
      name: profile.displayName,
    });

    await audit(
      {
        userId: input.uid,
        organizationId,
        email: input.email,
        role: 'ADMIN',
        permissions: ROLE_PERMISSIONS.ADMIN,
      },
      {
        action: 'CREATE',
        module: 'ADMIN',
        entityType: 'organization',
        entityId: organizationId,
        entityLabel: organization.name,
        after: { name: organization.name, currency: organization.currency },
      },
    );

    return { organizationId };
  },

  async updateSettings(actor: ActorContext, input: Partial<Settings>): Promise<void> {
    const { id: _id, organizationId: _org, ...rest } = input;
    await refs.settings(actor.organizationId).set(
      {
        ...rest,
        organizationId: actor.organizationId,
        updatedAt: nowIso(),
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await audit(actor, {
      action: 'UPDATE',
      module: 'ADMIN',
      entityType: 'settings',
      entityId: actor.organizationId,
      entityLabel: 'Configuración',
      after: rest as Record<string, unknown>,
    });
  },

  async updateOrganization(actor: ActorContext, input: Partial<Organization>): Promise<void> {
    const { id: _id, ...rest } = input;
    await refs.organization(actor.organizationId).set(
      { ...rest, updatedAt: nowIso(), updatedBy: actor.userId },
      { merge: true },
    );

    await audit(actor, {
      action: 'UPDATE',
      module: 'ADMIN',
      entityType: 'organization',
      entityId: actor.organizationId,
      entityLabel: input.name ?? 'Organización',
      after: rest as Record<string, unknown>,
    });
  },
};

export interface InviteUserInput {
  email: string;
  displayName: string;
  password: string;
  role: Role;
}

export const userService = {
  /** Crea un usuario dentro de la organización del administrador. */
  async inviteUser(actor: ActorContext, input: InviteUserInput): Promise<{ uid: string }> {
    const auth = getAdminAuth();
    const email = input.email.trim().toLowerCase();

    let uid: string;
    try {
      const existing = await auth.getUserByEmail(email).catch(() => null);
      if (existing) {
        const profile = await userRepository.getProfile(existing.uid);
        if (profile?.organizationId && profile.organizationId !== actor.organizationId) {
          throw errors.conflict('Ese correo ya pertenece a otra organización.');
        }
        uid = existing.uid;
        await auth.updateUser(uid, { displayName: input.displayName, password: input.password });
      } else {
        const created = await auth.createUser({
          email,
          password: input.password,
          displayName: input.displayName,
          emailVerified: false,
        });
        uid = created.uid;
      }
    } catch (error) {
      if (error instanceof Error && /email-already-exists/.test(error.message)) {
        throw errors.conflict('Ese correo ya está registrado.');
      }
      throw error;
    }

    const timestamp = nowIso();
    const batch = db().batch();

    batch.set(
      refs.user(uid),
      {
        id: uid,
        email,
        displayName: input.displayName.trim(),
        phone: null,
        photoUrl: null,
        organizationId: actor.organizationId,
        organizationIds: [actor.organizationId],
        role: input.role,
        status: 'ACTIVE',
        lastLoginAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    batch.set(
      refs.membership(actor.organizationId, uid),
      {
        id: `${actor.organizationId}_${uid}`,
        organizationId: actor.organizationId,
        userId: uid,
        email,
        displayName: input.displayName.trim(),
        role: input.role,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await batch.commit();
    await setUserClaims(uid, {
      organizationId: actor.organizationId,
      role: input.role,
      name: input.displayName,
    });

    await audit(actor, {
      action: 'CREATE',
      module: 'ADMIN',
      entityType: 'user',
      entityId: uid,
      entityLabel: email,
      after: { email, role: input.role },
    });

    return { uid };
  },

  /** Cambia el rol de un usuario y refresca sus claims. */
  async changeRole(actor: ActorContext, uid: string, role: Role): Promise<void> {
    if (uid === actor.userId) {
      throw errors.validation('No puedes cambiar tu propio rol.');
    }
    const profile = await userRepository.getProfile(uid);
    if (!profile || profile.organizationId !== actor.organizationId) {
      throw errors.notFound('Usuario');
    }

    await userRepository.setRole(uid, actor.organizationId, role, actor.userId);
    await setUserClaims(uid, {
      organizationId: actor.organizationId,
      role,
      name: profile.displayName,
    });
    // Fuerza a que el usuario obtenga un token nuevo con los permisos nuevos.
    await getAdminAuth().revokeRefreshTokens(uid);

    await audit(actor, {
      action: 'ROLE_CHANGE',
      module: 'ADMIN',
      entityType: 'user',
      entityId: uid,
      entityLabel: profile.email,
      before: { role: profile.role },
      after: { role },
    });
  },

  /** Activa o desactiva el acceso de un usuario. */
  async setStatus(actor: ActorContext, uid: string, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    if (uid === actor.userId) {
      throw errors.validation('No puedes desactivar tu propio usuario.');
    }
    const profile = await userRepository.getProfile(uid);
    if (!profile || profile.organizationId !== actor.organizationId) {
      throw errors.notFound('Usuario');
    }

    await userRepository.setStatus(uid, actor.organizationId, status, actor.userId);
    await getAdminAuth().updateUser(uid, { disabled: status === 'INACTIVE' });
    if (status === 'INACTIVE') {
      await getAdminAuth().revokeRefreshTokens(uid);
    }

    await audit(actor, {
      action: 'UPDATE',
      module: 'ADMIN',
      entityType: 'user',
      entityId: uid,
      entityLabel: profile.email,
      before: { status: profile.status },
      after: { status },
    });
  },
};

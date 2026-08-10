import 'server-only';

/**
 * Contexto de ejecución compartido por Server Actions y Route Handlers.
 *
 * Resuelve en un solo lugar: sesión, permisos, actor auditable, configuración
 * de la organización y bodega principal. Cada acción crítica arranca aquí, de
 * modo que ninguna operación puede ejecutarse sin identidad ni permisos.
 */
import { headers } from 'next/headers';

import { requirePermission, requireSession, toActor, type SessionUser } from '@/lib/auth/session';
import { isSuperAdminEmail } from '@/lib/auth/platform';
import { errors } from '@/lib/errors';
import type { Permission } from '@/lib/rbac';
import { organizationRepository, warehouseRepository } from '@/lib/repositories/organization';
import { subscriptionRepository } from '@/lib/repositories/subscription';
import { effectiveSubscription } from '@/lib/subscription';
import type { ActorContext } from '@/types/common';
import type { Settings } from '@/types/organization';

export interface OperationContext {
  session: SessionUser;
  actor: ActorContext;
  actorName: string;
  settings: Settings;
  defaultWarehouseId: string;
}

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const store = await headers();
  const forwarded = store.get('x-forwarded-for');
  return {
    ip: forwarded ? forwarded.split(',')[0].trim() : store.get('x-real-ip'),
    userAgent: store.get('user-agent'),
  };
}

/** Contexto mínimo: sesión + actor, sin cargar configuración. */
export async function getActorContext(permission?: Permission): Promise<{
  session: SessionUser;
  actor: ActorContext;
  actorName: string;
}> {
  const session = permission ? await requirePermission(permission) : await requireSession();
  const meta = await requestMeta();
  return {
    session,
    actor: toActor(session, meta),
    actorName: session.name || session.email,
  };
}

/**
 * Contexto completo, necesario para operaciones de negocio. Además de permisos,
 * exige que la suscripción del comercio esté activa: este es el punto único por
 * donde pasan las mutaciones de negocio, de modo que un comercio vencido o
 * suspendido no puede seguir operando llamando a las acciones directamente
 * (el bloqueo del layout es solo de navegación). El súper-admin queda exento.
 */
export async function getOperationContext(permission: Permission): Promise<OperationContext> {
  const { session, actor, actorName } = await getActorContext(permission);
  const [settings, warehouse, organization, subscription] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    warehouseRepository.getDefault(session.organizationId),
    organizationRepository.get(session.organizationId),
    subscriptionRepository.get(session.organizationId),
  ]);

  if (!isSuperAdminEmail(session.email)) {
    const state = effectiveSubscription(
      subscription,
      organization?.createdAt ?? new Date().toISOString(),
    );
    if (!state.allowed) {
      throw errors.forbidden(
        'La suscripción de tu comercio no está activa. Reporta tu pago para reactivar el acceso.',
      );
    }
  }

  return { session, actor, actorName, settings, defaultWarehouseId: warehouse.id };
}

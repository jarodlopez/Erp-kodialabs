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
import type { Permission } from '@/lib/rbac';
import { organizationRepository, warehouseRepository } from '@/lib/repositories/organization';
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

/** Contexto completo, necesario para operaciones de negocio. */
export async function getOperationContext(permission: Permission): Promise<OperationContext> {
  const { session, actor, actorName } = await getActorContext(permission);
  const [settings, warehouse] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    warehouseRepository.getDefault(session.organizationId),
  ]);

  return { session, actor, actorName, settings, defaultWarehouseId: warehouse.id };
}

import 'server-only';

/**
 * Servicio de auditoría.
 *
 * Toda operación sensible deja rastro. Cuando la operación forma parte de una
 * transacción, el registro se escribe DENTRO de la misma transacción: si la
 * operación falla, tampoco queda auditoría fantasma; y si la auditoría no se
 * puede escribir, la operación completa se revierte.
 */
import type { Transaction } from 'firebase-admin/firestore';

import { newDoc, refs } from '@/lib/repositories/refs';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { nowIso } from '@/lib/repositories/base';
import { logError } from '@/lib/errors';
import type { ActorContext } from '@/types/common';
import type { AuditEntryInput, AuditLog } from '@/types/audit';

const MAX_SNAPSHOT_KEYS = 40;
const MAX_STRING_LENGTH = 500;

/** Recorta el snapshot para no inflar el documento de auditoría. */
function trimSnapshot(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (count >= MAX_SNAPSHOT_KEYS) break;
    if (raw === undefined) continue;
    if (typeof raw === 'string' && raw.length > MAX_STRING_LENGTH) {
      out[key] = `${raw.slice(0, MAX_STRING_LENGTH)}...`;
    } else if (Array.isArray(raw)) {
      out[key] = `[${raw.length} elementos]`;
    } else if (raw !== null && typeof raw === 'object') {
      out[key] = JSON.stringify(raw).slice(0, MAX_STRING_LENGTH);
    } else {
      out[key] = raw;
    }
    count += 1;
  }
  return out;
}

function buildEntry(actor: ActorContext, entry: AuditEntryInput, id: string): AuditLog {
  return {
    id,
    organizationId: actor.organizationId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.email,
    action: entry.action,
    module: entry.module,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    entityLabel: entry.entityLabel ?? null,
    before: trimSnapshot(entry.before),
    after: trimSnapshot(entry.after),
    metadata: entry.metadata ?? null,
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
    timestamp: nowIso(),
  };
}

/** Escribe el registro de auditoría dentro de una transacción existente. */
export function auditInTransaction(
  tx: Transaction,
  actor: ActorContext,
  entry: AuditEntryInput,
): void {
  const ref = newDoc(COLLECTIONS.AUDIT_LOGS);
  const log = buildEntry(actor, entry, ref.id);
  tx.create(ref, log);
}

/**
 * Escribe auditoría fuera de una transacción (login, exportaciones, cron).
 * Nunca interrumpe el flujo principal: los fallos se registran en el log.
 */
export async function audit(actor: ActorContext, entry: AuditEntryInput): Promise<void> {
  try {
    const ref = newDoc(COLLECTIONS.AUDIT_LOGS);
    await ref.create(buildEntry(actor, entry, ref.id));
  } catch (error) {
    logError('audit.write', error);
  }
}

/** Auditoría de eventos de autenticación, sin contexto de organización previo. */
export async function auditAuthEvent(params: {
  organizationId: string;
  userId: string;
  email: string;
  action: 'LOGIN' | 'LOGOUT';
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await audit(
    {
      userId: params.userId,
      organizationId: params.organizationId,
      email: params.email,
      role: '',
      permissions: [],
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    },
    {
      action: params.action,
      module: 'AUTH',
      entityType: 'user',
      entityId: params.userId,
      entityLabel: params.email,
    },
  );
}

export { refs as auditRefs };

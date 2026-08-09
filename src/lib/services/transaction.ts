import 'server-only';

/**
 * Primitivas transaccionales del ERP: numeración concurrente e idempotencia.
 *
 * Firestore exige que TODAS las lecturas de una transacción ocurran antes de
 * cualquier escritura. Por eso estas utilidades se dividen en dos tiempos:
 *
 *   const reservation = await reserveNumber(tx, ...);  // fase de lectura
 *   ...                                                // más lecturas
 *   reservation.commit();                              // fase de escritura
 *
 * Así los servicios pueden componer operaciones complejas (venta + inventario
 * + finanzas + auditoría) dentro de una única transacción atómica.
 */
import type { Transaction } from 'firebase-admin/firestore';

import { db, nowIso } from '@/lib/repositories/base';
import { refs } from '@/lib/repositories/refs';
import { errors } from '@/lib/errors';
import type { Id } from '@/types/common';

/** Ejecuta una función dentro de una transacción de Firestore. */
export async function runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db().runTransaction(fn);
}

export interface NumberReservation {
  number: string;
  commit: () => void;
}

/**
 * Reserva el siguiente número correlativo del documento.
 *
 * El contador vive en `counters/{organizationId}_{key}` y se incrementa dentro
 * de la misma transacción que crea el documento, por lo que nunca se generan
 * números duplicados aunque haya concurrencia. Jamás se usa `array.length + 1`.
 */
export async function reserveNumber(
  tx: Transaction,
  organizationId: Id,
  key: string,
  prefix: string,
  padding = 6,
): Promise<NumberReservation> {
  const ref = refs.counter(organizationId, key);
  const snap = await tx.get(ref);
  const current = snap.exists ? Number((snap.data() as { value?: number }).value ?? 0) : 0;
  const next = current + 1;
  const number = `${prefix}-${String(next).padStart(padding, '0')}`;

  return {
    number,
    commit: () => {
      tx.set(
        ref,
        { organizationId, key, prefix, value: next, updatedAt: nowIso() },
        { merge: true },
      );
    },
  };
}

export interface IdempotencyGuard {
  /** Resultado previamente almacenado, si la operación ya se ejecutó. */
  existing: Record<string, unknown> | null;
  /** Registra la clave junto con el resultado de la operación. */
  commit: (result: Record<string, unknown>) => void;
}

/**
 * Protege una operación crítica contra ejecuciones duplicadas (doble clic,
 * reintento de red, reenvío de formulario).
 *
 * Si la clave ya existe, `existing` contiene el resultado original y el
 * servicio debe devolverlo sin volver a ejecutar la lógica.
 */
export async function guardIdempotency(
  tx: Transaction,
  organizationId: Id,
  key: string | null | undefined,
  operation: string,
): Promise<IdempotencyGuard> {
  if (!key) {
    return { existing: null, commit: () => undefined };
  }

  const ref = refs.idempotency(organizationId, `${operation}_${key}`);
  const snap = await tx.get(ref);

  if (snap.exists) {
    const data = snap.data() as { result?: Record<string, unknown> } | undefined;
    return { existing: data?.result ?? {}, commit: () => undefined };
  }

  return {
    existing: null,
    commit: (result) => {
      tx.create(ref, {
        organizationId,
        operation,
        key,
        result,
        createdAt: nowIso(),
        // TTL sugerido: se puede configurar una política de expiración en
        // Firestore sobre este campo para depurar claves antiguas.
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    },
  };
}

/** Genera una clave de idempotencia razonable a partir de datos del cliente. */
export function buildIdempotencyKey(parts: (string | number | null | undefined)[]): string {
  const raw = parts.filter((p) => p !== null && p !== undefined).join('|');
  if (!raw) throw errors.validation('No se pudo construir la clave de idempotencia.');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return `k${Math.abs(hash).toString(36)}${raw.length.toString(36)}`;
}

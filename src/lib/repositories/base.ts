import 'server-only';

/**
 * Utilidades compartidas por todos los repositorios.
 *
 * DECISIÓN DE DISEÑO — FECHAS COMO ISO-8601
 * -----------------------------------------
 * Las fechas se almacenan en Firestore como cadenas ISO-8601 en UTC
 * (`2026-08-08T14:03:00.000Z`) en lugar de `Timestamp`, porque:
 *  - ordenan y filtran correctamente con operadores de rango (`>=`, `<=`),
 *    ya que el formato ISO-8601 UTC es lexicográficamente ordenable;
 *  - son directamente serializables entre Server y Client Components, sin
 *    necesidad de convertidores en cada frontera;
 *  - eliminan una clase entera de errores por objetos `Timestamp` filtrándose
 *    al navegador.
 * Solo el servidor escribe fechas, por lo que el reloj es confiable.
 */
import { FieldValue, Timestamp, type Firestore, type Query } from 'firebase-admin/firestore';

import { getDb } from '@/lib/firebase/admin';
import { errors } from '@/lib/errors';
import type { Id, IsoDate, Page } from '@/types/common';

export { FieldValue };

export function db(): Firestore {
  return getDb();
}

export function nowIso(): IsoDate {
  return new Date().toISOString();
}

/** Normaliza cualquier representación de fecha a ISO-8601 UTC. */
export function toIso(value: unknown): IsoDate {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof value === 'number') return new Date(value).toISOString();
  return nowIso();
}

/** Convierte una fecha de formulario (`YYYY-MM-DD` o ISO) a ISO-8601 UTC. */
export function parseDate(value: string | null | undefined, fallback?: IsoDate): IsoDate {
  if (!value) return fallback ?? nowIso();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw errors.validation('La fecha proporcionada no es válida.');
  }
  return parsed.toISOString();
}

/** Inicio del día (UTC) para una fecha dada. */
export function startOfDayIso(value: string): IsoDate {
  const d = new Date(parseDate(value));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Fin del día (UTC) para una fecha dada. */
export function endOfDayIso(value: string): IsoDate {
  const d = new Date(parseDate(value));
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * Convierte recursivamente los `Timestamp` que pudieran existir en documentos
 * legados y elimina claves `undefined`, dejando el objeto listo para cruzar la
 * frontera servidor → cliente.
 */
export function serialize<T>(value: unknown): T {
  return serializeValue(value) as T;
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      out[key] = serializeValue(source[key]);
    }
    return out;
  }
  return value;
}

export interface DocLike {
  id: string;
  data(): Record<string, unknown> | undefined;
  exists: boolean;
}

/** Mapea un snapshot a la entidad de dominio, inyectando el `id`. */
export function mapDoc<T>(snap: DocLike): T | null {
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data) return null;
  return serialize<T>({ ...data, id: snap.id });
}

/** Igual que `mapDoc`, pero lanza `NOT_FOUND` si el documento no existe. */
export function requireDoc<T>(snap: DocLike, entity: string): T {
  const mapped = mapDoc<T>(snap);
  if (!mapped) throw errors.notFound(entity);
  return mapped;
}

/** Verifica el aislamiento por organización de un documento ya leído. */
export function assertOrg<T extends { organizationId?: string }>(
  entity: T | null,
  organizationId: Id,
  label: string,
): T {
  if (!entity) throw errors.notFound(label);
  if (entity.organizationId && entity.organizationId !== organizationId) {
    throw errors.orgMismatch();
  }
  return entity;
}

/** Codifica un cursor de paginación de forma opaca para el cliente. */
export function encodeCursor(values: unknown[]): string {
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | null | undefined): unknown[] | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface PaginationOptions {
  limit?: number;
  cursor?: string | null;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function normalizeLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
}

/**
 * Ejecuta una consulta paginada con cursor.
 * `cursorFields` indica qué campos del último documento forman el cursor,
 * en el mismo orden que los `orderBy` de la consulta.
 */
export async function paginateQuery<T>(
  query: Query,
  options: PaginationOptions,
  cursorFields: string[],
): Promise<Page<T>> {
  const limit = normalizeLimit(options.limit);
  const cursorValues = decodeCursor(options.cursor);

  let q = query;
  if (cursorValues && cursorValues.length === cursorFields.length) {
    q = q.startAfter(...cursorValues);
  }

  const snap = await q.limit(limit + 1).get();
  const docs = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;

  const items = docs.map((d) => serialize<T>({ ...d.data(), id: d.id }));

  let nextCursor: string | null = null;
  if (hasMore && docs.length > 0) {
    const last = docs[docs.length - 1];
    const data = last.data() as Record<string, unknown>;
    nextCursor = encodeCursor(
      cursorFields.map((field) => (field === '__name__' ? last.id : data[field] ?? null)),
    );
  }

  return { items, nextCursor, hasMore };
}

/**
 * Recorre una consulta completa en lotes. Uso exclusivo del servidor
 * (reportes, exportaciones, tareas programadas): nunca se expone al navegador.
 */
export async function* iterateQuery<T>(
  query: Query,
  batchSize = 300,
  cursorField = '__name__',
): AsyncGenerator<T[]> {
  let cursor: unknown = null;
  for (;;) {
    let q = query.limit(batchSize);
    if (cursor !== null) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) return;
    yield snap.docs.map((d) => serialize<T>({ ...d.data(), id: d.id }));
    if (snap.docs.length < batchSize) return;
    const last = snap.docs[snap.docs.length - 1];
    cursor = cursorField === '__name__' ? last.id : (last.data() as Record<string, unknown>)[cursorField];
  }
}

/** Lee todos los documentos de una consulta acotada por un tope de seguridad. */
export async function collectQuery<T>(query: Query, maxDocs = 5000): Promise<T[]> {
  const out: T[] = [];
  const batchSize = Math.min(300, Math.max(maxDocs, 1));
  for await (const batch of iterateQuery<T>(query, batchSize)) {
    out.push(...batch);
    if (out.length >= maxDocs) break;
  }
  return out.slice(0, maxDocs);
}

/** Normaliza texto para búsquedas por prefijo (case/acentos insensibles). */
export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Rango de prefijo para consultas `>= term` / `<= term + \uf8ff`. */
export function prefixRange(term: string): [string, string] {
  const normalized = normalizeSearch(term);
  return [normalized, `${normalized}\uf8ff`];
}

/** Divide un arreglo en lotes de tamaño fijo (límite de `in` = 30 en Firestore). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

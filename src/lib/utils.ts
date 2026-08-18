import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina clases de Tailwind resolviendo conflictos. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Fecha legible: `8 ago 2026`. */
export function formatDate(value: string | null | undefined, locale = 'es-NI'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Fecha y hora legibles. */
export function formatDateTime(value: string | null | undefined, locale = 'es-NI'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Valor `YYYY-MM-DD` para inputs de tipo fecha. */
export function toDateInput(value?: string | Date | null): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/** Primer día del mes actual, en formato de input. */
/** Fecha ISO de hace N días, para ventanas móviles ("últimos 30 días"). */
export function daysAgoIso(days: number, reference = new Date()): string {
  const date = new Date(reference);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

export function startOfMonthInput(reference = new Date()): string {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** Porcentaje legible a partir de puntos base. */
export function formatRate(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(basisPoints % 100 === 0 ? 0 : 2)}%`;
}

/** Iniciales para el avatar del usuario. */
export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Construye una query string preservando los parámetros existentes. */
export function buildQuery(
  current: URLSearchParams | Record<string, string | undefined>,
  changes: Record<string, string | number | null | undefined>,
): string {
  const params =
    current instanceof URLSearchParams
      ? new URLSearchParams(current.toString())
      : new URLSearchParams(
          Object.entries(current).filter(([, v]) => v !== undefined) as [string, string][],
        );

  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '') params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Genera una clave de idempotencia única en el cliente. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

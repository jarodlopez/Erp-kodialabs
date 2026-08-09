import type { ZodType } from 'zod';

import { errors } from '@/lib/errors';

/**
 * Valida datos con un esquema Zod y, si falla, lanza un `AppError` de tipo
 * VALIDATION con los errores mapeados por campo, listos para pintarse en el
 * formulario.
 */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_form';
    if (!fieldErrors[path]) fieldErrors[path] = issue.message;
  }

  const first = result.error.issues[0]?.message ?? 'Los datos enviados no son válidos.';
  throw errors.validation(first, fieldErrors);
}

/** Variante que devuelve el resultado en lugar de lanzar (uso en el cliente). */
export function parseSafe<T>(
  schema: ZodType<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false; fieldErrors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_form';
    if (!fieldErrors[path]) fieldErrors[path] = issue.message;
  }
  return { ok: false, fieldErrors };
}

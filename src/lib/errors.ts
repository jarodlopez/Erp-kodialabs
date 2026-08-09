/**
 * Sistema global de errores del ERP.
 *
 * Regla: al usuario final NUNCA se le muestra un error técnico
 * (`FirebaseError: PERMISSION_DENIED`, stack traces, etc.). Toda excepción se
 * normaliza a un `AppError` con un código estable y un mensaje empresarial en
 * español. Los detalles técnicos se registran en el log del servidor.
 */

export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_STATE_TRANSITION'
  | 'DUPLICATE_OPERATION'
  | 'ORGANIZATION_MISMATCH'
  | 'DEPENDENCY_EXISTS'
  | 'RATE_LIMITED'
  | 'CONFIGURATION'
  | 'INTERNAL';

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: 'Tu sesión expiró. Inicia sesión nuevamente.',
  FORBIDDEN: 'No tienes permisos para realizar esta operación.',
  NOT_FOUND: 'El registro solicitado no existe o fue eliminado.',
  VALIDATION: 'Revisa los datos ingresados: hay información inválida.',
  CONFLICT: 'La operación no pudo completarse por un conflicto de datos.',
  INSUFFICIENT_STOCK: 'No hay suficiente inventario disponible.',
  INSUFFICIENT_FUNDS: 'La cuenta financiera no tiene saldo suficiente.',
  INVALID_STATE_TRANSITION: 'El documento no permite esa acción en su estado actual.',
  DUPLICATE_OPERATION: 'Esta operación ya fue registrada anteriormente.',
  ORGANIZATION_MISMATCH: 'El registro pertenece a otra organización.',
  DEPENDENCY_EXISTS: 'No se puede eliminar: existen registros relacionados.',
  RATE_LIMITED: 'Demasiadas solicitudes. Intenta de nuevo en unos segundos.',
  CONFIGURATION: 'La aplicación no está configurada correctamente. Contacta al administrador.',
  INTERNAL: 'Ocurrió un error inesperado. Intenta nuevamente.',
};

const HTTP_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  INSUFFICIENT_FUNDS: 409,
  INVALID_STATE_TRANSITION: 409,
  DUPLICATE_OPERATION: 409,
  ORGANIZATION_MISMATCH: 403,
  DEPENDENCY_EXISTS: 409,
  RATE_LIMITED: 429,
  CONFIGURATION: 500,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  /** Errores por campo, para formularios. */
  readonly fieldErrors: Record<string, string> | null;
  /** Información técnica que solo se registra en el servidor. */
  readonly technical: string | null;

  constructor(
    code: AppErrorCode,
    message?: string,
    options?: { fieldErrors?: Record<string, string>; technical?: string; cause?: unknown },
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
    this.fieldErrors = options?.fieldErrors ?? null;
    this.technical = options?.technical ?? null;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export const errors = {
  unauthenticated: (msg?: string) => new AppError('UNAUTHENTICATED', msg),
  forbidden: (msg?: string) => new AppError('FORBIDDEN', msg),
  notFound: (entity?: string) =>
    new AppError('NOT_FOUND', entity ? `${entity} no encontrado.` : undefined),
  validation: (msg?: string, fieldErrors?: Record<string, string>) =>
    new AppError('VALIDATION', msg, { fieldErrors }),
  conflict: (msg?: string) => new AppError('CONFLICT', msg),
  insufficientStock: (msg?: string) => new AppError('INSUFFICIENT_STOCK', msg),
  insufficientFunds: (msg?: string) => new AppError('INSUFFICIENT_FUNDS', msg),
  invalidTransition: (msg?: string) => new AppError('INVALID_STATE_TRANSITION', msg),
  duplicate: (msg?: string) => new AppError('DUPLICATE_OPERATION', msg),
  orgMismatch: (msg?: string) => new AppError('ORGANIZATION_MISMATCH', msg),
  dependencyExists: (msg?: string) => new AppError('DEPENDENCY_EXISTS', msg),
  configuration: (msg?: string, technical?: string) =>
    new AppError('CONFIGURATION', msg, { technical }),
  internal: (technical?: string, cause?: unknown) =>
    new AppError('INTERNAL', undefined, { technical, cause }),
};

/** Resultado uniforme devuelto por Server Actions y Route Handlers. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; fieldErrors?: Record<string, string> } };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  const app = toAppError(error);
  return {
    ok: false,
    error: {
      code: app.code,
      message: app.message,
      ...(app.fieldErrors ? { fieldErrors: app.fieldErrors } : {}),
    },
  };
}

/** Convierte cualquier excepción en un `AppError` seguro para el usuario. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Error) {
    const raw = `${error.name}: ${error.message}`;

    // Errores propagados por Firebase / gRPC.
    if (/PERMISSION_DENIED|permission-denied/i.test(raw)) {
      return new AppError('FORBIDDEN', undefined, { technical: raw, cause: error });
    }
    if (/UNAUTHENTICATED|auth\/id-token-expired|session-cookie-expired/i.test(raw)) {
      return new AppError('UNAUTHENTICATED', undefined, { technical: raw, cause: error });
    }
    if (/NOT_FOUND|not-found/i.test(raw)) {
      return new AppError('NOT_FOUND', undefined, { technical: raw, cause: error });
    }
    if (/ALREADY_EXISTS|already-exists/i.test(raw)) {
      return new AppError('CONFLICT', undefined, { technical: raw, cause: error });
    }
    if (/FAILED_PRECONDITION|requires an index/i.test(raw)) {
      return new AppError('CONFIGURATION', 'La consulta requiere un índice de Firestore que aún no existe.', {
        technical: raw,
        cause: error,
      });
    }
    if (/DEADLINE_EXCEEDED|UNAVAILABLE/i.test(raw)) {
      return new AppError('CONFLICT', 'El servicio no respondió a tiempo. Intenta nuevamente.', {
        technical: raw,
        cause: error,
      });
    }
    return new AppError('INTERNAL', undefined, { technical: raw, cause: error });
  }

  return new AppError('INTERNAL', undefined, { technical: String(error) });
}

/** Registra el detalle técnico en el log del servidor (nunca en el cliente). */
export function logError(scope: string, error: unknown): AppError {
  const app = toAppError(error);
  const detail = app.technical ?? app.message;
  console.error(`[ERP:${scope}] ${app.code} — ${detail}`, app.cause ?? '');
  return app;
}

import 'server-only';

/**
 * Gestión de sesión del lado del servidor.
 *
 * Flujo:
 *  1. El navegador autentica con Firebase Auth (email/contraseña) y obtiene un
 *     `idToken`.
 *  2. Ese token se envía UNA sola vez a `POST /api/auth/session`, que lo
 *     verifica con el Admin SDK y emite una cookie de sesión `httpOnly`,
 *     `secure` y `sameSite=lax`.
 *  3. Cada Server Component / Server Action / Route Handler resuelve la sesión
 *     desde esa cookie. El navegador nunca decide quién es el usuario.
 *
 * Los custom claims (`organizationId`, `role`) viajan dentro del token, de modo
 * que las Security Rules de Firestore y Storage pueden aplicar el mismo
 * aislamiento por organización.
 */
import { cookies } from 'next/headers';
import { cache } from 'react';

import { getAdminAuth } from '@/lib/firebase/admin';
import { errors, logError } from '@/lib/errors';
import { permissionsForRole, type Permission, type Role } from '@/lib/rbac';
import type { ActorContext } from '@/types/common';

export const SESSION_COOKIE_NAME = '__erp_session';

function sessionDurationMs(): number {
  const days = Number(process.env.SESSION_COOKIE_DAYS ?? 5);
  const safeDays = Number.isFinite(days) && days > 0 && days <= 14 ? days : 5;
  return safeDays * 24 * 60 * 60 * 1000;
}

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  organizationId: string;
  role: Role;
  permissions: Permission[];
  emailVerified: boolean;
}

/**
 * Crea la cookie de sesión a partir de un `idToken` recién emitido.
 * Rechaza tokens con más de 5 minutos de antigüedad (requisito de Firebase).
 */
export async function createSession(idToken: string): Promise<void> {
  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken, true);

  const authTimeMs = decoded.auth_time * 1000;
  if (Date.now() - authTimeMs > 5 * 60 * 1000) {
    throw errors.unauthenticated('Vuelve a iniciar sesión para continuar.');
  }

  const expiresIn = sessionDurationMs();
  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(expiresIn / 1000),
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/** Revoca todos los tokens del usuario (cierre de sesión en todos los dispositivos). */
export async function revokeUserSessions(uid: string): Promise<void> {
  await getAdminAuth().revokeRefreshTokens(uid);
}

/**
 * Resuelve la sesión activa. Devuelve `null` si no hay sesión válida.
 * Memoizado por petición con `cache()` para no verificar el token dos veces.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  const checkRevoked = process.env.SESSION_CHECK_REVOKED !== 'false';

  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie, checkRevoked);
    const organizationId = typeof decoded.organizationId === 'string' ? decoded.organizationId : '';
    const role = (typeof decoded.role === 'string' ? decoded.role : '') as Role;

    if (!organizationId || !role) {
      // Usuario autenticado pero todavía sin organización asignada.
      return {
        uid: decoded.uid,
        email: decoded.email ?? '',
        name: (decoded.name as string | undefined) ?? decoded.email ?? '',
        organizationId: '',
        role: '' as Role,
        permissions: [],
        emailVerified: Boolean(decoded.email_verified),
      };
    }

    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      name: (decoded.name as string | undefined) ?? decoded.email ?? '',
      organizationId,
      role,
      permissions: permissionsForRole(role),
      emailVerified: Boolean(decoded.email_verified),
    };
  } catch (error) {
    logError('auth.getSession', error);
    return null;
  }
});

/** Exige sesión activa con organización asignada. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw errors.unauthenticated();
  if (!session.organizationId) {
    throw errors.forbidden('Tu usuario aún no tiene una organización asignada.');
  }
  return session;
}

/** Exige sesión y un permiso concreto. Es la puerta de entrada del RBAC. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const session = await requireSession();
  if (!session.permissions.includes(permission)) {
    throw errors.forbidden();
  }
  return session;
}

export async function requireAnyPermission(permissions: Permission[]): Promise<SessionUser> {
  const session = await requireSession();
  if (!permissions.some((p) => session.permissions.includes(p))) {
    throw errors.forbidden();
  }
  return session;
}

/** Construye el contexto de actor que consumen los servicios de negocio. */
export function toActor(session: SessionUser, meta?: { ip?: string | null; userAgent?: string | null }): ActorContext {
  return {
    userId: session.uid,
    organizationId: session.organizationId,
    email: session.email,
    role: session.role,
    permissions: session.permissions,
    ip: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  };
}

/** Asigna organización y rol como custom claims del usuario. */
export async function setUserClaims(
  uid: string,
  claims: { organizationId: string; role: Role; name?: string },
): Promise<void> {
  const auth = getAdminAuth();
  await auth.setCustomUserClaims(uid, {
    organizationId: claims.organizationId,
    role: claims.role,
    ...(claims.name ? { name: claims.name } : {}),
  });
}

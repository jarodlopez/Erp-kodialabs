import 'server-only';

import { getSession, requireSession, type SessionUser } from '@/lib/auth/session';
import { errors } from '@/lib/errors';

/**
 * Súper-administración de la PLATAFORMA (dueño del SaaS), distinta del rol
 * ADMIN de cada comercio. Se identifica por correo, configurado en la variable
 * de entorno `SUPER_ADMIN_EMAILS` (separados por coma). La verificación es
 * siempre del lado del servidor.
 */
function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return superAdminEmails().includes(email.toLowerCase());
}

/** Devuelve true si la sesión actual pertenece a un súper-admin. No lanza. */
export async function isCurrentUserSuperAdmin(): Promise<boolean> {
  const session = await getSession();
  return isSuperAdminEmail(session?.email);
}

/** Exige que la sesión actual sea súper-admin; si no, lanza FORBIDDEN. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const session = await requireSession();
  if (!isSuperAdminEmail(session.email)) {
    throw errors.forbidden('Acceso restringido a la administración de la plataforma.');
  }
  // Endurecimiento: el correo del súper-admin debe estar verificado para evitar
  // que una cuenta con un correo aún no confirmado alcance los controles de la
  // plataforma (planes, precios, comercios).
  if (!session.emailVerified) {
    throw errors.forbidden(
      'Verifica tu correo antes de acceder a la administración de la plataforma.',
    );
  }
  return session;
}

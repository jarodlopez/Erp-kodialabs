'use server';

/**
 * Server Actions de autenticación.
 *
 * El navegador se autentica con Firebase Auth y envía el `idToken` aquí; el
 * servidor lo verifica, emite la cookie de sesión y —en el registro— aprovisiona
 * la organización completa.
 */
import { redirect } from 'next/navigation';

import {
  createSession,
  destroySession,
  getSession,
  requireSession,
  setUserClaims,
} from '@/lib/auth/session';
import { getAdminAuth } from '@/lib/firebase/admin';
import { errors, fail, logError, ok, type ActionResult } from '@/lib/errors';
import { userRepository } from '@/lib/repositories/organization';
import { auditAuthEvent } from '@/lib/services/audit';
import { organizationService } from '@/lib/services/organization';
import { parseOrThrow } from '@/lib/validation/parse';
import { registerProfileSchema } from '@/lib/validation/schemas';

/** Intercambia el `idToken` por una cookie de sesión httpOnly. */
export async function establishSession(idToken: string): Promise<ActionResult<{ organizationId: string }>> {
  try {
    if (!idToken || typeof idToken !== 'string') {
      throw errors.unauthenticated('No se recibió un token válido.');
    }

    await createSession(idToken);
    const session = await getSession();
    if (!session) throw errors.unauthenticated();

    const profile = await userRepository.getProfile(session.uid);

    if (profile?.status === 'INACTIVE') {
      await destroySession();
      throw errors.forbidden('Tu usuario está desactivado. Contacta al administrador.');
    }

    // Reparación de claims: si el perfil tiene organización pero el token no,
    // se vuelven a aplicar los custom claims.
    if (profile?.organizationId && !session.organizationId) {
      await setUserClaims(profile.id, {
        organizationId: profile.organizationId,
        role: profile.role,
        name: profile.displayName,
      });
    }

    if (profile) {
      await userRepository.touchLogin(profile.id);
      await auditAuthEvent({
        organizationId: profile.organizationId,
        userId: profile.id,
        email: profile.email,
        action: 'LOGIN',
      });
    }

    return ok({ organizationId: profile?.organizationId ?? session.organizationId ?? '' });
  } catch (error) {
    logError('auth.establishSession', error);
    return fail(error);
  }
}

/** Registra la organización del usuario recién creado en Firebase Auth. */
export async function completeRegistration(input: {
  idToken: string;
  displayName: string;
  organizationName: string;
  email: string;
}): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(input.idToken, true);

    // Se valida solo lo que el servidor necesita del formulario.
    const data = parseOrThrow(registerProfileSchema, {
      displayName: input.displayName,
      organizationName: input.organizationName,
    });

    const { organizationId } = await organizationService.provision({
      uid: decoded.uid,
      email: decoded.email ?? input.email,
      displayName: data.displayName,
      organizationName: data.organizationName,
    });

    return ok({ organizationId });
  } catch (error) {
    logError('auth.completeRegistration', error);
    return fail(error);
  }
}

/** Cierra la sesión. Se invoca como `action` de un formulario. */
export async function signOutAction(_formData?: FormData): Promise<void> {
  const session = await getSession();
  if (session) {
    await auditAuthEvent({
      organizationId: session.organizationId,
      userId: session.uid,
      email: session.email,
      action: 'LOGOUT',
    });
  }
  await destroySession();
  redirect('/login');
}

/** Datos del usuario en sesión, para la cabecera de la aplicación. */
export async function getCurrentUser(): Promise<
  ActionResult<{ uid: string; email: string; name: string; role: string; permissions: string[] }>
> {
  try {
    const session = await requireSession();
    return ok({
      uid: session.uid,
      email: session.email,
      name: session.name,
      role: session.role,
      permissions: session.permissions,
    });
  } catch (error) {
    return fail(error);
  }
}

import { redirect } from 'next/navigation';

import { signOutAction } from '@/app/actions/auth';
import { AppShell } from '@/components/layout/app-shell';
import { getSession } from '@/lib/auth/session';
import { isSuperAdminEmail } from '@/lib/auth/platform';
import { PERMISSIONS } from '@/lib/rbac';
import { organizationRepository } from '@/lib/repositories/organization';
import { subscriptionRepository } from '@/lib/repositories/subscription';
import { effectiveSubscription } from '@/lib/subscription';

/**
 * Shell protegido. Cualquier ruta bajo este layout exige una sesión válida con
 * organización asignada; la verificación ocurre en el servidor, por lo que el
 * navegador nunca puede "saltársela". Además se valida la suscripción del
 * comercio: si venció o está suspendida, se redirige a `/suscripcion`.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) redirect('/login');
  if (!session.organizationId) redirect('/sin-organizacion');

  /*
   * El repartidor no tiene panel: su único permiso es repartir, así que
   * cualquier ruta del ERP le daría un error de permisos en lugar de llevarlo a
   * donde sí puede trabajar. Se redirige acá y no en cada página porque este
   * layout es la puerta de todo el panel.
   */
  if (
    !session.permissions.includes(PERMISSIONS.DASHBOARD_VIEW) &&
    session.permissions.includes(PERMISSIONS.DELIVERY_RIDE)
  ) {
    redirect('/reparto');
  }

  const superAdmin = isSuperAdminEmail(session.email);

  const [organization, subscription] = await Promise.all([
    organizationRepository.get(session.organizationId),
    subscriptionRepository.get(session.organizationId),
  ]);

  // El súper-admin de la plataforma nunca se bloquea por suscripción.
  const state = effectiveSubscription(subscription, organization?.createdAt ?? new Date().toISOString());
  if (!superAdmin && !state.allowed) {
    redirect('/suscripcion');
  }

  const showTrialBanner = !superAdmin && state.allowed && (state.isTrial || state.daysLeft <= 5);

  return (
    <AppShell
      user={{
        name: session.name || session.email,
        email: session.email,
        role: session.role,
        permissions: session.permissions,
        organizationName: organization?.name ?? 'Mi organización',
      }}
      isSuperAdmin={superAdmin}
      onSignOut={signOutAction}
    >
      {showTrialBanner && (
        <a
          href="/suscripcion"
          className="mb-4 block rounded-lg border border-[var(--color-warning-200)] bg-[var(--color-warning-50)] px-4 py-2.5 text-sm text-[var(--color-warning-700)] hover:underline"
        >
          {state.isTrial
            ? `Estás en prueba gratis · te quedan ${state.daysLeft} día(s).`
            : `Tu suscripción vence en ${state.daysLeft} día(s).`}{' '}
          Reporta tu pago para no perder el acceso →
        </a>
      )}
      {children}
    </AppShell>
  );
}

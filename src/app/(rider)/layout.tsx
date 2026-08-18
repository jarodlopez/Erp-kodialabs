import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bike, LogOut } from 'lucide-react';

import { signOutAction } from '@/app/actions/auth';
import { getSession } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { organizationRepository } from '@/lib/repositories/organization';
import { subscriptionRepository } from '@/lib/repositories/subscription';
import { effectiveSubscription } from '@/lib/subscription';

/**
 * Shell de la vista de reparto.
 *
 * Deliberadamente NO es el panel del ERP: es una sola columna, pensada para un
 * teléfono sostenido con una mano en la calle, sin barra lateral, sin buscador
 * y sin nada que abra inventario o finanzas. Ese recorte no es estético: el
 * teléfono de un rider se presta, se pierde y se revende, así que la vista que
 * corre ahí solo puede llegar a los repartos de quien la abrió.
 *
 * Cualquiera con permiso de reparto puede entrar —el dueño que sale a repartir
 * también—, y quien además tiene panel encuentra el enlace de vuelta arriba.
 */
export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) redirect('/login');
  if (!session.organizationId) redirect('/sin-organizacion');
  if (!session.permissions.includes(PERMISSIONS.DELIVERY_RIDE)) redirect('/');

  const hasPanel = session.permissions.includes(PERMISSIONS.DASHBOARD_VIEW);

  /*
   * La suscripción se valida igual que en el panel, pero el aviso es distinto:
   * mandar al rider a la pantalla de pago sería un callejón sin salida, porque
   * no es él quien puede reactivar la cuenta del negocio.
   */
  const [organization, subscription] = await Promise.all([
    organizationRepository.get(session.organizationId),
    subscriptionRepository.get(session.organizationId),
  ]);
  const state = effectiveSubscription(
    subscription,
    organization?.createdAt ?? new Date().toISOString(),
  );

  if (!state.allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">Cuenta inactiva</h1>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            La suscripción del negocio no está activa, así que el reparto está pausado. Avisale a
            quien administra el sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-canvas)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-600)] text-white">
              <Bike className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">Mis repartos</p>
              <p className="truncate text-xs text-[var(--color-ink-subtle)]">
                {session.name || session.email}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {hasPanel && (
              <Link
                href="/repartos"
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--color-brand-600)] hover:bg-[var(--color-canvas)]"
              >
                Panel
              </Link>
            )}
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="rounded-lg p-2 text-[var(--color-ink-subtle)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* El relleno inferior deja aire para la barra de gestos del teléfono. */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        {children}
      </main>
    </div>
  );
}

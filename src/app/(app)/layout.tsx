import { redirect } from 'next/navigation';

import { signOutAction } from '@/app/actions/auth';
import { AppShell } from '@/components/layout/app-shell';
import { getSession } from '@/lib/auth/session';
import { organizationRepository } from '@/lib/repositories/organization';

/**
 * Shell protegido. Cualquier ruta bajo este layout exige una sesión válida con
 * organización asignada; la verificación ocurre en el servidor, por lo que el
 * navegador nunca puede "saltársela".
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) redirect('/login');
  if (!session.organizationId) redirect('/sin-organizacion');

  const organization = await organizationRepository.get(session.organizationId);

  return (
    <AppShell
      user={{
        name: session.name || session.email,
        email: session.email,
        role: session.role,
        permissions: session.permissions,
        organizationName: organization?.name ?? 'Mi organización',
      }}
      onSignOut={signOutAction}
    >
      {children}
    </AppShell>
  );
}

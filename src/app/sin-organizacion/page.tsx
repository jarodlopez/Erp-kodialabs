import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { signOutAction } from '@/app/actions/auth';
import { Button, Card } from '@/components/ui/primitives';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Sin organización' };

/**
 * Estado intermedio: el usuario está autenticado en Firebase pero todavía no
 * pertenece a ninguna organización (por ejemplo, si el registro se interrumpió).
 */
export default async function NoOrganizationPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.organizationId) redirect('/');

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold">Tu usuario aún no tiene organización</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-subtle)]">
          Iniciaste sesión como <strong>{session.email}</strong>, pero esta cuenta todavía no está
          asociada a ninguna organización. Pide a un administrador que te dé acceso, o crea la tuya.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/registro">
            <Button className="w-full">Crear mi organización</Button>
          </Link>
          <form action={signOutAction}>
            <Button type="submit" variant="secondary" className="w-full">
              Cerrar sesión
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

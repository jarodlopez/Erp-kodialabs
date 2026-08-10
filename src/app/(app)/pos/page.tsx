import Link from 'next/link';
import type { Metadata } from 'next';

import { Card, PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { accountRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { PosTerminal } from './pos-terminal';

export const metadata: Metadata = { title: 'Punto de venta' };
export const dynamic = 'force-dynamic';

export default async function PosPage() {
  const session = await requirePermission(PERMISSIONS.SALES_CREATE);

  const [accounts, settings] = await Promise.all([
    accountRepository.list(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Punto de venta"
        description="Vende rápido de contado: busca o escanea productos y cobra. Descuenta inventario y registra el cobro automáticamente."
      />

      {accounts.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Necesitas al menos una cuenta financiera (caja o banco) para poder cobrar.{' '}
            <Link
              href="/caja-y-bancos"
              className="font-medium text-[var(--color-brand-600)] hover:underline"
            >
              Crear cuenta
            </Link>
          </p>
        </Card>
      ) : (
        <PosTerminal accounts={accounts} settings={settings} />
      )}
    </>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';

import { Card, PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { accountRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { SaleEditor } from './sale-editor';

export const metadata: Metadata = { title: 'Nueva venta' };
export const dynamic = 'force-dynamic';

export default async function NewSalePage() {
  const session = await requirePermission(PERMISSIONS.SALES_CREATE);

  const [accounts, settings] = await Promise.all([
    accountRepository.list(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Nueva venta"
        breadcrumb={
          <Link href="/ventas" className="hover:underline">
            Ventas
          </Link>
        }
        description="Al confirmar se descuenta inventario, se registra el cobro y se genera la cuenta por cobrar si aplica."
      />

      {accounts.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Antes de vender necesitas al menos una cuenta financiera (caja o banco) donde registrar
            los cobros.{' '}
            <Link href="/caja-y-bancos" className="font-medium text-[var(--color-brand-600)] hover:underline">
              Crear cuenta
            </Link>
          </p>
        </Card>
      ) : (
        <SaleEditor accounts={accounts} settings={settings} />
      )}
    </>
  );
}

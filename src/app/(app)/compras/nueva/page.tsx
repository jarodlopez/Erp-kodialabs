import Link from 'next/link';
import type { Metadata } from 'next';

import { Card, PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { accountRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { PurchaseEditor } from './purchase-editor';

export const metadata: Metadata = { title: 'Nueva compra' };
export const dynamic = 'force-dynamic';

export default async function NewPurchasePage() {
  const session = await requirePermission(PERMISSIONS.PURCHASES_CREATE);

  const [accounts, settings] = await Promise.all([
    accountRepository.list(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Nueva compra"
        breadcrumb={
          <Link href="/compras" className="hover:underline">
            Compras
          </Link>
        }
        description="Al recibirla se incrementa el inventario y se recalcula el costo promedio ponderado."
      />

      {accounts.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Necesitas al menos una cuenta financiera para registrar pagos.{' '}
            <Link href="/caja-y-bancos" className="font-medium text-[var(--color-brand-600)] hover:underline">
              Crear cuenta
            </Link>
          </p>
        </Card>
      ) : (
        <PurchaseEditor accounts={accounts} settings={settings} />
      )}
    </>
  );
}

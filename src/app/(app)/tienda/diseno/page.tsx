import Link from 'next/link';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/primitives';
import { imgbbConfigured } from '@/lib/imgbb';
import { PERMISSIONS } from '@/lib/rbac';
import { accountRepository } from '@/lib/repositories/finance';
import { warehouseRepository } from '@/lib/repositories/organization';
import { getActorContext } from '@/lib/server-context';
import { storeService } from '@/lib/services/store';
import { StoreDesignForm } from './design-form';

export const metadata: Metadata = { title: 'Diseño · Tienda' };
export const dynamic = 'force-dynamic';

export default async function StoreDesignPage() {
  const { session, actor } = await getActorContext(PERMISSIONS.STORE_MANAGE);

  const [settings, warehouses, accounts] = await Promise.all([
    storeService.ensureSettings(actor),
    warehouseRepository.list(session.organizationId),
    accountRepository.list(session.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Diseño de la tienda"
        breadcrumb={
          <Link href="/tienda" className="hover:underline">
            Tienda online
          </Link>
        }
        description="Identidad, módulos, envíos y datos de pago. Nada de esto vive en el código."
      />

      {!imgbbConfigured() && (
        <p className="mb-4 rounded-lg border border-[var(--color-warning-200)] bg-[var(--color-warning-50)] px-4 py-2.5 text-sm text-[var(--color-warning-700)]">
          Falta configurar <code>IMGBB_API_KEY</code>: hasta entonces no se pueden subir imágenes
          de la tienda.
        </p>
      )}

      <StoreDesignForm
        settings={settings}
        warehouses={warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name }))}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
      />
    </>
  );
}

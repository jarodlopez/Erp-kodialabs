import Link from 'next/link';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { ImportProducts } from './import-products';

export const metadata: Metadata = { title: 'Importar productos' };
export const dynamic = 'force-dynamic';

export default async function ImportProductsPage() {
  await requirePermission(PERMISSIONS.PRODUCTS_CREATE);

  return (
    <>
      <PageHeader
        title="Importar productos"
        breadcrumb={
          <Link href="/inventario" className="hover:underline">
            Inventario
          </Link>
        }
        description="Carga muchos productos a la vez desde un archivo CSV."
      />
      <ImportProducts />
    </>
  );
}

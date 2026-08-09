import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { categoryRepository } from '@/lib/repositories/catalog';
import { organizationRepository } from '@/lib/repositories/organization';
import { ProductForm } from '../product-form';

export const metadata: Metadata = { title: 'Nuevo producto' };
export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const session = await requirePermission(PERMISSIONS.PRODUCTS_CREATE);
  const [categories, settings] = await Promise.all([
    categoryRepository.list(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Nuevo producto"
        description="Define el SKU, los precios y las existencias iniciales."
        breadcrumb="Inventario / Nuevo"
      />
      <ProductForm categories={categories} defaultTaxRate={settings.defaultTaxRate} />
    </>
  );
}

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { categoryRepository, productRepository } from '@/lib/repositories/catalog';
import { organizationRepository } from '@/lib/repositories/organization';
import { ProductForm } from '../../product-form';

export const metadata: Metadata = { title: 'Editar producto' };
export const dynamic = 'force-dynamic';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);
  const { id } = await params;

  const [product, categories, settings] = await Promise.all([
    productRepository.get(session.organizationId, id),
    categoryRepository.list(session.organizationId, true),
    organizationRepository.getSettings(session.organizationId),
  ]);

  if (!product) notFound();

  return (
    <>
      <PageHeader
        title={`Editar ${product.name}`}
        breadcrumb="Inventario / Editar"
        description="Los cambios de precio no afectan documentos ya emitidos."
      />
      <ProductForm
        categories={categories}
        product={product}
        defaultTaxRate={settings.defaultTaxRate}
      />
    </>
  );
}

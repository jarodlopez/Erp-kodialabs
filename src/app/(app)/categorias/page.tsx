import Link from 'next/link';
import type { Metadata } from 'next';

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  TableWrapper,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { categoryRepository } from '@/lib/repositories/catalog';
import { formatDate } from '@/lib/utils';
import { CategoryManager } from './category-manager';

export const metadata: Metadata = { title: 'Categorías' };
export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const session = await requirePermission(PERMISSIONS.CATEGORIES_VIEW);
  const categories = await categoryRepository.list(session.organizationId, true);
  const canManage = session.permissions.includes(PERMISSIONS.CATEGORIES_MANAGE);

  return (
    <>
      <PageHeader
        title="Categorías"
        breadcrumb={
          <Link href="/inventario" className="hover:underline">
            Inventario
          </Link>
        }
        description="Organiza el catálogo para filtrar productos y analizar ventas por categoría."
        actions={canManage ? <CategoryManager mode="create" /> : undefined}
      />

      <Card>
        <CardHeader title={`${categories.length} categoría(s)`} />
        {categories.length === 0 ? (
          <EmptyState
            title="Sin categorías"
            description="Crea la primera categoría para clasificar tus productos."
            action={canManage ? <CategoryManager mode="create" /> : undefined}
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Descripción</Th>
                <Th align="right">Productos</Th>
                <Th>Estado</Th>
                <Th>Creada</Th>
                {canManage && <Th align="right">Acciones</Th>}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <Tr key={category.id}>
                  <Td>
                    <span className="inline-flex items-center gap-2 font-medium">
                      {category.color && (
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                      )}
                      {category.name}
                    </span>
                  </Td>
                  <Td className="max-w-[280px] truncate text-[var(--color-ink-muted)]">
                    {category.description ?? '—'}
                  </Td>
                  <Td align="right">{category.productCount}</Td>
                  <Td>
                    {category.status === 'ACTIVE' ? (
                      <Badge tone="positive">Activa</Badge>
                    ) : (
                      <Badge tone="neutral">Inactiva</Badge>
                    )}
                  </Td>
                  <Td className="text-[var(--color-ink-subtle)]">{formatDate(category.createdAt)}</Td>
                  {canManage && (
                    <Td align="right">
                      <CategoryManager mode="edit" category={category} />
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { Boxes, Plus } from 'lucide-react';

import { Money, Qty, StockBadge } from '@/components/domain/indicators';
import { CursorPagination, FilterBar } from '@/components/ui/data-table';
import {
  Badge,
  Button,
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
import { categoryRepository, productRepository } from '@/lib/repositories/catalog';
import { organizationRepository } from '@/lib/repositories/organization';

export const metadata: Metadata = { title: 'Inventario' };
export const dynamic = 'force-dynamic';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const params = await searchParams;

  const [categories, settings, page] = await Promise.all([
    categoryRepository.list(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
    productRepository.list(
      session.organizationId,
      {
        search: params.q ?? null,
        categoryId: params.categoria ?? null,
        status: (params.estado as 'ACTIVE' | 'INACTIVE' | 'ALL') ?? 'ACTIVE',
        lowStockOnly: params.lowStock === '1',
        outOfStockOnly: params.sinStock === '1',
      },
      { cursor: params.cursor ?? null, limit: 25 },
    ),
  ]);

  const canCreate = session.permissions.includes(PERMISSIONS.PRODUCTS_CREATE);
  const inventoryValue = page.items.reduce(
    (acc, product) => acc + Math.round((product.averageCost * product.stock) / 1000),
    0,
  );

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Catálogo de productos con existencias y costo promedio ponderado."
        actions={
          <div className="flex gap-2">
            <Link href="/categorias">
              <Button variant="secondary">Categorías</Button>
            </Link>
            <Link href="/inventario/movimientos">
              <Button variant="secondary">Movimientos</Button>
            </Link>
            {canCreate && (
              <Link href="/inventario/nuevo">
                <Button>
                  <Plus className="h-4 w-4" /> Nuevo producto
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Productos"
          description={`Valor de esta página al costo: ${new Intl.NumberFormat('es-NI', {
            style: 'currency',
            currency: settings.currency,
          }).format(inventoryValue / 100)}`}
        />

        <FilterBar
          searchPlaceholder="Buscar por nombre..."
          filters={[
            {
              name: 'categoria',
              label: 'Todas las categorías',
              options: categories.map((c) => ({ value: c.id, label: c.name })),
            },
            {
              name: 'estado',
              label: 'Estado',
              options: [
                { value: 'ACTIVE', label: 'Activos' },
                { value: 'INACTIVE', label: 'Inactivos' },
                { value: 'ALL', label: 'Todos' },
              ],
            },
            {
              name: 'lowStock',
              label: 'Existencias',
              options: [
                { value: '1', label: 'Solo stock bajo' },
              ],
            },
          ]}
        />

        {page.items.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title="No hay productos que coincidan"
            description="Ajusta los filtros o crea un producto nuevo para empezar a operar."
            action={
              canCreate ? (
                <Link href="/inventario/nuevo">
                  <Button size="sm">
                    <Plus className="h-4 w-4" /> Nuevo producto
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Categoría</Th>
                  <Th align="right">Existencias</Th>
                  <Th align="right">Costo prom.</Th>
                  <Th align="right">Precio</Th>
                  <Th align="right">Valor</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((product) => (
                  <Tr key={product.id}>
                    <Td>
                      <Link
                        href={`/inventario/${product.id}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {product.sku}
                        {product.barcode ? ` · ${product.barcode}` : ''}
                      </p>
                    </Td>
                    <Td>
                      {product.categoryName ? (
                        <Badge>{product.categoryName}</Badge>
                      ) : (
                        <span className="text-[var(--color-ink-subtle)]">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      {product.tracksInventory ? (
                        <Qty value={product.stock} />
                      ) : (
                        <span className="text-xs text-[var(--color-ink-subtle)]">Servicio</span>
                      )}
                    </Td>
                    <Td align="right">
                      <Money value={product.averageCost} currency={settings.currency} />
                    </Td>
                    <Td align="right">
                      <Money value={product.salePrice} currency={settings.currency} />
                    </Td>
                    <Td align="right">
                      <Money
                        value={Math.round((product.averageCost * product.stock) / 1000)}
                        currency={settings.currency}
                      />
                    </Td>
                    <Td>
                      {product.status === 'INACTIVE' ? (
                        <Badge tone="neutral">Inactivo</Badge>
                      ) : product.tracksInventory ? (
                        <StockBadge stock={product.stock} minimum={product.minimumStock} />
                      ) : (
                        <Badge tone="positive">Activo</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrapper>

            <CursorPagination
              nextCursor={page.nextCursor}
              hasMore={page.hasMore}
              count={page.items.length}
            />
          </>
        )}
      </Card>
    </>
  );
}

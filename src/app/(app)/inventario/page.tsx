import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { AlertTriangle, Boxes, PackageX, Plus, Wallet } from 'lucide-react';

import { Money, Qty, StockBadge } from '@/components/domain/indicators';
import { CursorPagination, FilterBar } from '@/components/ui/data-table';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  TableWrapper,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/lib/rbac';
import { categoryRepository, productRepository } from '@/lib/repositories/catalog';
import { organizationRepository } from '@/lib/repositories/organization';
import { ScanProductButton } from './scan-button';

export const metadata: Metadata = { title: 'Inventario' };
export const dynamic = 'force-dynamic';

/** Tarjeta de estadística del resumen; el acento cálido se reserva para aquí. */
function SummaryTile({
  label,
  value,
  hint,
  icon,
  variant = 'plain',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ReactNode;
  variant?: 'plain' | 'sun' | 'ember' | 'danger';
}) {
  const shell = {
    plain: 'bg-white border border-[var(--color-border)]',
    sun: 'tile-sun border-0',
    ember: 'tile-ember border-0',
    danger: 'bg-white border border-[var(--color-danger-100)]',
  }[variant];

  const chip = {
    plain: 'bg-[var(--color-brand-50)] text-[var(--color-brand-600)]',
    sun: 'bg-black/10 text-[var(--color-sun-ink)]',
    ember: 'bg-white/25 text-white',
    danger: 'bg-[var(--color-danger-50)] text-[var(--color-danger-700)]',
  }[variant];

  const labelClass =
    variant === 'sun' || variant === 'ember' ? 'opacity-80' : 'text-[var(--color-ink-subtle)]';
  const hintClass =
    variant === 'sun' || variant === 'ember' ? 'opacity-75' : 'text-[var(--color-ink-subtle)]';
  const valueClass = variant === 'danger' ? 'text-[var(--color-danger-700)]' : '';

  return (
    <div className={cn('rounded-2xl p-4 shadow-sm', shell)}>
      <div className="flex items-start justify-between gap-2">
        <p className={cn('text-xs font-medium sm:text-sm', labelClass)}>{label}</p>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', chip)}>
          {icon}
        </span>
      </div>
      <p className={cn('mt-2 text-xl font-semibold leading-tight tracking-tight tabular sm:text-2xl', valueClass)}>
        {value}
      </p>
      {hint && <p className={cn('mt-0.5 text-xs', hintClass)}>{hint}</p>}
    </div>
  );
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const params = await searchParams;

  const [categories, settings, page, allProducts] = await Promise.all([
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
    productRepository.allActive(session.organizationId),
  ]);

  const canCreate = session.permissions.includes(PERMISSIONS.PRODUCTS_CREATE);

  // Resumen global (sobre productos activos): la única zona con acento cálido.
  const tracked = allProducts.filter((p) => p.tracksInventory);
  const lowStockCount = tracked.filter(
    (p) => p.stock > 0 && p.stock <= p.minimumStock,
  ).length;
  const outOfStockCount = tracked.filter((p) => p.stock <= 0).length;
  const inventoryValue = tracked.reduce(
    (acc, product) => acc + Math.round((product.averageCost * product.stock) / 1000),
    0,
  );

  return (
    <div className="space-y-5">
      {/* Cabecera cálida con resumen del inventario */}
      <section className="warm-hero rounded-3xl p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-3xl">
              Inventario
            </h1>
            <p className="mt-1 max-w-xl text-sm text-[var(--color-ink-muted)]">
              Catálogo de productos con existencias y costo promedio ponderado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ScanProductButton canCreate={canCreate} />
            <Link href="/categorias">
              <Button variant="secondary">Categorías</Button>
            </Link>
            <Link href="/inventario/movimientos">
              <Button variant="secondary">Movimientos</Button>
            </Link>
            {canCreate && (
              <Link href="/inventario/importar">
                <Button variant="secondary">Importar</Button>
              </Link>
            )}
            {canCreate && (
              <Link href="/inventario/nuevo">
                <Button className="brand-gradient border-0">
                  <Plus className="h-4 w-4" /> Nuevo producto
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile
            variant="sun"
            label="Valor del inventario"
            value={formatMoney(inventoryValue, settings.currency)}
            hint="Al costo promedio"
            icon={<Wallet className="h-4 w-4" />}
          />
          <SummaryTile
            label="Productos activos"
            value={allProducts.length}
            hint={`${tracked.length} con inventario`}
            icon={<Boxes className="h-4 w-4" />}
          />
          <SummaryTile
            variant="ember"
            label="Stock bajo"
            value={lowStockCount}
            hint="En o bajo el mínimo"
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <SummaryTile
            variant="danger"
            label="Agotados"
            value={outOfStockCount}
            hint="Sin existencias"
            icon={<PackageX className="h-4 w-4" />}
          />
        </div>
      </section>

      <Card>
        <CardHeader
          title="Productos"
          description="Toca un producto para ver su detalle, movimientos y ajustes."
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
                    <Td label="Categoría">
                      {product.categoryName ? (
                        <Badge>{product.categoryName}</Badge>
                      ) : (
                        <span className="text-[var(--color-ink-subtle)]">—</span>
                      )}
                    </Td>
                    <Td align="right" label="Existencias">
                      {product.tracksInventory ? (
                        <Qty value={product.stock} />
                      ) : (
                        <span className="text-xs text-[var(--color-ink-subtle)]">Servicio</span>
                      )}
                    </Td>
                    <Td align="right" label="Costo prom.">
                      <Money value={product.averageCost} currency={settings.currency} />
                    </Td>
                    <Td align="right" label="Precio">
                      <Money value={product.salePrice} currency={settings.currency} />
                    </Td>
                    <Td align="right" label="Valor">
                      <Money
                        value={Math.round((product.averageCost * product.stock) / 1000)}
                        currency={settings.currency}
                      />
                    </Td>
                    <Td label="Estado">
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
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Pencil } from 'lucide-react';

import { Money, Qty, StockBadge } from '@/components/domain/indicators';
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
import { marginRate } from '@/lib/pricing';
import { PERMISSIONS } from '@/lib/rbac';
import { productRepository } from '@/lib/repositories/catalog';
import { inventoryRepository } from '@/lib/repositories/inventory';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDateTime, formatRate } from '@/lib/utils';
import { INVENTORY_MOVEMENT_LABELS, isInbound } from '@/types/inventory';
import { PRODUCT_UNIT_LABELS } from '@/types/catalog';
import { AdjustPanel } from './adjust-panel';
import { ProductStatusToggle } from './status-toggle';

export const metadata: Metadata = { title: 'Detalle de producto' };
export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const { id } = await params;

  const [product, settings] = await Promise.all([
    productRepository.get(session.organizationId, id),
    organizationRepository.getSettings(session.organizationId),
  ]);

  if (!product) notFound();

  const movements = await inventoryRepository.byProduct(session.organizationId, id, 30);
  const currency = settings.currency;

  const margin = marginRate(product.salePrice, product.averageCost);
  const stockValue = Math.round((product.averageCost * product.stock) / 1000);

  const canAdjust = session.permissions.includes(PERMISSIONS.INVENTORY_ADJUST);
  const canEdit = session.permissions.includes(PERMISSIONS.PRODUCTS_UPDATE);
  const canDeactivate = session.permissions.includes(PERMISSIONS.PRODUCTS_DEACTIVATE);

  return (
    <>
      <PageHeader
        title={product.name}
        breadcrumb={
          <Link href="/inventario" className="hover:underline">
            Inventario
          </Link>
        }
        description={`${product.sku}${product.barcode ? ` · ${product.barcode}` : ''}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canAdjust && product.tracksInventory && (
              <AdjustPanel productId={product.id} productName={product.name} />
            )}
            {canDeactivate && (
              <ProductStatusToggle productId={product.id} status={product.status} />
            )}
            {canEdit && (
              <Link href={`/inventario/${product.id}/editar`}>
                <Button>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Resumen" />
            <dl className="grid gap-4 p-5 sm:grid-cols-3">
              <Metric
                label="Existencias"
                value={product.tracksInventory ? <Qty value={product.stock} /> : 'No aplica'}
                extra={
                  product.tracksInventory ? (
                    <StockBadge stock={product.stock} minimum={product.minimumStock} />
                  ) : (
                    <Badge>Servicio</Badge>
                  )
                }
              />
              <Metric
                label="Costo promedio"
                value={<Money value={product.averageCost} currency={currency} />}
                extra={
                  <span className="text-xs text-[var(--color-ink-subtle)]">
                    Último costo: <Money value={product.cost} currency={currency} />
                  </span>
                }
              />
              <Metric
                label="Precio de venta"
                value={<Money value={product.salePrice} currency={currency} />}
                extra={
                  <span className="text-xs text-[var(--color-ink-subtle)]">
                    Margen: {formatRate(margin)}
                  </span>
                }
              />
              <Metric
                label="Valor en inventario"
                value={<Money value={stockValue} currency={currency} />}
              />
              <Metric
                label="Stock mínimo"
                value={<Qty value={product.minimumStock} />}
              />
              <Metric label="Impuesto" value={formatRate(product.taxRate)} />
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Movimientos de inventario"
              description="Cada cambio de existencias queda registrado con su origen."
            />
            {movements.length === 0 ? (
              <EmptyState
                title="Sin movimientos"
                description="Este producto todavía no registra entradas ni salidas."
              />
            ) : (
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Tipo</Th>
                    <Th>Referencia</Th>
                    <Th align="right">Cantidad</Th>
                    <Th align="right">Anterior</Th>
                    <Th align="right">Nuevo</Th>
                    <Th align="right">Costo unit.</Th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <Tr key={movement.id}>
                      <Td>
                        <span className="text-xs">{formatDateTime(movement.createdAt)}</span>
                        <p className="text-xs text-[var(--color-ink-subtle)]">
                          {movement.createdByName}
                        </p>
                      </Td>
                      <Td>
                        <Badge tone={isInbound(movement.type) ? 'positive' : 'warning'}>
                          {INVENTORY_MOVEMENT_LABELS[movement.type]}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="text-xs">{movement.referenceNumber ?? '—'}</span>
                        {movement.reason && (
                          <p className="max-w-[220px] truncate text-xs text-[var(--color-ink-subtle)]">
                            {movement.reason}
                          </p>
                        )}
                      </Td>
                      <Td align="right">
                        <span
                          className={
                            isInbound(movement.type)
                              ? 'text-[var(--color-positive-700)]'
                              : 'text-[var(--color-danger-700)]'
                          }
                        >
                          {isInbound(movement.type) ? '+' : '−'}
                          {(movement.quantity / 1000).toLocaleString('es-NI')}
                        </span>
                      </Td>
                      <Td align="right">{(movement.previousStock / 1000).toLocaleString('es-NI')}</Td>
                      <Td align="right">{(movement.newStock / 1000).toLocaleString('es-NI')}</Td>
                      <Td align="right">
                        <Money value={movement.unitCost} currency={currency} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrapper>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Ficha" />
            <dl className="space-y-3 p-5 text-sm">
              <Row label="Categoría" value={product.categoryName ?? 'Sin categoría'} />
              <Row label="Marca" value={product.brand ?? '—'} />
              <Row label="Unidad" value={PRODUCT_UNIT_LABELS[product.unit]} />
              <Row
                label="Precio mayorista"
                value={<Money value={product.wholesalePrice} currency={currency} />}
              />
              <Row
                label="Estado"
                value={
                  product.status === 'ACTIVE' ? (
                    <Badge tone="positive">Activo</Badge>
                  ) : (
                    <Badge tone="neutral">Inactivo</Badge>
                  )
                }
              />
              <Row label="Creado" value={formatDateTime(product.createdAt)} />
              <Row label="Actualizado" value={formatDateTime(product.updatedAt)} />
            </dl>
          </Card>

          {product.description && (
            <Card>
              <CardHeader title="Descripción" />
              <p className="whitespace-pre-line p-5 text-sm text-[var(--color-ink-muted)]">
                {product.description}
              </p>
            </Card>
          )}

          {product.imageUrl && (
            <Card className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-56 w-full object-cover"
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  extra,
}: {
  label: string;
  value: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-ink-subtle)]">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular">{value}</dd>
      {extra && <div className="mt-1">{extra}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--color-ink-subtle)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

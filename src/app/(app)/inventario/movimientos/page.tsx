import Link from 'next/link';
import type { Metadata } from 'next';

import { Money } from '@/components/domain/indicators';
import { CursorPagination, DateRangeFilter, FilterBar } from '@/components/ui/data-table';
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
import { inventoryRepository } from '@/lib/repositories/inventory';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDateTime } from '@/lib/utils';
import { INVENTORY_MOVEMENT_LABELS, isInbound, type InventoryMovementType } from '@/types/inventory';

export const metadata: Metadata = { title: 'Movimientos de inventario' };
export const dynamic = 'force-dynamic';

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const params = await searchParams;

  const [settings, page] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    inventoryRepository.listMovements(
      session.organizationId,
      {
        type: (params.tipo as InventoryMovementType) ?? null,
        from: params.from ?? null,
        to: params.to ?? null,
      },
      { cursor: params.cursor ?? null, limit: 40 },
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Movimientos de inventario"
        breadcrumb={
          <Link href="/inventario" className="hover:underline">
            Inventario
          </Link>
        }
        description="Bitácora completa de entradas y salidas, con su documento de origen."
      />

      <Card>
        <CardHeader title="Kardex general" />
        <FilterBar
          searchPlaceholder="Buscar no disponible aquí"
          filters={[
            {
              name: 'tipo',
              label: 'Todos los tipos',
              options: Object.entries(INVENTORY_MOVEMENT_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            },
          ]}
        >
          <DateRangeFilter />
        </FilterBar>

        {page.items.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="No hay movimientos de inventario para los filtros seleccionados."
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Producto</Th>
                  <Th>Tipo</Th>
                  <Th>Referencia</Th>
                  <Th align="right">Cantidad</Th>
                  <Th align="right">Stock final</Th>
                  <Th align="right">Costo total</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((movement) => (
                  <Tr key={movement.id}>
                    <Td>
                      <span className="text-xs">{formatDateTime(movement.createdAt)}</span>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {movement.createdByName}
                      </p>
                    </Td>
                    <Td>
                      <Link
                        href={`/inventario/${movement.productId}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {movement.productName}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-subtle)]">{movement.productSku}</p>
                    </Td>
                    <Td>
                      <Badge tone={isInbound(movement.type) ? 'positive' : 'warning'}>
                        {INVENTORY_MOVEMENT_LABELS[movement.type]}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="text-xs">{movement.referenceNumber ?? '—'}</span>
                      {movement.reason && (
                        <p className="max-w-[200px] truncate text-xs text-[var(--color-ink-subtle)]">
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
                    <Td align="right">{(movement.newStock / 1000).toLocaleString('es-NI')}</Td>
                    <Td align="right">
                      <Money value={movement.totalCost} currency={settings.currency} />
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

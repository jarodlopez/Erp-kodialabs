import Link from 'next/link';
import type { Metadata } from 'next';
import { ShoppingBag } from 'lucide-react';

import { Money } from '@/components/domain/indicators';
import { CursorPagination, FilterBar } from '@/components/ui/data-table';
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
import { organizationRepository } from '@/lib/repositories/organization';
import { storeOrderRepository } from '@/lib/repositories/store';
import { formatDateTime } from '@/lib/utils';
import { STORE_ORDER_STATUS_LABELS, type StoreOrderStatus } from '@/types/store';

export const metadata: Metadata = { title: 'Pedidos · Tienda' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<StoreOrderStatus, 'neutral' | 'warning' | 'positive' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'positive',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export default async function StoreOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.STORE_ORDERS_VIEW);
  const params = await searchParams;

  const [orgSettings, page] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    storeOrderRepository.list(
      session.organizationId,
      { status: (params.estado as StoreOrderStatus | undefined) ?? 'ALL' },
      { cursor: params.cursor ?? null, limit: 25 },
    ),
  ]);

  const currency = orgSettings.currency;

  return (
    <>
      <PageHeader
        title="Pedidos online"
        breadcrumb={
          <Link href="/tienda" className="hover:underline">
            Tienda online
          </Link>
        }
        description="Un pedido no mueve inventario ni dinero hasta que se aprueba; al aprobarlo se genera la venta."
      />

      <Card>
        <CardHeader
          title="Pedidos recibidos"
          description="Revisá el comprobante antes de aprobar: la venta se confirma en el acto."
        />

        <FilterBar
          searchPlaceholder="Buscar (usa el filtro de estado)"
          filters={[
            {
              name: 'estado',
              label: 'Todos los estados',
              options: Object.entries(STORE_ORDER_STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            },
          ]}
        />

        {page.items.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="h-5 w-5" />}
            title="Sin pedidos"
            description="Cuando alguien compre en tu tienda, el pedido aparecerá aquí para que lo revises."
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Pedido</Th>
                  <Th>Cliente</Th>
                  <Th>Entrega</Th>
                  <Th>Comprobante</Th>
                  <Th>Estado</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((order) => (
                  <Tr key={order.id}>
                    <Td>
                      <Link
                        href={`/tienda/pedidos/${order.id}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {order.number}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {formatDateTime(order.createdAt)} · {order.items.length} ítem(s)
                      </p>
                    </Td>
                    <Td label="Cliente" className="max-w-[200px] truncate">
                      {order.customer.name}
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {order.customer.phone}
                      </p>
                    </Td>
                    <Td label="Entrega" className="max-w-[180px] truncate text-[var(--color-ink-muted)]">
                      {order.shippingZoneLabel ?? '—'}
                    </Td>
                    <Td label="Comprobante">
                      {order.receiptUrl ? (
                        <Badge tone="positive">Adjunto</Badge>
                      ) : (
                        <Badge tone="neutral">Sin comprobante</Badge>
                      )}
                    </Td>
                    <Td label="Estado">
                      <Badge tone={STATUS_TONE[order.status]}>
                        {STORE_ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                      {order.saleNumber && (
                        <p className="text-xs text-[var(--color-ink-subtle)]">{order.saleNumber}</p>
                      )}
                    </Td>
                    <Td label="Total" align="right">
                      <Money value={order.total} currency={currency} />
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

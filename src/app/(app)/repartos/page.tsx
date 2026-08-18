import Link from 'next/link';
import type { Metadata } from 'next';
import { Bike, MapPin, Plus } from 'lucide-react';

import { Money, SummaryTile } from '@/components/domain/indicators';
import { CursorPagination, FilterBar } from '@/components/ui/data-table';
import {
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
import { formatDistance, formatDuration } from '@/lib/geo';
import { PERMISSIONS } from '@/lib/rbac';
import { deliveryRepository } from '@/lib/repositories/delivery';
import { organizationRepository } from '@/lib/repositories/organization';
import { daysAgoIso, formatDateTime } from '@/lib/utils';
import {
  DELIVERY_SOURCE_LABELS,
  DELIVERY_STATUS_LABELS,
  type DeliveryStatus,
} from '@/types/delivery';
import { deliveryService } from '@/lib/services/delivery';
import { DeliveryStatusBadge } from './status-badge';

export const metadata: Metadata = { title: 'Repartos' };
export const dynamic = 'force-dynamic';

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.DELIVERY_VIEW);
  const params = await searchParams;
  const canManage = session.permissions.includes(PERMISSIONS.DELIVERY_MANAGE);

  const [orgSettings, page, summary] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    deliveryRepository.list(
      session.organizationId,
      { status: (params.estado as DeliveryStatus | undefined) ?? 'ALL' },
      { cursor: params.cursor ?? null, limit: 25 },
    ),
    deliveryService.summary(session.organizationId, daysAgoIso(30)),
  ]);

  const currency = orgSettings.currency;
  const live = summary.pending + summary.assigned + summary.inTransit;

  return (
    <>
      <PageHeader
        title="Repartos"
        description="Cada reparto nace de una venta o de un pedido online. El costo sale del recorrido real del rider, no de una estimación."
        actions={
          <>
            <Link
              href="/repartos/mapa"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-canvas)]"
            >
              <MapPin className="h-4 w-4" /> Mapa en vivo
              {live > 0 && (
                <span className="rounded-full bg-[var(--color-brand-600)] px-1.5 text-xs text-white">
                  {live}
                </span>
              )}
            </Link>
            {canManage && (
              <Link
                href="/repartos/nuevo"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-700)]"
              >
                <Plus className="h-4 w-4" /> Nuevo reparto
              </Link>
            )}
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="Por asignar"
          value={summary.pending}
          hint="Esperan rider"
          variant={summary.pending > 0 ? 'sun' : 'plain'}
          icon={<Bike className="h-4 w-4" />}
        />
        <SummaryTile label="En camino" value={summary.inTransit} hint="Rider en la calle" />
        <SummaryTile
          label="Entregados (30 días)"
          value={summary.deliveredCount}
          hint={
            summary.averageMinutes !== null
              ? `Promedio ${formatDuration(summary.averageMinutes)} en calle`
              : 'Sin tiempos medidos aún'
          }
        />
        {/*
          El margen es la razón de ser de los dos importes separados: cobrar C$50
          de envío y gastar C$70 en hacerlo es una pérdida que sin este número
          queda escondida dentro del total de ventas.
        */}
        <SummaryTile
          label="Margen de envíos (30 días)"
          value={<Money value={summary.margin} currency={currency} signed />}
          hint="Cobrado en envíos menos costo operativo"
          variant={summary.margin < 0 ? 'danger' : 'positive'}
        />
      </div>

      <Card>
        <CardHeader
          title="Historial"
          description="Los repartos vivos se siguen mejor desde el mapa; acá está el registro completo."
        />

        <FilterBar
          searchPlaceholder="Buscar (usa el filtro de estado)"
          filters={[
            {
              name: 'estado',
              label: 'Todos los estados',
              options: Object.entries(DELIVERY_STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            },
          ]}
        />

        {page.items.length === 0 ? (
          <EmptyState
            icon={<Bike className="h-5 w-5" />}
            title="Sin repartos"
            description={
              canManage
                ? 'Creá el primero desde una venta con datos de entrega o desde un pedido online aprobado.'
                : 'Cuando se despache un reparto aparecerá acá.'
            }
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Reparto</Th>
                  <Th>Cliente</Th>
                  <Th>Rider</Th>
                  <Th>Recorrido</Th>
                  <Th>Estado</Th>
                  <Th align="right">Cobrado</Th>
                  <Th align="right">Costo</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((delivery) => (
                  <Tr key={delivery.id}>
                    <Td>
                      <Link
                        href={`/repartos/${delivery.id}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {delivery.number}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {formatDateTime(delivery.createdAt)} ·{' '}
                        {DELIVERY_SOURCE_LABELS[delivery.source]} {delivery.sourceNumber}
                      </p>
                    </Td>
                    <Td label="Cliente" className="max-w-[220px]">
                      <span className="block truncate">{delivery.customerName}</span>
                      <span className="block truncate text-xs text-[var(--color-ink-subtle)]">
                        {delivery.destination.address}
                      </span>
                    </Td>
                    <Td label="Rider">
                      {delivery.riderName ?? (
                        <span className="text-[var(--color-ink-subtle)]">Sin asignar</span>
                      )}
                    </Td>
                    <Td label="Recorrido">
                      <span className="tabular">
                        {delivery.distances.traveled > 0
                          ? formatDistance(delivery.distances.traveled)
                          : `≈ ${formatDistance(delivery.distances.estimated)}`}
                      </span>
                      {delivery.distances.traveled === 0 && (
                        <span className="block text-xs text-[var(--color-ink-subtle)]">
                          estimado
                        </span>
                      )}
                    </Td>
                    <Td label="Estado">
                      <DeliveryStatusBadge status={delivery.status} />
                    </Td>
                    <Td label="Cobrado" align="right">
                      <Money value={delivery.amounts.charged} currency={currency} />
                    </Td>
                    <Td label="Costo" align="right">
                      {delivery.amounts.cost > 0 ? (
                        <Money value={delivery.amounts.cost} currency={currency} />
                      ) : (
                        <span className="text-[var(--color-ink-subtle)]">—</span>
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

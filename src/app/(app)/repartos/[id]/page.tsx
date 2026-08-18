import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Bike, Clock, MapPin, Route, Wallet } from 'lucide-react';

import { Money } from '@/components/domain/indicators';
import { DeliveryMap, type MapMarker } from '@/components/domain/map';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { formatDistance, formatDuration } from '@/lib/geo';
import { PERMISSIONS } from '@/lib/rbac';
import { deliveryRepository, deliveryTrackRepository } from '@/lib/repositories/delivery';
import { organizationRepository } from '@/lib/repositories/organization';
import { deliveryService } from '@/lib/services/delivery';
import { formatDateTime } from '@/lib/utils';
import { ACTIVE_DELIVERY_STATUSES, DELIVERY_SOURCE_LABELS } from '@/types/delivery';
import { DeliveryStatusBadge } from '../status-badge';
import { DeliveryActions } from './delivery-actions';

export const metadata: Metadata = { title: 'Reparto' };
export const dynamic = 'force-dynamic';

/** Minutos transcurridos entre dos instantes, o `null` si falta alguno. */
function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const span = new Date(to).getTime() - new Date(from).getTime();
  return span > 0 ? Math.round(span / 60000) : null;
}

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.DELIVERY_VIEW);
  const { id } = await params;

  const delivery = await deliveryRepository.get(session.organizationId, id);
  if (!delivery) notFound();

  const canManage = session.permissions.includes(PERMISSIONS.DELIVERY_MANAGE);
  const isLive = ACTIVE_DELIVERY_STATUSES.includes(delivery.status);

  const [track, orgSettings, riders] = await Promise.all([
    deliveryTrackRepository.get(session.organizationId, id),
    organizationRepository.getSettings(session.organizationId),
    canManage && isLive ? deliveryService.listRiders(session.organizationId) : Promise.resolve([]),
  ]);

  const currency = orgSettings.currency;
  const realMinutes = minutesBetween(delivery.times.startedAt, delivery.times.finishedAt);

  const markers: MapMarker[] = [
    { id: 'origin', point: delivery.origin, kind: 'origin', label: 'Salida' },
    {
      id: 'destination',
      point: delivery.destination.point,
      kind: 'destination',
      label: delivery.destination.address,
    },
  ];
  if (delivery.lastPoint) {
    markers.push({
      id: 'rider',
      point: delivery.lastPoint,
      kind: 'rider',
      label: `${delivery.riderName ?? 'Rider'} · ${formatDateTime(delivery.lastPoint.at)}`,
    });
  }

  const sourceHref =
    delivery.source === 'SALE'
      ? `/ventas/${delivery.sourceId}`
      : `/tienda/pedidos/${delivery.sourceId}`;

  return (
    <>
      <PageHeader
        title={`Reparto ${delivery.number}`}
        breadcrumb={
          <Link href="/repartos" className="hover:underline">
            Repartos
          </Link>
        }
        description={`${DELIVERY_SOURCE_LABELS[delivery.source]} ${delivery.sourceNumber} · ${delivery.customerName}`}
        actions={
          <>
            <DeliveryStatusBadge status={delivery.status} />
            {canManage && isLive && (
              <DeliveryActions
                deliveryId={delivery.id}
                riders={riders}
                currentRiderId={delivery.riderId}
              />
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Recorrido"
              description={
                track && track.points.length > 1
                  ? 'La línea verde es lo que el teléfono del rider registró de verdad; la punteada, la referencia en línea recta.'
                  : 'Todavía no hay marcas de posición: la línea punteada es la referencia en línea recta.'
              }
            />
            <div className="p-4 pt-0 sm:p-5 sm:pt-0">
              <DeliveryMap
                markers={markers}
                track={track?.points ?? []}
                straightLine={[delivery.origin, delivery.destination.point]}
                height={420}
              />
              {track && track.rejectedCount > 0 && (
                <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
                  {track.rejectedCount} lectura(s) descartada(s) por imprecisas o por implicar un
                  salto imposible. No suman al recorrido ni al costo.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Entrega" />
            <dl className="grid gap-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
              <div>
                <dt className="text-xs text-[var(--color-ink-subtle)]">Dirección</dt>
                <dd>{delivery.destination.address}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-ink-subtle)]">Recibe</dt>
                <dd>{delivery.destination.recipient ?? delivery.customerName}</dd>
              </div>
              {delivery.destination.phone && (
                <div>
                  <dt className="text-xs text-[var(--color-ink-subtle)]">Teléfono</dt>
                  <dd>
                    <a href={`tel:${delivery.destination.phone}`} className="hover:underline">
                      {delivery.destination.phone}
                    </a>
                  </dd>
                </div>
              )}
              {delivery.destination.landmark && (
                <div>
                  <dt className="text-xs text-[var(--color-ink-subtle)]">Referencia</dt>
                  <dd>{delivery.destination.landmark}</dd>
                </div>
              )}
              {delivery.destination.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-[var(--color-ink-subtle)]">Notas de la entrega</dt>
                  <dd>{delivery.destination.notes}</dd>
                </div>
              )}
              {delivery.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-[var(--color-ink-subtle)]">Notas para el rider</dt>
                  <dd>{delivery.notes}</dd>
                </div>
              )}
              {delivery.resolutionNote && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-[var(--color-ink-subtle)]">Resolución</dt>
                  <dd className="text-[var(--color-danger-700)]">{delivery.resolutionNote}</dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-xs text-[var(--color-ink-subtle)]">Documento de origen</dt>
                <dd>
                  <Link href={sourceHref} className="text-[var(--color-brand-600)] hover:underline">
                    {DELIVERY_SOURCE_LABELS[delivery.source]} {delivery.sourceNumber}
                  </Link>
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Distancia y tiempo" />
            <dl className="space-y-3 p-4 text-sm sm:p-5">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-[var(--color-ink-muted)]">
                  <Route className="h-3.5 w-3.5" /> Estimada
                </dt>
                <dd className="tabular">{formatDistance(delivery.distances.estimated)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-[var(--color-ink-muted)]">
                  <MapPin className="h-3.5 w-3.5" /> Recorrida
                </dt>
                <dd className="tabular font-medium">
                  {delivery.distances.traveled > 0
                    ? formatDistance(delivery.distances.traveled)
                    : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                <dt className="flex items-center gap-1.5 text-[var(--color-ink-muted)]">
                  <Clock className="h-3.5 w-3.5" /> Tiempo estimado
                </dt>
                <dd className="tabular">
                  {delivery.times.estimatedMinutes !== null
                    ? formatDuration(delivery.times.estimatedMinutes)
                    : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-ink-muted)]">Tiempo real</dt>
                <dd className="tabular font-medium">
                  {realMinutes !== null ? formatDuration(realMinutes) : '—'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Dinero"
              description="Cobrado al cliente contra costo operativo: la diferencia es el margen real de esta entrega."
            />
            <dl className="space-y-3 p-4 text-sm sm:p-5">
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-ink-muted)]">Cobrado por envío</dt>
                <dd>
                  <Money value={delivery.amounts.charged} currency={currency} />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-ink-muted)]">Costo operativo</dt>
                <dd>
                  {delivery.amounts.cost > 0 ? (
                    <Money value={delivery.amounts.cost} currency={currency} />
                  ) : (
                    <span className="text-[var(--color-ink-subtle)]">
                      se calcula al cerrar
                    </span>
                  )}
                </dd>
              </div>
              {delivery.amounts.riderPay > 0 && (
                <div className="flex items-center justify-between text-xs text-[var(--color-ink-subtle)]">
                  <dt>Incluye pago al rider</dt>
                  <dd>
                    <Money value={delivery.amounts.riderPay} currency={currency} />
                  </dd>
                </div>
              )}
              {delivery.amounts.cost > 0 && (
                <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3 font-medium">
                  <dt>Margen</dt>
                  <dd>
                    <Money
                      value={delivery.amounts.charged - delivery.amounts.cost}
                      currency={currency}
                      signed
                    />
                  </dd>
                </div>
              )}
              {delivery.amounts.expenseId && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--color-ink-subtle)]">
                  <Wallet className="h-3.5 w-3.5" /> El costo quedó registrado como gasto.
                </p>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Línea de tiempo" />
            <ol className="space-y-3 p-4 text-sm sm:p-5">
              <li>
                <p className="text-xs text-[var(--color-ink-subtle)]">Despachado</p>
                <p>{formatDateTime(delivery.createdAt)}</p>
              </li>
              <li>
                <p className="text-xs text-[var(--color-ink-subtle)]">Asignado</p>
                <p className="flex items-center gap-1.5">
                  {delivery.times.assignedAt ? (
                    <>
                      <Bike className="h-3.5 w-3.5" /> {formatDateTime(delivery.times.assignedAt)}
                      {delivery.riderName && ` · ${delivery.riderName}`}
                    </>
                  ) : (
                    <span className="text-[var(--color-ink-subtle)]">Sin asignar</span>
                  )}
                </p>
              </li>
              <li>
                <p className="text-xs text-[var(--color-ink-subtle)]">Salió</p>
                <p>
                  {delivery.times.startedAt ? (
                    formatDateTime(delivery.times.startedAt)
                  ) : (
                    <span className="text-[var(--color-ink-subtle)]">Todavía no salió</span>
                  )}
                </p>
              </li>
              <li>
                <p className="text-xs text-[var(--color-ink-subtle)]">Cerrado</p>
                <p>
                  {delivery.times.finishedAt ? (
                    formatDateTime(delivery.times.finishedAt)
                  ) : (
                    <span className="text-[var(--color-ink-subtle)]">En curso</span>
                  )}
                </p>
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

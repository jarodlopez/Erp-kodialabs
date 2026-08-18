import Link from 'next/link';
import type { Metadata } from 'next';
import { Bike, ChevronRight, MapPin } from 'lucide-react';

import { Card, EmptyState } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { formatDistance } from '@/lib/geo';
import { PERMISSIONS } from '@/lib/rbac';
import { deliveryRepository } from '@/lib/repositories/delivery';
import {
  ACTIVE_DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS,
} from '@/types/delivery';

export const metadata: Metadata = { title: 'Mis repartos' };
export const dynamic = 'force-dynamic';

export default async function RiderQueuePage() {
  const session = await requirePermission(PERMISSIONS.DELIVERY_RIDE);

  const queue = await deliveryRepository.activeForRider(
    session.organizationId,
    session.uid,
    ACTIVE_DELIVERY_STATUSES,
  );

  if (queue.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Bike className="h-5 w-5" />}
          title="No tenés repartos"
          description="Cuando te asignen uno aparecerá acá. Podés cerrar la app; al volver se actualiza."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-ink-muted)]">
        {queue.length} reparto(s) asignado(s). El más viejo primero.
      </p>

      {queue.map((delivery) => (
        <Link
          key={delivery.id}
          href={`/reparto/${delivery.id}`}
          className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition-colors hover:border-[var(--color-brand-300)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-subtle)]">
                {delivery.number} · {DELIVERY_STATUS_LABELS[delivery.status]}
              </p>
              <p className="mt-1 font-semibold">{delivery.customerName}</p>
              <p className="mt-0.5 flex items-start gap-1 text-sm text-[var(--color-ink-muted)]">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{delivery.destination.address}</span>
              </p>
              {delivery.destination.landmark && (
                <p className="mt-0.5 text-sm text-[var(--color-ink-subtle)]">
                  {delivery.destination.landmark}
                </p>
              )}
              <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
                {delivery.status === 'IN_TRANSIT'
                  ? `Recorrido ${formatDistance(delivery.distances.traveled)}`
                  : `≈ ${formatDistance(delivery.distances.estimated)} de acá`}
              </p>
            </div>
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[var(--color-ink-subtle)]" />
          </div>
        </Link>
      ))}
    </div>
  );
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, MapPin, Phone } from 'lucide-react';

import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { deliveryRepository, deliverySettingsRepository } from '@/lib/repositories/delivery';
import { ACTIVE_DELIVERY_STATUSES } from '@/types/delivery';
import { RiderTracker } from './rider-tracker';

export const metadata: Metadata = { title: 'Reparto en curso' };
export const dynamic = 'force-dynamic';

export default async function RiderDeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.DELIVERY_RIDE);
  const { id } = await params;

  const delivery = await deliveryRepository.get(session.organizationId, id);
  if (!delivery) notFound();

  // El permiso dice "puede repartir", no "puede ver cualquier reparto". Sin
  // esta comprobación un rider podría abrir el de un compañero cambiando el id
  // de la URL, y con él el nombre, la dirección y el teléfono de ese cliente.
  if (delivery.riderId !== session.uid) notFound();

  // Un reparto cerrado no tiene nada que hacer en la vista del rider: se
  // devuelve a la cola en lugar de mostrar botones que ya no hacen nada.
  if (!ACTIVE_DELIVERY_STATUSES.includes(delivery.status)) redirect('/reparto');

  const settings = await deliverySettingsRepository.get(session.organizationId);

  const mapsHref = `https://www.openstreetmap.org/?mlat=${delivery.destination.point.lat}&mlon=${delivery.destination.point.lng}#map=17/${delivery.destination.point.lat}/${delivery.destination.point.lng}`;

  return (
    <div className="space-y-4">
      <Link
        href="/reparto"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-4 w-4" /> Mis repartos
      </Link>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-subtle)]">
          {delivery.number}
        </p>
        <h1 className="mt-1 text-xl font-semibold">{delivery.customerName}</h1>
        <p className="mt-2 flex items-start gap-1.5 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" />
          <span>{delivery.destination.address}</span>
        </p>
        {delivery.destination.landmark && (
          <p className="mt-1 pl-6 text-sm font-medium">{delivery.destination.landmark}</p>
        )}
        {delivery.destination.notes && (
          <p className="mt-1 pl-6 text-sm text-[var(--color-ink-muted)]">
            {delivery.destination.notes}
          </p>
        )}
        {delivery.notes && (
          <p className="mt-2 rounded-xl bg-[var(--color-warning-50)] px-3 py-2 text-sm text-[var(--color-warning-700)]">
            {delivery.notes}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {delivery.destination.phone && (
            <a
              href={`tel:${delivery.destination.phone}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium"
            >
              <Phone className="h-4 w-4" /> Llamar
            </a>
          )}
          {/*
            El enlace abre el punto en OpenStreetMap y no en una app de mapas
            concreta: el rider elige con qué navegar y no hace falta que el
            negocio pague ningún SDK para que exista este botón.
          */}
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium"
          >
            <MapPin className="h-4 w-4" /> Abrir en el mapa
          </a>
        </div>
      </section>

      <RiderTracker
        deliveryId={delivery.id}
        status={delivery.status}
        destination={delivery.destination.point}
        origin={delivery.origin}
        traveled={delivery.distances.traveled}
        pingSeconds={settings.pingSeconds}
        maxAccuracyMeters={settings.maxAccuracyMeters}
      />
    </div>
  );
}

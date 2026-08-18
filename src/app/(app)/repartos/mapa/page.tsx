import Link from 'next/link';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { deliveryRepository, deliverySettingsRepository } from '@/lib/repositories/delivery';
import { ACTIVE_DELIVERY_STATUSES } from '@/types/delivery';
import { LiveMap, type LiveDelivery } from './live-map';

export const metadata: Metadata = { title: 'Mapa en vivo · Repartos' };
export const dynamic = 'force-dynamic';

export default async function DeliveryLiveMapPage() {
  const session = await requirePermission(PERMISSIONS.DELIVERY_VIEW);

  const [active, settings] = await Promise.all([
    deliveryRepository.active(session.organizationId, ACTIVE_DELIVERY_STATUSES),
    deliverySettingsRepository.get(session.organizationId),
  ]);

  // El primer dibujo llega renderizado desde el servidor para que el mapa no
  // aparezca vacío mientras el cliente hace su primera consulta.
  const initial: LiveDelivery[] = active.map((delivery) => ({
    id: delivery.id,
    number: delivery.number,
    status: delivery.status,
    customerName: delivery.customerName,
    address: delivery.destination.address,
    riderName: delivery.riderName,
    origin: delivery.origin,
    destination: delivery.destination.point,
    lastPoint: delivery.lastPoint,
    traveled: delivery.distances.traveled,
    estimated: delivery.distances.estimated,
  }));

  return (
    <>
      <PageHeader
        title="Mapa en vivo"
        breadcrumb={
          <Link href="/repartos" className="hover:underline">
            Repartos
          </Link>
        }
        description="Dónde está cada rider ahora mismo. Las posiciones llegan del teléfono de cada uno mientras tiene el reparto abierto."
      />

      <LiveMap
        initial={initial}
        origin={settings.origin}
        refreshSeconds={Math.max(10, settings.pingSeconds)}
      />
    </>
  );
}

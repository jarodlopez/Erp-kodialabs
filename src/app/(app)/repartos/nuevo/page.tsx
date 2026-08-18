import Link from 'next/link';
import type { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';

import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { deliverySettingsRepository } from '@/lib/repositories/delivery';
import { organizationRepository } from '@/lib/repositories/organization';
import { deliveryService } from '@/lib/services/delivery';
import { DispatchForm } from './dispatch-form';

export const metadata: Metadata = { title: 'Nuevo reparto' };
export const dynamic = 'force-dynamic';

export default async function NewDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.DELIVERY_MANAGE);
  const params = await searchParams;

  const [candidates, riders, settings, orgSettings] = await Promise.all([
    deliveryService.listCandidates(session.organizationId),
    deliveryService.listRiders(session.organizationId),
    deliverySettingsRepository.get(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
  ]);

  // Se puede llegar acá desde la ficha de una venta o de un pedido, con el
  // documento ya elegido.
  const preselected =
    candidates.find(
      (item) => item.sourceId === (params.venta ?? params.pedido ?? ''),
    ) ?? null;

  return (
    <>
      <PageHeader
        title="Nuevo reparto"
        breadcrumb={
          <Link href="/repartos" className="hover:underline">
            Repartos
          </Link>
        }
        description="Elegí el documento, marcá el destino en el mapa y asigná un rider. La tarifa al cliente se calcula sobre la distancia estimada."
      />

      {!settings.origin && (
        <div className="mb-4 rounded-2xl border border-[var(--color-warning-200)] bg-[var(--color-warning-50)] px-4 py-3 text-sm text-[var(--color-warning-700)]">
          Todavía no marcaste el punto de partida del negocio.{' '}
          <Link href="/repartos/tarifas" className="font-medium underline">
            Fijalo en Tarifas de reparto
          </Link>{' '}
          — sin él no se puede estimar distancia ni costo.
        </div>
      )}

      {candidates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageSearch className="h-5 w-5" />}
            title="No hay nada por repartir"
            description="Aparecen acá las ventas de los últimos 15 días con datos de entrega y los pedidos online aprobados que todavía no tienen reparto."
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Despachar"
            description="El destino se fija a mano sobre el mapa: las direcciones de barrio no las encuentra ningún buscador."
          />
          <DispatchForm
            candidates={candidates}
            riders={riders}
            origin={settings.origin}
            currency={orgSettings.currency}
            roadFactor={settings.roadFactor}
            customerBaseFee={settings.customerBaseFee}
            customerFeePerKm={settings.customerFeePerKm}
            customerFreeKm={settings.customerFreeKm}
            preselectedId={preselected?.sourceId ?? null}
          />
        </Card>
      )}
    </>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';

import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { deliverySettingsRepository } from '@/lib/repositories/delivery';
import { expenseCategoryRepository } from '@/lib/repositories/documents';
import { organizationRepository, warehouseRepository } from '@/lib/repositories/organization';
import { RatesForm } from './rates-form';

export const metadata: Metadata = { title: 'Tarifas de reparto' };
export const dynamic = 'force-dynamic';

export default async function DeliveryRatesPage() {
  const session = await requirePermission(PERMISSIONS.DELIVERY_MANAGE);

  const [settings, categories, orgSettings, warehouse] = await Promise.all([
    deliverySettingsRepository.get(session.organizationId),
    expenseCategoryRepository.list(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
    // La bodega principal solo se usa para nombrar el punto de partida
    // sugerido; que no exista no debe romper esta pantalla.
    warehouseRepository.getDefault(session.organizationId).catch(() => null),
  ]);

  return (
    <>
      <PageHeader
        title="Tarifas de reparto"
        breadcrumb={
          <Link href="/repartos" className="hover:underline">
            Repartos
          </Link>
        }
        description="Dos precios distintos: lo que le cobrás al cliente por el envío y lo que a vos te cuesta hacerlo. La diferencia es el margen que el módulo te muestra."
      />

      <Card>
        <CardHeader
          title="Configuración"
          description={
            warehouse
              ? `El punto de partida suele ser la bodega principal (“${warehouse.name}”).`
              : 'Marcá el punto de partida: desde ahí se miden todas las distancias.'
          }
        />
        <RatesForm
          settings={settings}
          categories={categories.map((category) => ({ id: category.id, name: category.name }))}
          currency={orgSettings.currency}
        />
      </Card>
    </>
  );
}

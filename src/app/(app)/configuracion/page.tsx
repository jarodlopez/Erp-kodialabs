import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Card, CardHeader, PageHeader, TableWrapper, Td, Th, Tr } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import {
  organizationRepository,
  taxRepository,
  warehouseRepository,
} from '@/lib/repositories/organization';
import { formatRate } from '@/lib/utils';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Configuración' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requirePermission(PERMISSIONS.SETTINGS_VIEW);

  const [organization, settings, taxes, warehouses] = await Promise.all([
    organizationRepository.get(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
    taxRepository.list(session.organizationId),
    warehouseRepository.list(session.organizationId),
  ]);

  if (!organization) notFound();

  const canEdit = session.permissions.includes(PERMISSIONS.SETTINGS_MANAGE);

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Datos de la organización, moneda, impuestos y parámetros de operación."
      />

      <SettingsForm organization={organization} settings={settings} canEdit={canEdit} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Impuestos configurados"
            description="Cada documento conserva la tasa aplicada en su momento."
          />
          <TableWrapper className="min-w-0">
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th align="right">Tasa</Th>
                <Th>Predeterminado</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {taxes.map((tax) => (
                <Tr key={tax.id}>
                  <Td>{tax.name}</Td>
                  <Td align="right">{formatRate(tax.rate)}</Td>
                  <Td>{tax.isDefault ? 'Sí' : 'No'}</Td>
                  <Td>{tax.active ? 'Activo' : 'Inactivo'}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrapper>
        </Card>

        <Card>
          <CardHeader
            title="Bodegas"
            description="El modelo soporta múltiples ubicaciones y transferencias entre ellas."
          />
          <TableWrapper className="min-w-0">
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Código</Th>
                <Th>Principal</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((warehouse) => (
                <Tr key={warehouse.id}>
                  <Td>{warehouse.name}</Td>
                  <Td className="font-mono text-xs">{warehouse.code}</Td>
                  <Td>{warehouse.isDefault ? 'Sí' : 'No'}</Td>
                  <Td>{warehouse.status === 'ACTIVE' ? 'Activa' : 'Inactiva'}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrapper>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Numeración de documentos" />
        <div className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(settings.numbering).map(([key, prefix]) => (
            <div key={key} className="rounded-lg bg-[var(--color-surface-muted)] p-3">
              <p className="text-xs capitalize text-[var(--color-ink-subtle)]">{key}</p>
              <p className="mt-0.5 font-mono text-sm font-medium">{prefix}-000001</p>
            </div>
          ))}
        </div>
        <p className="border-t border-[var(--color-border)] px-5 py-3 text-xs text-[var(--color-ink-subtle)]">
          Los correlativos se generan con contadores transaccionales por organización, por lo que
          nunca se repiten aunque varias personas registren documentos al mismo tiempo.
        </p>
      </Card>
    </>
  );
}

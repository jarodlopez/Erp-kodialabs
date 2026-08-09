import Link from 'next/link';
import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';

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
import { supplierRepository } from '@/lib/repositories/parties';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate } from '@/lib/utils';
import { SupplierManager } from './supplier-manager';

export const metadata: Metadata = { title: 'Proveedores' };
export const dynamic = 'force-dynamic';

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.SUPPLIERS_VIEW);
  const params = await searchParams;

  const [settings, page] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    supplierRepository.list(
      session.organizationId,
      {
        search: params.q ?? null,
        status: (params.estado as 'ACTIVE' | 'INACTIVE' | 'ALL') ?? 'ALL',
        withDebtOnly: params.deuda === '1',
      },
      { cursor: params.cursor ?? null, limit: 25 },
    ),
  ]);

  const currency = settings.currency;
  const canCreate = session.permissions.includes(PERMISSIONS.SUPPLIERS_CREATE);

  return (
    <>
      <PageHeader
        title="Proveedores"
        description="Historial de compras, saldos por pagar y contactos."
        actions={canCreate ? <SupplierManager mode="create" /> : undefined}
      />

      <Card>
        <CardHeader title="Directorio" />
        <FilterBar
          searchPlaceholder="Buscar proveedor por nombre..."
          filters={[
            {
              name: 'estado',
              label: 'Estado',
              options: [
                { value: 'ACTIVE', label: 'Activos' },
                { value: 'INACTIVE', label: 'Inactivos' },
              ],
            },
            { name: 'deuda', label: 'Saldo', options: [{ value: '1', label: 'Con saldo pendiente' }] },
          ]}
        />

        {page.items.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title="Sin proveedores"
            description="Registra proveedores para poder comprar inventario."
            action={canCreate ? <SupplierManager mode="create" /> : undefined}
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Proveedor</Th>
                  <Th>Contacto</Th>
                  <Th align="right">Compras</Th>
                  <Th align="right">Total comprado</Th>
                  <Th align="right">Saldo por pagar</Th>
                  <Th>Última compra</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((supplier) => (
                  <Tr key={supplier.id}>
                    <Td>
                      <Link
                        href={`/proveedores/${supplier.id}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {supplier.name}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {supplier.document ?? 'Sin documento'}
                        {supplier.status === 'INACTIVE' && ' · Inactivo'}
                      </p>
                    </Td>
                    <Td className="text-[var(--color-ink-muted)]">
                      {supplier.contactName ?? supplier.phone ?? supplier.email ?? '—'}
                    </Td>
                    <Td align="right">{supplier.stats.documentCount}</Td>
                    <Td align="right">
                      <Money value={supplier.stats.totalAmount} currency={currency} />
                    </Td>
                    <Td align="right">
                      {supplier.stats.outstandingBalance > 0 ? (
                        <Badge tone="warning">
                          <Money value={supplier.stats.outstandingBalance} currency={currency} />
                        </Badge>
                      ) : (
                        <span className="text-[var(--color-ink-subtle)]">—</span>
                      )}
                    </Td>
                    <Td className="text-[var(--color-ink-subtle)]">
                      {formatDate(supplier.stats.lastDocumentAt)}
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

import Link from 'next/link';
import type { Metadata } from 'next';
import { UsersRound } from 'lucide-react';

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
import { customerRepository } from '@/lib/repositories/parties';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate } from '@/lib/utils';
import { CustomerManager } from './customer-manager';

export const metadata: Metadata = { title: 'Clientes' };
export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const params = await searchParams;

  const [settings, page] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    customerRepository.list(
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
  const canCreate = session.permissions.includes(PERMISSIONS.CUSTOMERS_CREATE);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Historial de compras, saldo pendiente y ticket promedio."
        actions={canCreate ? <CustomerManager mode="create" /> : undefined}
      />

      <Card>
        <CardHeader title="Directorio" />
        <FilterBar
          searchPlaceholder="Buscar cliente por nombre..."
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
            icon={<UsersRound className="h-5 w-5" />}
            title="Sin clientes"
            description="Crea tu primer cliente para registrar ventas a crédito y llevar su historial."
            action={canCreate ? <CustomerManager mode="create" /> : undefined}
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Contacto</Th>
                  <Th align="right">Compras</Th>
                  <Th align="right">Total comprado</Th>
                  <Th align="right">Ticket promedio</Th>
                  <Th align="right">Saldo</Th>
                  <Th>Última compra</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((customer) => {
                  const ticket =
                    customer.stats.documentCount > 0
                      ? Math.round(customer.stats.totalAmount / customer.stats.documentCount)
                      : 0;
                  return (
                    <Tr key={customer.id}>
                      <Td>
                        <Link
                          href={`/clientes/${customer.id}`}
                          className="font-medium text-[var(--color-brand-600)] hover:underline"
                        >
                          {customer.name}
                        </Link>
                        <p className="text-xs text-[var(--color-ink-subtle)]">
                          {customer.document ?? 'Sin documento'}
                          {customer.status === 'INACTIVE' && ' · Inactivo'}
                        </p>
                      </Td>
                      <Td label="Contacto" className="text-[var(--color-ink-muted)]">
                        {customer.phone ?? customer.email ?? '—'}
                      </Td>
                      <Td align="right" label="Compras">{customer.stats.documentCount}</Td>
                      <Td align="right" label="Total comprado">
                        <Money value={customer.stats.totalAmount} currency={currency} />
                      </Td>
                      <Td align="right" label="Ticket prom.">
                        <Money value={ticket} currency={currency} />
                      </Td>
                      <Td align="right" label="Saldo">
                        {customer.stats.outstandingBalance > 0 ? (
                          <Badge tone="warning">
                            <Money value={customer.stats.outstandingBalance} currency={currency} />
                          </Badge>
                        ) : (
                          <span className="text-[var(--color-ink-subtle)]">—</span>
                        )}
                      </Td>
                      <Td label="Última compra" className="text-[var(--color-ink-subtle)]">
                        {formatDate(customer.stats.lastDocumentAt)}
                      </Td>
                    </Tr>
                  );
                })}
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

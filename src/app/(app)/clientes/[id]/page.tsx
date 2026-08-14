import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { DebtStatusBadge, Money, SaleStatusBadge, SummaryTile } from '@/components/domain/indicators';
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
import { saleRepository } from '@/lib/repositories/documents';
import { receivableRepository } from '@/lib/repositories/finance';
import { customerRepository } from '@/lib/repositories/parties';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate } from '@/lib/utils';
import { CustomerManager } from '../customer-manager';

export const metadata: Metadata = { title: 'Detalle de cliente' };
export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const { id } = await params;

  const customer = await customerRepository.get(session.organizationId, id);
  if (!customer) notFound();

  const [settings, sales, receivables] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    saleRepository.byCustomer(session.organizationId, id, 20),
    receivableRepository.byCustomer(session.organizationId, id, 20),
  ]);

  const currency = settings.currency;
  const ticket =
    customer.stats.documentCount > 0
      ? Math.round(customer.stats.totalAmount / customer.stats.documentCount)
      : 0;

  return (
    <>
      <PageHeader
        title={customer.name}
        breadcrumb={
          <Link href="/clientes" className="hover:underline">
            Clientes
          </Link>
        }
        description={customer.document ?? 'Sin documento registrado'}
        actions={
          session.permissions.includes(PERMISSIONS.CUSTOMERS_UPDATE) ? (
            <CustomerManager mode="edit" customer={customer} />
          ) : undefined
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Total comprado"
          value={<Money value={customer.stats.totalAmount} currency={currency} />}
          variant="sun"
        />
        <SummaryTile label="Compras" value={customer.stats.documentCount} variant="plain" />
        <SummaryTile label="Ticket promedio" value={<Money value={ticket} currency={currency} />} variant="plain" />
        <SummaryTile
          label="Saldo pendiente"
          value={<Money value={customer.stats.outstandingBalance} currency={currency} />}
          variant={customer.stats.outstandingBalance > 0 ? 'ember' : 'positive'}
          hint={`Límite: ${new Intl.NumberFormat('es-NI', {
            style: 'currency',
            currency,
          }).format(customer.creditLimit / 100)}`}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Historial de ventas" />
            {sales.length === 0 ? (
              <EmptyState title="Sin ventas" description="Este cliente aún no tiene compras." />
            ) : (
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Número</Th>
                    <Th>Fecha</Th>
                    <Th>Estado</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Pendiente</Th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <Tr key={sale.id}>
                      <Td>
                        <Link
                          href={`/ventas/${sale.id}`}
                          className="font-medium text-[var(--color-brand-600)] hover:underline"
                        >
                          {sale.number}
                        </Link>
                      </Td>
                      <Td>{formatDate(sale.date)}</Td>
                      <Td>
                        <SaleStatusBadge status={sale.status} />
                      </Td>
                      <Td align="right">
                        <Money value={sale.total} currency={currency} />
                      </Td>
                      <Td align="right">
                        <Money value={sale.dueAmount} currency={currency} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrapper>
            )}
          </Card>

          <Card>
            <CardHeader title="Cuentas por cobrar" />
            {receivables.length === 0 ? (
              <EmptyState title="Sin deuda" description="No hay documentos pendientes de cobro." />
            ) : (
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Documento</Th>
                    <Th>Vence</Th>
                    <Th>Estado</Th>
                    <Th align="right">Original</Th>
                    <Th align="right">Pendiente</Th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.map((item) => (
                    <Tr key={item.id}>
                      <Td>{item.referenceNumber}</Td>
                      <Td>{formatDate(item.dueDate)}</Td>
                      <Td>
                        <DebtStatusBadge status={item.status} />
                      </Td>
                      <Td align="right">
                        <Money value={item.originalAmount} currency={currency} />
                      </Td>
                      <Td align="right">
                        <Money value={item.remainingAmount} currency={currency} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrapper>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Ficha" />
          <dl className="space-y-3 p-5 text-sm">
            <Row label="Teléfono" value={customer.phone ?? '—'} />
            <Row label="Correo" value={customer.email ?? '—'} />
            <Row label="Dirección" value={customer.address ?? '—'} />
            <Row label="Días de crédito" value={`${customer.creditDays} días`} />
            <Row
              label="Estado"
              value={
                customer.status === 'ACTIVE' ? (
                  <Badge tone="positive">Activo</Badge>
                ) : (
                  <Badge tone="neutral">Inactivo</Badge>
                )
              }
            />
            <Row label="Última compra" value={formatDate(customer.stats.lastDocumentAt)} />
          </dl>
          {customer.notes && (
            <p className="border-t border-[var(--color-border)] px-5 py-3 text-sm text-[var(--color-ink-muted)]">
              {customer.notes}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[var(--color-ink-subtle)]">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium">{value}</dd>
    </div>
  );
}

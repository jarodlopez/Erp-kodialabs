import Link from 'next/link';
import type { Metadata } from 'next';
import { Coins } from 'lucide-react';

import { DebtStatusBadge, KpiCard, Money } from '@/components/domain/indicators';
import { BarList } from '@/components/ui/charts';
import { CursorPagination, FilterBar } from '@/components/ui/data-table';
import {
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
import { accountRepository, receivableRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { buildAgingReport } from '@/lib/services/reports';
import { formatDate } from '@/lib/utils';
import { RECEIVABLE_STATUS_LABELS } from '@/types/finance';
import { CollectDialog } from './collect-dialog';

export const metadata: Metadata = { title: 'Cuentas por cobrar' };
export const dynamic = 'force-dynamic';

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.RECEIVABLES_VIEW);
  const params = await searchParams;

  const [settings, accounts, page, outstanding, aging] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    accountRepository.list(session.organizationId),
    receivableRepository.list(
      session.organizationId,
      { status: params.status ?? params.estado ?? null },
      { cursor: params.cursor ?? null, limit: 25 },
    ),
    receivableRepository.outstanding(session.organizationId),
    buildAgingReport(session.organizationId, 'receivable'),
  ]);

  const currency = settings.currency;
  const canCollect = session.permissions.includes(PERMISSIONS.RECEIVABLES_COLLECT);

  // El primer tramo del reporte de antigüedad es «Por vencer»; el resto ya venció.
  const [upcoming, ...lateBuckets] = aging.buckets;
  const overdueAmount = lateBuckets.reduce((acc, bucket) => acc + bucket.amount, 0);
  const overdueCount = lateBuckets.reduce((acc, bucket) => acc + bucket.count, 0);

  return (
    <>
      <PageHeader
        title="Cuentas por cobrar"
        description="Saldos pendientes de clientes, generados automáticamente por las ventas a crédito."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Total por cobrar"
          value={<Money value={aging.total} currency={currency} />}
          hint={`${outstanding.length} documento(s)`}
        />
        <KpiCard
          label="Vencido"
          value={<Money value={overdueAmount} currency={currency} />}
          tone="negative"
          hint={`${overdueCount} documento(s)`}
        />
        <KpiCard
          label="Por vencer"
          value={<Money value={upcoming?.amount ?? 0} currency={currency} />}
          tone="positive"
          hint={`${upcoming?.count ?? 0} documento(s)`}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Documentos" />
          <FilterBar
            searchPlaceholder="Filtra por estado"
            filters={[
              {
                name: 'status',
                label: 'Todos los estados',
                options: Object.entries(RECEIVABLE_STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              },
            ]}
          />

          {page.items.length === 0 ? (
            <EmptyState
              icon={<Coins className="h-5 w-5" />}
              title="Sin cuentas por cobrar"
              description="Cuando registres una venta a crédito aparecerá aquí automáticamente."
            />
          ) : (
            <>
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Documento</Th>
                    <Th>Cliente</Th>
                    <Th>Vence</Th>
                    <Th>Estado</Th>
                    <Th align="right">Original</Th>
                    <Th align="right">Pendiente</Th>
                    {canCollect && <Th align="right">Acción</Th>}
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((item) => (
                    <Tr key={item.id}>
                      <Td>
                        <Link
                          href={`/ventas/${item.referenceId}`}
                          className="font-medium text-[var(--color-brand-600)] hover:underline"
                        >
                          {item.referenceNumber}
                        </Link>
                        <p className="text-xs text-[var(--color-ink-subtle)]">
                          Emitido {formatDate(item.issueDate)}
                        </p>
                      </Td>
                      <Td className="max-w-[180px] truncate">{item.customerName}</Td>
                      <Td>{formatDate(item.dueDate)}</Td>
                      <Td>
                        <DebtStatusBadge status={item.status} />
                      </Td>
                      <Td align="right">
                        <Money value={item.originalAmount} currency={currency} />
                      </Td>
                      <Td align="right">
                        <span className="font-medium">
                          <Money value={item.remainingAmount} currency={currency} />
                        </span>
                      </Td>
                      {canCollect && (
                        <Td align="right">
                          {item.remainingAmount > 0 && item.status !== 'CANCELLED' && (
                            <CollectDialog
                              kind="receivable"
                              documentId={item.id}
                              reference={item.referenceNumber}
                              partyName={item.customerName}
                              remainingAmount={item.remainingAmount}
                              accounts={accounts}
                              currency={currency}
                            />
                          )}
                        </Td>
                      )}
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

        <Card className="h-fit">
          <CardHeader title="Antigüedad de saldos" />
          <div className="p-5">
            <BarList
              currency={currency}
              items={aging.buckets.map((bucket) => ({
                label: bucket.label,
                value: bucket.amount,
                hint: `${bucket.count} documento(s)`,
              }))}
              emptyMessage="No hay saldos pendientes."
            />
          </div>
        </Card>
      </div>
    </>
  );
}

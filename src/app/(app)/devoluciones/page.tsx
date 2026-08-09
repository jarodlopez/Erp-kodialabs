import Link from 'next/link';
import type { Metadata } from 'next';
import { RotateCcw } from 'lucide-react';

import { Money } from '@/components/domain/indicators';
import { CursorPagination, DateRangeFilter, FilterBar } from '@/components/ui/data-table';
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
import { returnRepository } from '@/lib/repositories/documents';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate } from '@/lib/utils';
import { RETURN_TYPE_LABELS } from '@/types/returns';

export const metadata: Metadata = { title: 'Devoluciones' };
export const dynamic = 'force-dynamic';

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.SALES_VIEW);
  const params = await searchParams;

  const [settings, page] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    returnRepository.list(
      session.organizationId,
      { status: params.tipo ?? null, from: params.from ?? null, to: params.to ?? null },
      { cursor: params.cursor ?? null, limit: 25 },
    ),
  ]);

  const currency = settings.currency;

  return (
    <>
      <PageHeader
        title="Devoluciones"
        description="Documentos de devolución de ventas y compras. La operación original nunca se elimina."
      />

      <Card>
        <CardHeader title="Historial" />
        <FilterBar
          searchPlaceholder="Filtra por tipo y fechas"
          filters={[
            {
              name: 'tipo',
              label: 'Todos los tipos',
              options: Object.entries(RETURN_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            },
          ]}
        >
          <DateRangeFilter />
        </FilterBar>

        {page.items.length === 0 ? (
          <EmptyState
            icon={<RotateCcw className="h-5 w-5" />}
            title="Sin devoluciones"
            description="Registra devoluciones desde el detalle de una venta o de una compra."
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Número</Th>
                  <Th>Tipo</Th>
                  <Th>Documento</Th>
                  <Th>Contraparte</Th>
                  <Th>Reintegro</Th>
                  <Th>Motivo</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((doc) => (
                  <Tr key={doc.id}>
                    <Td>
                      <span className="font-medium">{doc.number}</span>
                      <p className="text-xs text-[var(--color-ink-subtle)]">{formatDate(doc.date)}</p>
                    </Td>
                    <Td>
                      <Badge tone={doc.type === 'SALE_RETURN' ? 'warning' : 'brand'}>
                        {RETURN_TYPE_LABELS[doc.type]}
                      </Badge>
                    </Td>
                    <Td>
                      <Link
                        href={
                          doc.referenceType === 'SALE'
                            ? `/ventas/${doc.referenceId}`
                            : `/compras/${doc.referenceId}`
                        }
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {doc.referenceNumber}
                      </Link>
                    </Td>
                    <Td className="max-w-[160px] truncate">{doc.partyName}</Td>
                    <Td className="text-[var(--color-ink-muted)]">
                      {doc.refundMode === 'CASH_REFUND' ? 'Dinero' : 'Nota de crédito'}
                    </Td>
                    <Td className="max-w-[200px] truncate text-[var(--color-ink-muted)]">
                      {doc.reason}
                    </Td>
                    <Td align="right">
                      <Money value={doc.total} currency={currency} />
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

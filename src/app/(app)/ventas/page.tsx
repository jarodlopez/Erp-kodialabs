import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus, ShoppingCart } from 'lucide-react';

import { Money, PaymentStatusBadge, SaleStatusBadge } from '@/components/domain/indicators';
import { CursorPagination, DateRangeFilter, FilterBar } from '@/components/ui/data-table';
import {
  Button,
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
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate } from '@/lib/utils';
import { SALE_STATUS_LABELS } from '@/types/sales';

export const metadata: Metadata = { title: 'Ventas' };
export const dynamic = 'force-dynamic';

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.SALES_VIEW);
  const params = await searchParams;

  const [settings, page] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    saleRepository.list(
      session.organizationId,
      {
        status: params.estado ?? null,
        from: params.from ?? null,
        to: params.to ?? null,
        number: params.q ? params.q.toUpperCase() : null,
      },
      { cursor: params.cursor ?? null, limit: 25 },
    ),
  ]);

  const currency = settings.currency;
  const totals = page.items.reduce(
    (acc, sale) => {
      if (sale.status === 'CANCELLED') return acc;
      acc.total += sale.total;
      acc.due += sale.dueAmount;
      return acc;
    },
    { total: 0, due: 0 },
  );

  return (
    <>
      <PageHeader
        title="Ventas"
        description="Documentos de venta con su estado de cobro e inventario descontado."
        actions={
          session.permissions.includes(PERMISSIONS.SALES_CREATE) ? (
            <Link href="/ventas/nueva">
              <Button>
                <Plus className="h-4 w-4" /> Nueva venta
              </Button>
            </Link>
          ) : undefined
        }
      />

      <Card>
        <CardHeader
          title="Documentos"
          description={`Página actual: ${new Intl.NumberFormat('es-NI', {
            style: 'currency',
            currency,
          }).format(totals.total / 100)} facturado · ${new Intl.NumberFormat('es-NI', {
            style: 'currency',
            currency,
          }).format(totals.due / 100)} por cobrar`}
        />

        <FilterBar
          searchPlaceholder="Buscar por número (ej. SALE-000001)"
          filters={[
            {
              name: 'estado',
              label: 'Todos los estados',
              options: Object.entries(SALE_STATUS_LABELS).map(([value, label]) => ({
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
            icon={<ShoppingCart className="h-5 w-5" />}
            title="Sin ventas registradas"
            description="Cuando registres una venta aparecerá aquí con su estado de cobro."
            action={
              session.permissions.includes(PERMISSIONS.SALES_CREATE) ? (
                <Link href="/ventas/nueva">
                  <Button size="sm">
                    <Plus className="h-4 w-4" /> Nueva venta
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Número</Th>
                  <Th>Cliente</Th>
                  <Th>Vendedor</Th>
                  <Th>Estado</Th>
                  <Th>Pago</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Pendiente</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((sale) => (
                  <Tr key={sale.id}>
                    <Td>
                      <Link
                        href={`/ventas/${sale.id}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {sale.number}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {formatDate(sale.date)} · {sale.items.length} ítem(s)
                      </p>
                    </Td>
                    <Td className="max-w-[180px] truncate">{sale.customerName}</Td>
                    <Td className="max-w-[140px] truncate text-[var(--color-ink-muted)]">
                      {sale.sellerName}
                    </Td>
                    <Td>
                      <SaleStatusBadge status={sale.status} />
                    </Td>
                    <Td>
                      <PaymentStatusBadge status={sale.paymentStatus} />
                    </Td>
                    <Td align="right">
                      <Money value={sale.total} currency={currency} />
                    </Td>
                    <Td align="right">
                      {sale.dueAmount > 0 ? (
                        <span className="font-medium text-[var(--color-warning-700)]">
                          <Money value={sale.dueAmount} currency={currency} />
                        </span>
                      ) : (
                        <span className="text-[var(--color-ink-subtle)]">—</span>
                      )}
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

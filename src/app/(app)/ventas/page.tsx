import Link from 'next/link';
import type { Metadata } from 'next';
import { Coins, Plus, ShoppingCart, Wallet } from 'lucide-react';

import { Money, PaymentStatusBadge, SaleStatusBadge, SummaryTile } from '@/components/domain/indicators';
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
import { ACTIVE_SALE_STATUSES } from '@/lib/state-machines';
import { formatDate, startOfMonthInput, toDateInput } from '@/lib/utils';
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

  // Rango del resumen: el del filtro de fechas si está, o el mes en curso.
  const periodFrom = params.from ?? startOfMonthInput();
  const periodTo = params.to ?? toDateInput();

  const [settings, page, periodSales] = await Promise.all([
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
    saleRepository.inRange(session.organizationId, periodFrom, periodTo, ACTIVE_SALE_STATUSES),
  ]);

  const currency = settings.currency;

  // Totales del período (ventas activas del rango), no de la página.
  const period = periodSales.reduce(
    (acc, sale) => {
      acc.total += sale.total;
      acc.due += sale.dueAmount;
      return acc;
    },
    { total: 0, due: 0 },
  );
  const collected = period.total - period.due;

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

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <SummaryTile
          variant="sun"
          label="Facturado"
          value={<Money value={period.total} currency={currency} />}
          hint={`${periodSales.length} venta(s) · ${formatDate(periodFrom)}–${formatDate(periodTo)}`}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <SummaryTile
          variant="positive"
          label="Cobrado"
          value={<Money value={collected} currency={currency} />}
          icon={<Wallet className="h-4 w-4" />}
        />
        <SummaryTile
          label="Por cobrar"
          value={<Money value={period.due} currency={currency} />}
          icon={<Coins className="h-4 w-4" />}
        />
      </section>

      <Card>
        <CardHeader
          title="Documentos"
          description="Historial de ventas. Usa el rango de fechas para acotar el período."
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
                    <Td label="Cliente" className="max-w-[180px] truncate">{sale.customerName}</Td>
                    <Td label="Vendedor" className="max-w-[140px] truncate text-[var(--color-ink-muted)]">
                      {sale.sellerName}
                    </Td>
                    <Td label="Estado">
                      <SaleStatusBadge status={sale.status} />
                    </Td>
                    <Td label="Pago">
                      <PaymentStatusBadge status={sale.paymentStatus} />
                    </Td>
                    <Td align="right" label="Total">
                      <Money value={sale.total} currency={currency} />
                    </Td>
                    <Td align="right" label="Pendiente">
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

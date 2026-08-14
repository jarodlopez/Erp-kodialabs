import Link from 'next/link';
import type { Metadata } from 'next';
import { Landmark, Plus, Truck, Wallet } from 'lucide-react';

import { Money, PaymentStatusBadge, PurchaseStatusBadge, SummaryTile } from '@/components/domain/indicators';
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
import { purchaseRepository } from '@/lib/repositories/documents';
import { organizationRepository } from '@/lib/repositories/organization';
import { ACTIVE_PURCHASE_STATUSES } from '@/lib/state-machines';
import { formatDate, startOfMonthInput, toDateInput } from '@/lib/utils';
import { PURCHASE_STATUS_LABELS } from '@/types/purchases';

export const metadata: Metadata = { title: 'Compras' };
export const dynamic = 'force-dynamic';

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.PURCHASES_VIEW);
  const params = await searchParams;

  // Rango del resumen: el del filtro de fechas si está, o el mes en curso.
  const periodFrom = params.from ?? startOfMonthInput();
  const periodTo = params.to ?? toDateInput();

  const [settings, page, periodPurchases] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    purchaseRepository.list(
      session.organizationId,
      { status: params.estado ?? null, from: params.from ?? null, to: params.to ?? null },
      { cursor: params.cursor ?? null, limit: 25 },
    ),
    purchaseRepository.inRange(
      session.organizationId,
      periodFrom,
      periodTo,
      ACTIVE_PURCHASE_STATUSES,
    ),
  ]);

  const currency = settings.currency;

  // Totales del período (compras activas del rango), no de la página.
  const period = periodPurchases.reduce(
    (acc, purchase) => {
      acc.total += purchase.total;
      acc.due += purchase.dueAmount;
      return acc;
    },
    { total: 0, due: 0 },
  );
  const paid = period.total - period.due;

  return (
    <>
      <PageHeader
        title="Compras"
        description="Órdenes de compra, recepción de inventario y pagos a proveedores."
        actions={
          session.permissions.includes(PERMISSIONS.PURCHASES_CREATE) ? (
            <Link href="/compras/nueva">
              <Button>
                <Plus className="h-4 w-4" /> Nueva compra
              </Button>
            </Link>
          ) : undefined
        }
      />

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <SummaryTile
          variant="ember"
          label="Comprado"
          value={<Money value={period.total} currency={currency} />}
          hint={`${periodPurchases.length} compra(s) · ${formatDate(periodFrom)}–${formatDate(periodTo)}`}
          icon={<Truck className="h-4 w-4" />}
        />
        <SummaryTile
          variant="positive"
          label="Pagado"
          value={<Money value={paid} currency={currency} />}
          icon={<Wallet className="h-4 w-4" />}
        />
        <SummaryTile
          label="Por pagar"
          value={<Money value={period.due} currency={currency} />}
          icon={<Landmark className="h-4 w-4" />}
        />
      </section>

      <Card>
        <CardHeader
          title="Documentos"
          description="Historial de compras. Usa el rango de fechas para acotar el período."
        />
        <FilterBar
          searchPlaceholder="Buscar por proveedor no disponible; usa filtros"
          filters={[
            {
              name: 'estado',
              label: 'Todos los estados',
              options: Object.entries(PURCHASE_STATUS_LABELS).map(([value, label]) => ({
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
            icon={<Truck className="h-5 w-5" />}
            title="Sin compras registradas"
            description="Registra una compra para ingresar inventario y actualizar costos."
            action={
              session.permissions.includes(PERMISSIONS.PURCHASES_CREATE) ? (
                <Link href="/compras/nueva">
                  <Button size="sm">
                    <Plus className="h-4 w-4" /> Nueva compra
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
                  <Th>Proveedor</Th>
                  <Th>Factura</Th>
                  <Th>Estado</Th>
                  <Th>Pago</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Pendiente</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((purchase) => (
                  <Tr key={purchase.id}>
                    <Td>
                      <Link
                        href={`/compras/${purchase.id}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {purchase.number}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {formatDate(purchase.date)} · {purchase.items.length} ítem(s)
                      </p>
                    </Td>
                    <Td label="Proveedor" className="max-w-[180px] truncate">{purchase.supplierName}</Td>
                    <Td label="Factura" className="text-[var(--color-ink-muted)]">
                      {purchase.invoiceNumber ?? '—'}
                    </Td>
                    <Td label="Estado">
                      <PurchaseStatusBadge status={purchase.status} />
                    </Td>
                    <Td label="Pago">
                      <PaymentStatusBadge status={purchase.paymentStatus} />
                    </Td>
                    <Td align="right" label="Total">
                      <Money value={purchase.total} currency={currency} />
                    </Td>
                    <Td align="right" label="Pendiente">
                      {purchase.dueAmount > 0 ? (
                        <span className="font-medium text-[var(--color-warning-700)]">
                          <Money value={purchase.dueAmount} currency={currency} />
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

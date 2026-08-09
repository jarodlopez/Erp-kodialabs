import Link from 'next/link';
import type { Metadata } from 'next';
import {
  AlertTriangle,
  Boxes,
  Coins,
  Landmark,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { KpiCard, Money, SaleStatusBadge } from '@/components/domain/indicators';
import { BarList, DonutChart, LineChart } from '@/components/ui/charts';
import {
  Badge,
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
import { organizationRepository } from '@/lib/repositories/organization';
import { buildDashboard } from '@/lib/services/dashboard';
import { formatDate, startOfMonthInput, toDateInput } from '@/lib/utils';
import { DashboardRangePicker } from './dashboard-range';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
  const params = await searchParams;

  const from = params.from ?? startOfMonthInput();
  const to = params.to ?? toDateInput();

  const [settings, data] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    buildDashboard(session.organizationId, { from, to }),
  ]);

  const currency = settings.currency;
  const { kpis } = data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Resultados del ${formatDate(from)} al ${formatDate(to)}.`}
        actions={<DashboardRangePicker from={from} to={to} />}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Ventas del periodo"
          value={<Money value={kpis.sales} currency={currency} />}
          hint={`${kpis.salesCount} venta(s)`}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <KpiCard
          label="Utilidad bruta"
          value={<Money value={kpis.grossProfit} currency={currency} />}
          tone={kpis.grossProfit >= 0 ? 'positive' : 'negative'}
          hint="Ventas netas menos costo de ventas"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Gastos"
          value={<Money value={kpis.expenses} currency={currency} />}
          icon={<Receipt className="h-4 w-4" />}
        />
        <KpiCard
          label="Utilidad neta"
          value={<Money value={kpis.netProfit} currency={currency} />}
          tone={kpis.netProfit >= 0 ? 'positive' : 'negative'}
          hint="Después de gastos operativos"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </section>

      <section className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Caja"
          value={<Money value={kpis.cash} currency={currency} />}
          icon={<Wallet className="h-4 w-4" />}
        />
        <KpiCard
          label="Bancos y otros"
          value={<Money value={kpis.bank} currency={currency} />}
          icon={<Landmark className="h-4 w-4" />}
        />
        <KpiCard
          label="Cuentas por cobrar"
          value={<Money value={kpis.receivables} currency={currency} />}
          icon={<Coins className="h-4 w-4" />}
        />
        <KpiCard
          label="Cuentas por pagar"
          value={<Money value={kpis.payables} currency={currency} />}
          icon={<Landmark className="h-4 w-4" />}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Ingresos, gastos y utilidad"
            description="Serie diaria del periodo seleccionado."
          />
          <div className="p-5">
            <LineChart
              currency={currency}
              seriesNames={['Ventas', 'Gastos', 'Utilidad']}
              points={data.series.map((point) => ({
                label: formatDate(point.date),
                values: [point.sales, point.expenses, point.profit],
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Alertas" description="Situaciones que requieren atención." />
          <div className="p-5">
            {data.alerts.length === 0 ? (
              <EmptyState
                title="Todo en orden"
                description="No hay stock crítico ni documentos vencidos."
              />
            ) : (
              <ul className="space-y-2.5">
                {data.alerts.map((alert, index) => (
                  <li key={`${alert.kind}-${index}`}>
                    <Link
                      href={alert.href}
                      className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-[var(--color-canvas)]"
                    >
                      <AlertTriangle
                        className={
                          alert.kind === 'OUT_OF_STOCK' ||
                          alert.kind === 'OVERDUE_RECEIVABLE' ||
                          alert.kind === 'OVERDUE_PAYABLE'
                            ? 'mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger-500)]'
                            : 'mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning-500)]'
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--color-ink)]">{alert.label}</p>
                        <p className="truncate text-xs text-[var(--color-ink-subtle)]">
                          {alert.detail}
                        </p>
                      </div>
                      {alert.amount !== undefined && (
                        <Money
                          value={alert.amount}
                          currency={currency}
                          className="shrink-0 text-sm font-medium"
                        />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Productos más vendidos" />
          <div className="p-5">
            <BarList
              currency={currency}
              items={data.topProducts.map((p) => ({
                label: p.label,
                value: p.revenue,
                hint: `${(p.units / 1000).toLocaleString('es-NI')} unidades`,
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Ventas por categoría" />
          <div className="p-5">
            <DonutChart
              currency={currency}
              segments={data.topCategories.map((c) => ({ label: c.label, value: c.revenue }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Saldos por cuenta"
            actions={
              <Link href="/caja-y-bancos">
                <Button variant="ghost" size="sm">
                  Ver todo
                </Button>
              </Link>
            }
          />
          <div className="p-5">
            {data.accounts.length === 0 ? (
              <EmptyState
                title="Sin cuentas financieras"
                description="Crea una caja o cuenta bancaria para registrar movimientos."
                action={
                  <Link href="/caja-y-bancos">
                    <Button size="sm">Crear cuenta</Button>
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {data.accounts.map((account) => (
                  <li key={account.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--color-ink)]">{account.name}</p>
                      <p className="text-xs text-[var(--color-ink-subtle)]">{account.type}</p>
                    </div>
                    <Money
                      value={account.balance}
                      currency={currency}
                      className="text-sm font-medium"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Ventas recientes"
            actions={
              <Link href="/ventas">
                <Button variant="ghost" size="sm">
                  Ver todas
                </Button>
              </Link>
            }
          />
          {data.recentSales.length === 0 ? (
            <EmptyState
              title="Aún no hay ventas"
              description="Registra tu primera venta para ver los indicadores."
              action={
                <Link href="/ventas/nueva">
                  <Button size="sm">Nueva venta</Button>
                </Link>
              }
            />
          ) : (
            <TableWrapper className="min-w-0">
              <thead>
                <tr>
                  <Th>Número</Th>
                  <Th>Cliente</Th>
                  <Th>Estado</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((sale) => (
                  <Tr key={sale.id}>
                    <Td>
                      <Link
                        href={`/ventas/${sale.id}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {sale.number}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {formatDate(sale.date)}
                      </p>
                    </Td>
                    <Td className="max-w-[160px] truncate">{sale.customerName}</Td>
                    <Td>
                      <SaleStatusBadge status={sale.status} />
                    </Td>
                    <Td align="right">
                      <Money value={sale.total} currency={currency} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrapper>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Inventario crítico"
            description="Productos en o por debajo del mínimo."
            actions={
              <Link href="/inventario?lowStock=1">
                <Button variant="ghost" size="sm">
                  Ver todo
                </Button>
              </Link>
            }
          />
          {data.lowStock.length === 0 ? (
            <EmptyState
              title="Inventario saludable"
              description="Ningún producto está por debajo de su stock mínimo."
              icon={<Boxes className="h-5 w-5" />}
            />
          ) : (
            <TableWrapper className="min-w-0">
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th align="right">Existencias</Th>
                  <Th align="right">Mínimo</Th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((product) => (
                  <Tr key={product.id}>
                    <Td>
                      <Link
                        href={`/inventario/${product.id}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-subtle)]">{product.sku}</p>
                    </Td>
                    <Td align="right">
                      <Badge tone={product.stock <= 0 ? 'danger' : 'warning'}>
                        {(product.stock / 1000).toLocaleString('es-NI')}
                      </Badge>
                    </Td>
                    <Td align="right">{(product.minimumStock / 1000).toLocaleString('es-NI')}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrapper>
          )}
        </Card>
      </section>

      <section className="mt-4">
        <Card>
          <CardHeader
            title="Resumen patrimonial"
            description="Estado actual del capital de trabajo."
          />
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryRow
              label="Valor del inventario (al costo)"
              value={kpis.inventoryValue}
              currency={currency}
            />
            <SummaryRow label="Efectivo disponible" value={kpis.cash + kpis.bank} currency={currency} />
            <SummaryRow label="Por cobrar" value={kpis.receivables} currency={currency} />
            <SummaryRow label="Por pagar" value={-kpis.payables} currency={currency} signed />
          </div>
        </Card>
      </section>
    </>
  );
}

function SummaryRow({
  label,
  value,
  currency,
  signed = false,
}: {
  label: string;
  value: number;
  currency: string;
  signed?: boolean;
}) {
  return (
    <div className="rounded-lg bg-[var(--color-surface-muted)] p-4">
      <p className="text-xs text-[var(--color-ink-subtle)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">
        <Money value={value} currency={currency} signed={signed} />
      </p>
    </div>
  );
}


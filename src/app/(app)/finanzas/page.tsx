import type { Metadata } from 'next';

import { Money, SummaryTile } from '@/components/domain/indicators';
import { BarList, LineChart } from '@/components/ui/charts';
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
import { accountRepository, ledgerRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { buildCashFlow, buildDailySeries, buildIncomeStatement } from '@/lib/services/reports';
import { formatDate, formatRate, startOfMonthInput, toDateInput } from '@/lib/utils';
import { TRANSACTION_TYPE_LABELS } from '@/types/finance';

export const metadata: Metadata = { title: 'Finanzas' };
export const dynamic = 'force-dynamic';

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const params = await searchParams;

  const from = params.from ?? startOfMonthInput();
  const to = params.to ?? toDateInput();
  const range = { from, to };

  const [settings, accounts, income, cashFlow, series, ledger] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    accountRepository.list(session.organizationId),
    buildIncomeStatement(session.organizationId, range),
    buildCashFlow(session.organizationId, range),
    buildDailySeries(session.organizationId, range),
    ledgerRepository.list(
      session.organizationId,
      {
        from,
        to,
        accountId: params.cuenta ?? null,
        direction: (params.direccion as 'IN' | 'OUT') ?? null,
      },
      { cursor: params.cursor ?? null, limit: 30 },
    ),
  ]);

  const currency = settings.currency;

  return (
    <>
      <PageHeader
        title="Finanzas"
        description={`Estado de resultados y flujo de caja del ${formatDate(from)} al ${formatDate(to)}.`}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <span className="text-sm font-medium text-[var(--color-ink-muted)]">Periodo</span>
          <DateRangeFilter />
        </div>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Ingresos netos"
          value={<Money value={income.revenue} currency={currency} />}
          variant="sun"
        />
        <SummaryTile
          label="Costo de ventas"
          value={<Money value={income.costOfGoodsSold} currency={currency} />}
          variant="ember"
        />
        <SummaryTile
          label="Utilidad bruta"
          value={<Money value={income.grossProfit} currency={currency} />}
          variant={income.grossProfit >= 0 ? 'positive' : 'danger'}
          hint={`Margen ${formatRate(income.grossMarginRate)}`}
        />
        <SummaryTile
          label="Utilidad neta"
          value={<Money value={income.netProfit} currency={currency} />}
          variant={income.netProfit >= 0 ? 'positive' : 'danger'}
          hint={`Margen ${formatRate(income.netMarginRate)}`}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Evolución diaria" />
          <div className="p-5">
            <LineChart
              currency={currency}
              seriesNames={['Ventas', 'Gastos', 'Utilidad']}
              points={series.map((point) => ({
                label: formatDate(point.date),
                values: [point.sales, point.expenses, point.profit],
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Estado de resultados" />
          <dl className="space-y-2.5 p-5 text-sm">
            <Line label="Ingresos" value={income.revenue} currency={currency} />
            <Line label="(−) Costo de ventas" value={-income.costOfGoodsSold} currency={currency} />
            <div className="border-t border-[var(--color-border)] pt-2">
              <Line label="Utilidad bruta" value={income.grossProfit} currency={currency} strong />
            </div>
            <Line
              label="(−) Gastos operativos"
              value={-income.operatingExpenses}
              currency={currency}
            />
            <div className="border-t border-[var(--color-border)] pt-2">
              <Line label="Utilidad neta" value={income.netProfit} currency={currency} strong />
            </div>
          </dl>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Flujo de caja" description="Transferencias internas excluidas." />
          <dl className="space-y-2.5 p-5 text-sm">
            <Line label="Saldo inicial" value={cashFlow.openingBalance} currency={currency} />
            <Line label="(+) Entradas" value={cashFlow.inflows} currency={currency} />
            <Line label="(−) Salidas" value={-cashFlow.outflows} currency={currency} />
            <div className="border-t border-[var(--color-border)] pt-2">
              <Line label="Saldo final" value={cashFlow.closingBalance} currency={currency} strong />
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Gastos por categoría" />
          <div className="p-5">
            <BarList
              currency={currency}
              items={income.expensesByCategory.map((row) => ({
                label: row.categoryName,
                value: row.amount,
              }))}
              emptyMessage="Sin gastos en el periodo."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Movimiento por cuenta" />
          <div className="p-5">
            <BarList
              currency={currency}
              items={cashFlow.byAccount.map((row) => ({
                label: row.accountName,
                value: row.balance,
                hint: `Entradas ${(row.inflows / 100).toLocaleString('es-NI')} · Salidas ${(
                  row.outflows / 100
                ).toLocaleString('es-NI')}`,
              }))}
              emptyMessage="Sin cuentas registradas."
            />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Libro mayor"
          description="Fuente única de verdad de todos los movimientos de dinero."
        />
        <FilterBar
          searchPlaceholder="Filtra por cuenta y dirección"
          filters={[
            {
              name: 'cuenta',
              label: 'Todas las cuentas',
              options: accounts.map((a) => ({ value: a.id, label: a.name })),
            },
            {
              name: 'direccion',
              label: 'Dirección',
              options: [
                { value: 'IN', label: 'Entradas' },
                { value: 'OUT', label: 'Salidas' },
              ],
            },
          ]}
        >
          <DateRangeFilter />
        </FilterBar>

        {ledger.items.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="No hay asientos financieros en el periodo seleccionado."
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Concepto</Th>
                  <Th>Tipo</Th>
                  <Th>Cuenta</Th>
                  <Th align="right">Importe</Th>
                  <Th align="right">Saldo después</Th>
                </tr>
              </thead>
              <tbody>
                {ledger.items.map((movement) => (
                  <Tr key={movement.id}>
                    <Td>
                      <span className="text-xs">{formatDate(movement.date)}</span>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {movement.createdByName}
                      </p>
                    </Td>
                    <Td className="max-w-[260px]">
                      <p className="truncate">{movement.description}</p>
                      {movement.referenceNumber && (
                        <p className="text-xs text-[var(--color-ink-subtle)]">
                          {movement.referenceNumber}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={movement.direction === 'IN' ? 'positive' : 'warning'}>
                        {TRANSACTION_TYPE_LABELS[movement.type]}
                      </Badge>
                    </Td>
                    <Td className="text-[var(--color-ink-muted)]">{movement.accountName}</Td>
                    <Td align="right">
                      <span
                        className={
                          movement.direction === 'IN'
                            ? 'font-medium text-[var(--color-positive-700)]'
                            : 'font-medium text-[var(--color-danger-700)]'
                        }
                      >
                        {movement.direction === 'IN' ? '+' : '−'}
                        <Money value={movement.amount} currency={currency} />
                      </span>
                    </Td>
                    <Td align="right">
                      <Money value={movement.balanceAfter} currency={currency} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrapper>

            <CursorPagination
              nextCursor={ledger.nextCursor}
              hasMore={ledger.hasMore}
              count={ledger.items.length}
            />
          </>
        )}
      </Card>
    </>
  );
}

function Line({
  label,
  value,
  currency,
  strong = false,
}: {
  label: string;
  value: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? 'font-semibold' : 'text-[var(--color-ink-subtle)]'}>{label}</dt>
      <dd className={strong ? 'text-base font-semibold' : ''}>
        <Money value={value} currency={currency} />
      </dd>
    </div>
  );
}

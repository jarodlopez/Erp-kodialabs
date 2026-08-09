import type { Metadata } from 'next';

import { KpiCard, Money } from '@/components/domain/indicators';
import { BarList } from '@/components/ui/charts';
import { DateRangeFilter } from '@/components/ui/data-table';
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
import { organizationRepository } from '@/lib/repositories/organization';
import {
  buildAgingReport,
  buildIncomeStatement,
  buildPurchaseReport,
  buildRotationReport,
  buildSalesReport,
  buildStockValuation,
} from '@/lib/services/reports';
import { formatDate, formatRate, startOfMonthInput, toDateInput } from '@/lib/utils';
import { ReportTabs } from './report-tabs';
import { ExportMenu } from './export-menu';

export const metadata: Metadata = { title: 'Reportes' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'ventas', label: 'Ventas' },
  { key: 'productos', label: 'Productos' },
  { key: 'compras', label: 'Compras' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'finanzas', label: 'Finanzas' },
] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const params = await searchParams;

  const from = params.from ?? startOfMonthInput();
  const to = params.to ?? toDateInput();
  const tab = (params.tab ?? 'ventas') as (typeof TABS)[number]['key'];
  const range = { from, to };

  const settings = await organizationRepository.getSettings(session.organizationId);
  const currency = settings.currency;
  const canExport = session.permissions.includes(PERMISSIONS.REPORTS_EXPORT);

  return (
    <>
      <PageHeader
        title="Centro de reportes"
        description={`Información del ${formatDate(from)} al ${formatDate(to)}, calculada sobre los documentos registrados.`}
        actions={canExport ? <ExportMenu from={from} to={to} tab={tab} /> : undefined}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <ReportTabs tabs={TABS} active={tab} />
          <DateRangeFilter />
        </div>
      </Card>

      {tab === 'ventas' && <SalesReports organizationId={session.organizationId} range={range} currency={currency} />}
      {tab === 'productos' && (
        <ProductReports organizationId={session.organizationId} range={range} currency={currency} />
      )}
      {tab === 'compras' && (
        <PurchaseReports organizationId={session.organizationId} range={range} currency={currency} />
      )}
      {tab === 'inventario' && (
        <InventoryReports organizationId={session.organizationId} range={range} currency={currency} />
      )}
      {tab === 'finanzas' && (
        <FinanceReports organizationId={session.organizationId} range={range} currency={currency} />
      )}
    </>
  );
}

interface SectionProps {
  organizationId: string;
  range: { from: string; to: string };
  currency: string;
}

async function SalesReports({ organizationId, range, currency }: SectionProps) {
  const [byDay, byCustomer, bySeller] = await Promise.all([
    buildSalesReport(organizationId, range, 'day'),
    buildSalesReport(organizationId, range, 'customer'),
    buildSalesReport(organizationId, range, 'seller'),
  ]);

  const totalRevenue = byDay.reduce((acc, row) => acc + row.revenue, 0);
  const totalProfit = byDay.reduce((acc, row) => acc + row.profit, 0);
  const documents = byDay.reduce((acc, row) => acc + row.documents, 0);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Ventas netas" value={<Money value={totalRevenue} currency={currency} />} />
        <KpiCard
          label="Utilidad bruta"
          value={<Money value={totalProfit} currency={currency} />}
          tone={totalProfit >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="Ticket promedio"
          value={
            <Money value={documents > 0 ? Math.round(totalRevenue / documents) : 0} currency={currency} />
          }
          hint={`${documents} documento(s)`}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ventas por cliente" />
          <div className="p-5">
            <BarList
              currency={currency}
              items={byCustomer.slice(0, 10).map((row) => ({
                label: row.label,
                value: row.revenue,
                hint: `${row.documents} compra(s)`,
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Ventas por vendedor" />
          <div className="p-5">
            <BarList
              currency={currency}
              items={bySeller.map((row) => ({
                label: row.label,
                value: row.revenue,
                hint: `${row.documents} venta(s) · utilidad ${(row.profit / 100).toLocaleString('es-NI')}`,
              }))}
            />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Detalle por día" />
        {byDay.length === 0 ? (
          <EmptyState title="Sin ventas" description="No hay ventas en el periodo seleccionado." />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th align="right">Documentos</Th>
                <Th align="right">Ingreso</Th>
                <Th align="right">Costo</Th>
                <Th align="right">Utilidad</Th>
                <Th align="right">Margen</Th>
              </tr>
            </thead>
            <tbody>
              {byDay.map((row) => (
                <Tr key={row.key}>
                  <Td>{formatDate(row.key)}</Td>
                  <Td align="right">{row.documents}</Td>
                  <Td align="right">
                    <Money value={row.revenue} currency={currency} />
                  </Td>
                  <Td align="right">
                    <Money value={row.cost} currency={currency} />
                  </Td>
                  <Td align="right">
                    <Money value={row.profit} currency={currency} />
                  </Td>
                  <Td align="right">
                    {row.revenue > 0
                      ? formatRate(Math.round((row.profit * 10000) / row.revenue))
                      : '—'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </>
  );
}

async function ProductReports({ organizationId, range, currency }: SectionProps) {
  const [byProduct, byCategory] = await Promise.all([
    buildSalesReport(organizationId, range, 'product'),
    buildSalesReport(organizationId, range, 'category'),
  ]);

  return (
    <>
      <Card>
        <CardHeader title="Ventas por categoría" />
        <div className="p-5">
          <BarList
            currency={currency}
            items={byCategory.map((row) => ({ label: row.label, value: row.revenue }))}
          />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Ventas por producto" />
        {byProduct.length === 0 ? (
          <EmptyState title="Sin ventas" description="No hay productos vendidos en el periodo." />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th align="right">Unidades</Th>
                <Th align="right">Ingreso</Th>
                <Th align="right">Costo</Th>
                <Th align="right">Utilidad</Th>
                <Th align="right">Margen</Th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((row) => (
                <Tr key={row.key}>
                  <Td>{row.label}</Td>
                  <Td align="right">{(row.units / 1000).toLocaleString('es-NI')}</Td>
                  <Td align="right">
                    <Money value={row.revenue} currency={currency} />
                  </Td>
                  <Td align="right">
                    <Money value={row.cost} currency={currency} />
                  </Td>
                  <Td align="right">
                    <Money value={row.profit} currency={currency} />
                  </Td>
                  <Td align="right">
                    {row.revenue > 0
                      ? formatRate(Math.round((row.profit * 10000) / row.revenue))
                      : '—'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </>
  );
}

async function PurchaseReports({ organizationId, range, currency }: SectionProps) {
  const [bySupplier, byProduct] = await Promise.all([
    buildPurchaseReport(organizationId, range, 'supplier'),
    buildPurchaseReport(organizationId, range, 'product'),
  ]);

  return (
    <>
      <Card>
        <CardHeader title="Compras por proveedor" />
        <div className="p-5">
          <BarList
            currency={currency}
            items={bySupplier.map((row) => ({
              label: row.label,
              value: row.total,
              hint: `${row.documents} compra(s)`,
            }))}
          />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Compras por producto" />
        {byProduct.length === 0 ? (
          <EmptyState title="Sin compras" description="No hay compras en el periodo." />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th align="right">Unidades</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((row) => (
                <Tr key={row.key}>
                  <Td>{row.label}</Td>
                  <Td align="right">{(row.units / 1000).toLocaleString('es-NI')}</Td>
                  <Td align="right">
                    <Money value={row.total} currency={currency} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </>
  );
}

async function InventoryReports({ organizationId, range, currency }: SectionProps) {
  const [valuation, rotation] = await Promise.all([
    buildStockValuation(organizationId),
    buildRotationReport(organizationId, range),
  ]);

  const stale = rotation.filter((row) => row.unitsSold === 0 && row.stock > 0);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Valor del inventario"
          value={<Money value={valuation.totalCost} currency={currency} />}
          hint="Al costo promedio ponderado"
        />
        <KpiCard
          label="Valor potencial de venta"
          value={<Money value={valuation.totalPotentialRevenue} currency={currency} />}
        />
        <KpiCard label="Productos sin movimiento" value={stale.length} tone="negative" />
      </section>

      <Card className="mt-4">
        <CardHeader title="Valoración por producto" />
        <TableWrapper>
          <thead>
            <tr>
              <Th>Producto</Th>
              <Th>Categoría</Th>
              <Th align="right">Existencias</Th>
              <Th align="right">Costo prom.</Th>
              <Th align="right">Valor</Th>
            </tr>
          </thead>
          <tbody>
            {valuation.rows.slice(0, 100).map((row) => (
              <Tr key={row.productId}>
                <Td>
                  {row.name}
                  <p className="text-xs text-[var(--color-ink-subtle)]">{row.sku}</p>
                </Td>
                <Td>{row.categoryName ?? '—'}</Td>
                <Td align="right">{(row.stock / 1000).toLocaleString('es-NI')}</Td>
                <Td align="right">
                  <Money value={row.averageCost} currency={currency} />
                </Td>
                <Td align="right">
                  <Money value={row.totalCost} currency={currency} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrapper>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Rotación de inventario"
          description="Unidades vendidas en el periodo frente a las existencias actuales."
        />
        <TableWrapper>
          <thead>
            <tr>
              <Th>Producto</Th>
              <Th align="right">Unidades vendidas</Th>
              <Th align="right">Existencias</Th>
              <Th align="right">Rotación</Th>
              <Th>Último movimiento</Th>
            </tr>
          </thead>
          <tbody>
            {rotation.slice(0, 60).map((row) => (
              <Tr key={row.productId}>
                <Td>
                  {row.name}
                  <p className="text-xs text-[var(--color-ink-subtle)]">{row.sku}</p>
                </Td>
                <Td align="right">{(row.unitsSold / 1000).toLocaleString('es-NI')}</Td>
                <Td align="right">{(row.stock / 1000).toLocaleString('es-NI')}</Td>
                <Td align="right">{(row.turnoverRate / 1000).toFixed(2)}x</Td>
                <Td>{row.lastMovementAt ? formatDate(row.lastMovementAt) : 'Sin movimiento'}</Td>
              </Tr>
            ))}
          </tbody>
        </TableWrapper>
      </Card>
    </>
  );
}

async function FinanceReports({ organizationId, range, currency }: SectionProps) {
  const [income, receivableAging, payableAging] = await Promise.all([
    buildIncomeStatement(organizationId, range),
    buildAgingReport(organizationId, 'receivable'),
    buildAgingReport(organizationId, 'payable'),
  ]);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Ingresos" value={<Money value={income.revenue} currency={currency} />} />
        <KpiCard
          label="Costo de ventas"
          value={<Money value={income.costOfGoodsSold} currency={currency} />}
        />
        <KpiCard
          label="Gastos operativos"
          value={<Money value={income.operatingExpenses} currency={currency} />}
        />
        <KpiCard
          label="Utilidad neta"
          value={<Money value={income.netProfit} currency={currency} />}
          tone={income.netProfit >= 0 ? 'positive' : 'negative'}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Gastos por categoría" />
          <div className="p-5">
            <BarList
              currency={currency}
              items={income.expensesByCategory.map((row) => ({
                label: row.categoryName,
                value: row.amount,
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Antigüedad — por cobrar" />
          <div className="p-5">
            <BarList
              currency={currency}
              items={receivableAging.buckets.map((bucket) => ({
                label: bucket.label,
                value: bucket.amount,
                hint: `${bucket.count} documento(s)`,
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Antigüedad — por pagar" />
          <div className="p-5">
            <BarList
              currency={currency}
              items={payableAging.buckets.map((bucket) => ({
                label: bucket.label,
                value: bucket.amount,
                hint: `${bucket.count} documento(s)`,
              }))}
            />
          </div>
        </Card>
      </div>
    </>
  );
}

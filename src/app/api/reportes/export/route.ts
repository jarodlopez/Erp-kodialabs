import { NextResponse, type NextRequest } from 'next/server';

import { logError, toAppError } from '@/lib/errors';
import { csvResponse, toCsv, type CsvColumn } from '@/lib/export/csv';
import { buildPdf, pdfResponse, type PdfColumn } from '@/lib/export/pdf';
import { formatMoney, fromScaledQty } from '@/lib/money';
import { PERMISSIONS } from '@/lib/rbac';
import { expenseRepository, purchaseRepository, saleRepository } from '@/lib/repositories/documents';
import { payableRepository, receivableRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { getActorContext } from '@/lib/server-context';
import { audit } from '@/lib/services/audit';
import {
  buildSalesReport,
  buildStockValuation,
  type SalesGrouping,
} from '@/lib/services/reports';
import { ACTIVE_PURCHASE_STATUSES, ACTIVE_SALE_STATUSES } from '@/lib/state-machines';
import { formatDate, startOfMonthInput, toDateInput } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ReportKind =
  | 'ventas'
  | 'ventas-producto'
  | 'compras'
  | 'gastos'
  | 'inventario'
  | 'cuentas-por-cobrar'
  | 'cuentas-por-pagar';

interface ReportPayload {
  title: string;
  rows: Record<string, string | number>[];
  columns: { key: string; header: string; width: number; align?: 'left' | 'right' }[];
  summary?: { label: string; value: string }[];
}

/**
 * Exportación de reportes en CSV y PDF.
 * Los datos se leen server-side con el Admin SDK y se filtran por la
 * organización de la sesión: nunca se exponen datos de otro tenant.
 */
export async function GET(request: NextRequest) {
  try {
    const { session, actor } = await getActorContext(PERMISSIONS.REPORTS_EXPORT);
    const params = request.nextUrl.searchParams;

    const kind = (params.get('tipo') ?? 'ventas') as ReportKind;
    const format = params.get('formato') === 'pdf' ? 'pdf' : 'csv';
    const from = params.get('from') ?? startOfMonthInput();
    const to = params.get('to') ?? toDateInput();

    const [settings, organization] = await Promise.all([
      organizationRepository.getSettings(session.organizationId),
      organizationRepository.get(session.organizationId),
    ]);
    const currency = settings.currency;
    const money = (value: number) => formatMoney(value, currency);

    const payload = await buildPayload(kind, session.organizationId, from, to, money);

    await audit(actor, {
      action: 'EXPORT',
      module: 'REPORTS',
      entityType: 'report',
      entityId: kind,
      entityLabel: payload.title,
      metadata: { format, from, to, rows: payload.rows.length },
    });

    const filename = `${kind}-${from}-a-${to}.${format}`;

    if (format === 'csv') {
      const columns: CsvColumn<Record<string, string | number>>[] = payload.columns.map(
        (column) => ({
          header: column.header,
          value: (row) => row[column.key],
        }),
      );
      return csvResponse(filename, toCsv(payload.rows, columns));
    }

    const pdfColumns: PdfColumn<Record<string, string | number>>[] = payload.columns.map(
      (column) => ({
        header: column.header,
        width: column.width,
        align: column.align,
        value: (row) => String(row[column.key] ?? ''),
      }),
    );

    const buffer = buildPdf({
      title: payload.title,
      subtitle: `Del ${formatDate(from)} al ${formatDate(to)}`,
      organizationName: organization?.name ?? 'Organización',
      columns: pdfColumns,
      rows: payload.rows,
      summary: payload.summary,
    });

    return pdfResponse(filename, buffer);
  } catch (error) {
    const app = logError('reports.export', error);
    return NextResponse.json(
      { error: { code: app.code, message: app.message } },
      { status: toAppError(error).httpStatus },
    );
  }
}

async function buildPayload(
  kind: ReportKind,
  organizationId: string,
  from: string,
  to: string,
  money: (value: number) => string,
): Promise<ReportPayload> {
  switch (kind) {
    case 'ventas': {
      const sales = await saleRepository.inRange(organizationId, from, to, ACTIVE_SALE_STATUSES);
      return {
        title: 'Reporte de ventas',
        columns: [
          { key: 'numero', header: 'Número', width: 60 },
          { key: 'fecha', header: 'Fecha', width: 55 },
          { key: 'cliente', header: 'Cliente', width: 110 },
          { key: 'vendedor', header: 'Vendedor', width: 90 },
          { key: 'estado', header: 'Estado', width: 55 },
          { key: 'subtotal', header: 'Subtotal', width: 65, align: 'right' },
          { key: 'impuesto', header: 'Impuesto', width: 60, align: 'right' },
          { key: 'total', header: 'Total', width: 65, align: 'right' },
          { key: 'costo', header: 'Costo', width: 60, align: 'right' },
          { key: 'utilidad', header: 'Utilidad', width: 65, align: 'right' },
        ],
        rows: sales.map((sale) => ({
          numero: sale.number,
          fecha: formatDate(sale.date),
          cliente: sale.customerName,
          vendedor: sale.sellerName,
          estado: sale.status,
          subtotal: money(sale.subtotal),
          impuesto: money(sale.tax),
          total: money(sale.total),
          costo: money(sale.costOfGoodsSold),
          utilidad: money(sale.grossProfit),
        })),
        summary: [
          { label: 'Documentos', value: String(sales.length) },
          {
            label: 'Total facturado',
            value: money(sales.reduce((acc, sale) => acc + sale.total, 0)),
          },
          {
            label: 'Utilidad bruta',
            value: money(sales.reduce((acc, sale) => acc + sale.grossProfit, 0)),
          },
        ],
      };
    }

    case 'ventas-producto': {
      const rows = await buildSalesReport(organizationId, { from, to }, 'product' as SalesGrouping);
      return {
        title: 'Ventas por producto',
        columns: [
          { key: 'producto', header: 'Producto', width: 220 },
          { key: 'unidades', header: 'Unidades', width: 70, align: 'right' },
          { key: 'ingreso', header: 'Ingreso', width: 80, align: 'right' },
          { key: 'costo', header: 'Costo', width: 80, align: 'right' },
          { key: 'utilidad', header: 'Utilidad', width: 80, align: 'right' },
        ],
        rows: rows.map((row) => ({
          producto: row.label,
          unidades: fromScaledQty(row.units).toLocaleString('es-NI'),
          ingreso: money(row.revenue),
          costo: money(row.cost),
          utilidad: money(row.profit),
        })),
        summary: [
          { label: 'Ingreso total', value: money(rows.reduce((acc, r) => acc + r.revenue, 0)) },
          { label: 'Utilidad total', value: money(rows.reduce((acc, r) => acc + r.profit, 0)) },
        ],
      };
    }

    case 'compras': {
      const purchases = await purchaseRepository.inRange(
        organizationId,
        from,
        to,
        ACTIVE_PURCHASE_STATUSES,
      );
      return {
        title: 'Reporte de compras',
        columns: [
          { key: 'numero', header: 'Número', width: 60 },
          { key: 'fecha', header: 'Fecha', width: 55 },
          { key: 'proveedor', header: 'Proveedor', width: 130 },
          { key: 'factura', header: 'Factura', width: 70 },
          { key: 'estado', header: 'Estado', width: 55 },
          { key: 'total', header: 'Total', width: 70, align: 'right' },
          { key: 'pagado', header: 'Pagado', width: 70, align: 'right' },
          { key: 'pendiente', header: 'Pendiente', width: 70, align: 'right' },
        ],
        rows: purchases.map((purchase) => ({
          numero: purchase.number,
          fecha: formatDate(purchase.date),
          proveedor: purchase.supplierName,
          factura: purchase.invoiceNumber ?? '',
          estado: purchase.status,
          total: money(purchase.total),
          pagado: money(purchase.paidAmount),
          pendiente: money(purchase.dueAmount),
        })),
        summary: [
          { label: 'Documentos', value: String(purchases.length) },
          { label: 'Total comprado', value: money(purchases.reduce((a, p) => a + p.total, 0)) },
          { label: 'Pendiente de pago', value: money(purchases.reduce((a, p) => a + p.dueAmount, 0)) },
        ],
      };
    }

    case 'gastos': {
      const expenses = await expenseRepository.inRange(organizationId, from, to);
      return {
        title: 'Reporte de gastos',
        columns: [
          { key: 'numero', header: 'Número', width: 60 },
          { key: 'fecha', header: 'Fecha', width: 55 },
          { key: 'categoria', header: 'Categoría', width: 90 },
          { key: 'descripcion', header: 'Descripción', width: 160 },
          { key: 'cuenta', header: 'Cuenta', width: 80 },
          { key: 'estado', header: 'Pago', width: 55 },
          { key: 'total', header: 'Total', width: 70, align: 'right' },
        ],
        rows: expenses.map((expense) => ({
          numero: expense.number,
          fecha: formatDate(expense.date),
          categoria: expense.categoryName,
          descripcion: expense.description,
          cuenta: expense.accountName ?? '',
          estado: expense.paymentStatus,
          total: money(expense.total),
        })),
        summary: [
          { label: 'Gastos', value: String(expenses.length) },
          { label: 'Total', value: money(expenses.reduce((acc, e) => acc + e.total, 0)) },
        ],
      };
    }

    case 'inventario': {
      const valuation = await buildStockValuation(organizationId);
      return {
        title: 'Valoración de inventario',
        columns: [
          { key: 'sku', header: 'SKU', width: 70 },
          { key: 'producto', header: 'Producto', width: 170 },
          { key: 'categoria', header: 'Categoría', width: 90 },
          { key: 'existencias', header: 'Existencias', width: 70, align: 'right' },
          { key: 'costo', header: 'Costo prom.', width: 75, align: 'right' },
          { key: 'valor', header: 'Valor', width: 75, align: 'right' },
          { key: 'precio', header: 'Precio', width: 70, align: 'right' },
        ],
        rows: valuation.rows.map((row) => ({
          sku: row.sku,
          producto: row.name,
          categoria: row.categoryName ?? '',
          existencias: fromScaledQty(row.stock).toLocaleString('es-NI'),
          costo: money(row.averageCost),
          valor: money(row.totalCost),
          precio: money(row.salePrice),
        })),
        summary: [
          { label: 'Productos', value: String(valuation.rows.length) },
          { label: 'Valor al costo', value: money(valuation.totalCost) },
          { label: 'Valor potencial de venta', value: money(valuation.totalPotentialRevenue) },
        ],
      };
    }

    case 'cuentas-por-cobrar': {
      const items = await receivableRepository.outstanding(organizationId);
      return {
        title: 'Cuentas por cobrar',
        columns: [
          { key: 'documento', header: 'Documento', width: 70 },
          { key: 'cliente', header: 'Cliente', width: 150 },
          { key: 'emision', header: 'Emisión', width: 60 },
          { key: 'vence', header: 'Vence', width: 60 },
          { key: 'estado', header: 'Estado', width: 60 },
          { key: 'original', header: 'Original', width: 75, align: 'right' },
          { key: 'pendiente', header: 'Pendiente', width: 75, align: 'right' },
        ],
        rows: items.map((item) => ({
          documento: item.referenceNumber,
          cliente: item.customerName,
          emision: formatDate(item.issueDate),
          vence: formatDate(item.dueDate),
          estado: item.status,
          original: money(item.originalAmount),
          pendiente: money(item.remainingAmount),
        })),
        summary: [
          { label: 'Documentos', value: String(items.length) },
          {
            label: 'Total por cobrar',
            value: money(items.reduce((acc, item) => acc + item.remainingAmount, 0)),
          },
        ],
      };
    }

    case 'cuentas-por-pagar': {
      const items = await payableRepository.outstanding(organizationId);
      return {
        title: 'Cuentas por pagar',
        columns: [
          { key: 'documento', header: 'Documento', width: 70 },
          { key: 'proveedor', header: 'Proveedor', width: 150 },
          { key: 'emision', header: 'Emisión', width: 60 },
          { key: 'vence', header: 'Vence', width: 60 },
          { key: 'estado', header: 'Estado', width: 60 },
          { key: 'original', header: 'Original', width: 75, align: 'right' },
          { key: 'pendiente', header: 'Pendiente', width: 75, align: 'right' },
        ],
        rows: items.map((item) => ({
          documento: item.referenceNumber,
          proveedor: item.supplierName,
          emision: formatDate(item.issueDate),
          vence: formatDate(item.dueDate),
          estado: item.status,
          original: money(item.originalAmount),
          pendiente: money(item.remainingAmount),
        })),
        summary: [
          { label: 'Documentos', value: String(items.length) },
          {
            label: 'Total por pagar',
            value: money(items.reduce((acc, item) => acc + item.remainingAmount, 0)),
          },
        ],
      };
    }

    default:
      return { title: 'Reporte', columns: [], rows: [] };
  }
}

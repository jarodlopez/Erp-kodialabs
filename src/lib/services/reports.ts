import 'server-only';

/**
 * Servicio de reportes y analítica.
 *
 * TODO el contenido proviene de la base de datos: no hay datos simulados.
 * El estado de resultados se construye desde las ventas confirmadas (ingreso
 * y costo de ventas) y los gastos registrados; el flujo de caja se construye
 * desde el libro mayor, excluyendo las transferencias internas.
 */
import { marginRate } from '@/lib/pricing';
import { expenseRepository, purchaseRepository, saleRepository } from '@/lib/repositories/documents';
import { accountRepository, ledgerRepository, payableRepository, receivableRepository } from '@/lib/repositories/finance';
import { inventoryRepository } from '@/lib/repositories/inventory';
import { productRepository } from '@/lib/repositories/catalog';
import { endOfDayIso, startOfDayIso } from '@/lib/repositories/base';
import { ACTIVE_PURCHASE_STATUSES, ACTIVE_SALE_STATUSES } from '@/lib/state-machines';
import type { Id, Money } from '@/types/common';
import type { CashFlowSummary, IncomeStatement } from '@/types/finance';
import { NON_OPERATIONAL_TYPES } from '@/types/finance';
import type { StockValuationRow } from '@/types/inventory';
import type { Sale } from '@/types/sales';

export interface ReportRange {
  from: string;
  to: string;
}

/**
 * Totales NETOS de una venta, descontando las cantidades devueltas. El ingreso
 * es pre-impuesto (suma de subtotales de línea) y el costo es el costo de
 * ventas efectivo. Se usa en el estado de resultados, el dashboard y las
 * agrupaciones para que ingreso y costo queden consistentes tras devoluciones
 * (antes el ingreso quedaba bruto mientras el costo ya venía neto, inflando la
 * utilidad).
 */
export function saleNetTotals(sale: Sale): { revenue: Money; cost: Money; units: number } {
  let revenue = 0;
  let cost = 0;
  let units = 0;
  for (const item of sale.items) {
    const effectiveQty = item.quantity - (item.returnedQuantity ?? 0);
    if (effectiveQty <= 0) continue;
    const ratio = effectiveQty / item.quantity;
    revenue += Math.round(item.subtotal * ratio);
    cost += Math.round(item.totalCost * ratio);
    units += effectiveQty;
  }
  return { revenue, cost, units };
}

/** Estado de resultados del periodo. */
export async function buildIncomeStatement(
  organizationId: Id,
  range: ReportRange,
): Promise<IncomeStatement> {
  const [sales, expenses] = await Promise.all([
    saleRepository.inRange(organizationId, range.from, range.to, ACTIVE_SALE_STATUSES),
    expenseRepository.inRange(organizationId, range.from, range.to),
  ]);

  // El ingreso es la venta NETA de impuestos y de devoluciones.
  let revenue = 0;
  let costOfGoodsSold = 0;
  for (const sale of sales) {
    const net = saleNetTotals(sale);
    revenue += net.revenue;
    costOfGoodsSold += net.cost;
  }

  const byCategory = new Map<string, { categoryId: Id; categoryName: string; amount: Money }>();
  let operatingExpenses = 0;
  for (const expense of expenses) {
    operatingExpenses += expense.total;
    const current = byCategory.get(expense.categoryId);
    if (current) current.amount += expense.total;
    else {
      byCategory.set(expense.categoryId, {
        categoryId: expense.categoryId,
        categoryName: expense.categoryName,
        amount: expense.total,
      });
    }
  }

  const grossProfit = revenue - costOfGoodsSold;
  const netProfit = grossProfit - operatingExpenses;

  return {
    revenue,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    netProfit,
    expensesByCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
    grossMarginRate: marginRate(revenue, costOfGoodsSold),
    netMarginRate: revenue > 0 ? Math.round((netProfit * 10000) / revenue) : 0,
  };
}

/** Flujo de caja del periodo, excluyendo transferencias internas. */
export async function buildCashFlow(
  organizationId: Id,
  range: ReportRange,
): Promise<CashFlowSummary> {
  const [accounts, movements, previous] = await Promise.all([
    accountRepository.list(organizationId),
    ledgerRepository.inRange(organizationId, range.from, range.to),
    ledgerRepository.sumBefore(organizationId, range.from),
  ]);

  const openingBalance = previous.in - previous.out;

  let inflows = 0;
  let outflows = 0;
  const byAccount = new Map<string, { accountId: Id; accountName: string; inflows: Money; outflows: Money; balance: Money }>();

  for (const account of accounts) {
    byAccount.set(account.id, {
      accountId: account.id,
      accountName: account.name,
      inflows: 0,
      outflows: 0,
      balance: account.currentBalance,
    });
  }

  for (const movement of movements) {
    const isInternal = NON_OPERATIONAL_TYPES.includes(movement.type);
    const bucket = byAccount.get(movement.accountId);

    if (movement.direction === 'IN') {
      if (!isInternal) inflows += movement.amount;
      if (bucket) bucket.inflows += movement.amount;
    } else {
      if (!isInternal) outflows += movement.amount;
      if (bucket) bucket.outflows += movement.amount;
    }
  }

  return {
    openingBalance,
    inflows,
    outflows,
    closingBalance: openingBalance + inflows - outflows,
    byAccount: [...byAccount.values()],
  };
}

export interface SalesReportRow {
  key: string;
  label: string;
  documents: number;
  units: number;
  revenue: Money;
  cost: Money;
  profit: Money;
}

export type SalesGrouping = 'day' | 'product' | 'category' | 'customer' | 'seller';

/**
 * Reporte de ventas agrupado según la dimensión solicitada.
 *
 * `preloadedSales` permite reutilizar ventas ya leídas (p. ej. el dashboard, que
 * necesita el mismo rango para varias vistas) y evitar releer la colección.
 */
export async function buildSalesReport(
  organizationId: Id,
  range: ReportRange,
  grouping: SalesGrouping,
  preloadedSales?: Sale[],
): Promise<SalesReportRow[]> {
  const sales =
    preloadedSales ??
    (await saleRepository.inRange(organizationId, range.from, range.to, ACTIVE_SALE_STATUSES));

  const rows = new Map<string, SalesReportRow>();

  const push = (key: string, label: string, values: Partial<SalesReportRow>) => {
    const current = rows.get(key) ?? {
      key,
      label,
      documents: 0,
      units: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    current.documents += values.documents ?? 0;
    current.units += values.units ?? 0;
    current.revenue += values.revenue ?? 0;
    current.cost += values.cost ?? 0;
    current.profit = current.revenue - current.cost;
    rows.set(key, current);
  };

  for (const sale of sales) {
    const net = saleNetTotals(sale);
    if (grouping === 'day') {
      const key = sale.date.slice(0, 10);
      push(key, key, {
        documents: 1,
        revenue: net.revenue,
        cost: net.cost,
        units: net.units,
      });
    } else if (grouping === 'customer') {
      push(sale.customerId ?? 'walk-in', sale.customerName, {
        documents: 1,
        revenue: net.revenue,
        cost: net.cost,
        units: net.units,
      });
    } else if (grouping === 'seller') {
      push(sale.sellerId, sale.sellerName, {
        documents: 1,
        revenue: net.revenue,
        cost: net.cost,
        units: net.units,
      });
    } else {
      for (const item of sale.items) {
        const effectiveQty = item.quantity - (item.returnedQuantity ?? 0);
        if (effectiveQty <= 0) continue;
        const ratio = effectiveQty / item.quantity;
        push(item.productId, `${item.sku} — ${item.name}`, {
          units: effectiveQty,
          revenue: Math.round(item.subtotal * ratio),
          cost: Math.round(item.totalCost * ratio),
        });
      }
    }
  }

  // Agrupación por categoría: requiere resolver la categoría de cada producto.
  if (grouping === 'category') {
    const products = await productRepository.listByIds(organizationId, [...rows.keys()]);
    const byCategory = new Map<string, SalesReportRow>();
    for (const product of products) {
      const row = rows.get(product.id);
      if (!row) continue;
      const key = product.categoryId ?? 'sin-categoria';
      const label = product.categoryName ?? 'Sin categoría';
      const current = byCategory.get(key) ?? {
        key,
        label,
        documents: 0,
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };
      current.units += row.units;
      current.revenue += row.revenue;
      current.cost += row.cost;
      current.profit = current.revenue - current.cost;
      byCategory.set(key, current);
    }
    return [...byCategory.values()].sort((a, b) => b.revenue - a.revenue);
  }

  const result = [...rows.values()];
  return grouping === 'day'
    ? result.sort((a, b) => a.key.localeCompare(b.key))
    : result.sort((a, b) => b.revenue - a.revenue);
}

export interface PurchaseReportRow {
  key: string;
  label: string;
  documents: number;
  units: number;
  total: Money;
}

export async function buildPurchaseReport(
  organizationId: Id,
  range: ReportRange,
  grouping: 'supplier' | 'product' | 'day',
): Promise<PurchaseReportRow[]> {
  const purchases = await purchaseRepository.inRange(
    organizationId,
    range.from,
    range.to,
    ACTIVE_PURCHASE_STATUSES,
  );

  const rows = new Map<string, PurchaseReportRow>();
  const push = (key: string, label: string, values: Partial<PurchaseReportRow>) => {
    const current = rows.get(key) ?? { key, label, documents: 0, units: 0, total: 0 };
    current.documents += values.documents ?? 0;
    current.units += values.units ?? 0;
    current.total += values.total ?? 0;
    rows.set(key, current);
  };

  for (const purchase of purchases) {
    if (grouping === 'supplier') {
      push(purchase.supplierId, purchase.supplierName, { documents: 1, total: purchase.total });
    } else if (grouping === 'day') {
      const key = purchase.date.slice(0, 10);
      push(key, key, { documents: 1, total: purchase.total });
    } else {
      for (const item of purchase.items) {
        push(item.productId, `${item.sku} — ${item.name}`, {
          units: item.quantity,
          total: item.total,
        });
      }
    }
  }

  const result = [...rows.values()];
  return grouping === 'day'
    ? result.sort((a, b) => a.key.localeCompare(b.key))
    : result.sort((a, b) => b.total - a.total);
}

/** Valoración del inventario al costo promedio vigente. */
export async function buildStockValuation(organizationId: Id): Promise<{
  rows: StockValuationRow[];
  totalCost: Money;
  totalPotentialRevenue: Money;
}> {
  const products = await productRepository.allActive(organizationId);
  const rows: StockValuationRow[] = products
    .filter((p) => p.tracksInventory)
    .map((p) => ({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      categoryName: p.categoryName,
      stock: p.stock,
      averageCost: p.averageCost,
      totalCost: Math.round((p.averageCost * p.stock) / 1000),
      salePrice: p.salePrice,
      potentialRevenue: Math.round((p.salePrice * p.stock) / 1000),
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  return {
    rows,
    totalCost: rows.reduce((acc, r) => acc + r.totalCost, 0),
    totalPotentialRevenue: rows.reduce((acc, r) => acc + r.potentialRevenue, 0),
  };
}

export interface RotationRow {
  productId: Id;
  sku: string;
  name: string;
  unitsSold: number;
  stock: number;
  /** Veces que el inventario se renovó en el periodo (x1000). */
  turnoverRate: number;
  lastMovementAt: string | null;
}

/** Rotación de inventario y productos sin movimiento en el periodo. */
export async function buildRotationReport(
  organizationId: Id,
  range: ReportRange,
): Promise<RotationRow[]> {
  const [products, movements] = await Promise.all([
    productRepository.allActive(organizationId),
    inventoryRepository.inRange(organizationId, range.from, range.to),
  ]);

  const sold = new Map<string, number>();
  const lastMovement = new Map<string, string>();
  for (const movement of movements) {
    if (movement.type === 'SALE') {
      sold.set(movement.productId, (sold.get(movement.productId) ?? 0) + movement.quantity);
    }
    const previous = lastMovement.get(movement.productId);
    if (!previous || movement.createdAt > previous) {
      lastMovement.set(movement.productId, movement.createdAt);
    }
  }

  return products
    .filter((p) => p.tracksInventory)
    .map((p) => {
      const unitsSold = sold.get(p.id) ?? 0;
      const averageStock = Math.max(p.stock, 1);
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        unitsSold,
        stock: p.stock,
        turnoverRate: Math.round((unitsSold * 1000) / averageStock),
        lastMovementAt: lastMovement.get(p.id) ?? null,
      };
    })
    .sort((a, b) => b.unitsSold - a.unitsSold);
}

export interface AgingBucket {
  label: string;
  amount: Money;
  count: number;
}

/** Antigüedad de saldos de cuentas por cobrar o por pagar. */
export async function buildAgingReport(
  organizationId: Id,
  kind: 'receivable' | 'payable',
): Promise<{ buckets: AgingBucket[]; total: Money }> {
  const items =
    kind === 'receivable'
      ? await receivableRepository.outstanding(organizationId)
      : await payableRepository.outstanding(organizationId);

  const now = Date.now();
  const buckets: AgingBucket[] = [
    { label: 'Por vencer', amount: 0, count: 0 },
    { label: '1 a 30 días', amount: 0, count: 0 },
    { label: '31 a 60 días', amount: 0, count: 0 },
    { label: '61 a 90 días', amount: 0, count: 0 },
    { label: 'Más de 90 días', amount: 0, count: 0 },
  ];

  for (const item of items) {
    const dueTime = new Date(item.dueDate).getTime();
    const daysLate = Math.floor((now - dueTime) / 86400000);
    const index =
      daysLate <= 0 ? 0 : daysLate <= 30 ? 1 : daysLate <= 60 ? 2 : daysLate <= 90 ? 3 : 4;
    buckets[index].amount += item.remainingAmount;
    buckets[index].count += 1;
  }

  return { buckets, total: buckets.reduce((acc, b) => acc + b.amount, 0) };
}

/** Serie temporal de ingresos y egresos, para los gráficos del dashboard. */
export async function buildDailySeries(
  organizationId: Id,
  range: ReportRange,
  preloaded?: { sales?: Sale[]; expenses?: Awaited<ReturnType<typeof expenseRepository.inRange>> },
): Promise<{ date: string; sales: Money; expenses: Money; profit: Money }[]> {
  const [sales, expenses] = await Promise.all([
    preloaded?.sales ??
      saleRepository.inRange(organizationId, range.from, range.to, ACTIVE_SALE_STATUSES),
    preloaded?.expenses ?? expenseRepository.inRange(organizationId, range.from, range.to),
  ]);

  const series = new Map<string, { date: string; sales: Money; expenses: Money; profit: Money }>();
  const start = new Date(startOfDayIso(range.from));
  const end = new Date(endOfDayIso(range.to));

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    series.set(key, { date: key, sales: 0, expenses: 0, profit: 0 });
  }

  for (const sale of sales) {
    const key = sale.date.slice(0, 10);
    const bucket = series.get(key);
    if (!bucket) continue;
    // Netos de devoluciones, para que la serie coincida con los KPIs y el
    // estado de resultados.
    const net = saleNetTotals(sale);
    bucket.sales += net.revenue;
    bucket.profit += net.revenue - net.cost;
  }

  for (const expense of expenses) {
    const key = expense.date.slice(0, 10);
    const bucket = series.get(key);
    if (!bucket) continue;
    bucket.expenses += expense.total;
    bucket.profit -= expense.total;
  }

  return [...series.values()];
}

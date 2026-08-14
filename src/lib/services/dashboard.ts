import 'server-only';

/**
 * Servicio del dashboard ejecutivo.
 * Todos los indicadores se calculan sobre datos reales de la organización.
 */
import { productRepository } from '@/lib/repositories/catalog';
import { customerRepository, supplierRepository } from '@/lib/repositories/parties';
import { expenseRepository, purchaseRepository, saleRepository } from '@/lib/repositories/documents';
import {
  accountRepository,
  payableRepository,
  receivableRepository,
} from '@/lib/repositories/finance';
import { ACTIVE_PURCHASE_STATUSES, ACTIVE_SALE_STATUSES } from '@/lib/state-machines';
import type { Id, Money } from '@/types/common';
import type { Product } from '@/types/catalog';
import type { Sale } from '@/types/sales';
import { buildDailySeries, buildSalesReport, saleNetTotals, type ReportRange } from './reports';

export interface DashboardAlert {
  kind: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'OVERDUE_RECEIVABLE' | 'OVERDUE_PAYABLE' | 'DUE_SOON';
  label: string;
  detail: string;
  amount?: Money;
  href: string;
}

export interface OnboardingStatus {
  hasProducts: boolean;
  hasParties: boolean;
  hasPurchases: boolean;
  hasSales: boolean;
  /** Verdadero cuando la organización ya tiene lo mínimo para operar. */
  complete: boolean;
}

export interface DashboardData {
  onboarding: OnboardingStatus;
  kpis: {
    sales: Money;
    salesCount: number;
    purchases: Money;
    expenses: Money;
    grossProfit: Money;
    netProfit: Money;
    cash: Money;
    bank: Money;
    receivables: Money;
    payables: Money;
    inventoryValue: Money;
    customers: number;
    products: number;
  };
  series: { date: string; sales: Money; expenses: Money; profit: Money }[];
  topProducts: { key: string; label: string; units: number; revenue: Money }[];
  topCategories: { key: string; label: string; revenue: Money }[];
  recentSales: Sale[];
  lowStock: Product[];
  alerts: DashboardAlert[];
  accounts: { id: Id; name: string; type: string; balance: Money }[];
}

export async function buildDashboard(
  organizationId: Id,
  range: ReportRange,
): Promise<DashboardData> {
  // Se leen ventas y gastos del rango una sola vez y se reutilizan en las
  // vistas derivadas (serie diaria, reporte por producto y por categoría) para
  // no releer las mismas colecciones cuatro veces.
  const [sales, expenses] = await Promise.all([
    saleRepository.inRange(organizationId, range.from, range.to, ACTIVE_SALE_STATUSES),
    expenseRepository.inRange(organizationId, range.from, range.to),
  ]);

  const [
    purchases,
    accounts,
    receivables,
    payables,
    lowStock,
    products,
    customers,
    recentSales,
    series,
    topProducts,
    topCategories,
    suppliers,
    anyPurchase,
  ] = await Promise.all([
    purchaseRepository.inRange(organizationId, range.from, range.to, ACTIVE_PURCHASE_STATUSES),
    accountRepository.list(organizationId),
    receivableRepository.outstanding(organizationId),
    payableRepository.outstanding(organizationId),
    productRepository.lowStock(organizationId, 10),
    productRepository.allActive(organizationId),
    customerRepository.count(organizationId),
    saleRepository.recent(organizationId, 6),
    buildDailySeries(organizationId, range, { sales, expenses }),
    buildSalesReport(organizationId, range, 'product', sales),
    buildSalesReport(organizationId, range, 'category', sales),
    supplierRepository.count(organizationId),
    purchaseRepository.list(organizationId, {}, { limit: 1 }),
  ]);

  // Estado de primeros pasos: se calcula sobre existencia real de datos
  // (no acotado al rango del dashboard) para guiar a organizaciones nuevas.
  const onboarding: OnboardingStatus = {
    hasProducts: products.length > 0,
    hasParties: customers > 0 || suppliers > 0,
    hasPurchases: anyPurchase.items.length > 0,
    hasSales: recentSales.length > 0,
    complete: false,
  };
  onboarding.complete = onboarding.hasProducts && onboarding.hasParties && onboarding.hasSales;

  // Ventas y costo NETOS de devoluciones (consistente con el estado de resultados).
  const salesNet = sales.reduce(
    (acc, s) => {
      const net = saleNetTotals(s);
      acc.revenue += net.revenue;
      acc.cost += net.cost;
      return acc;
    },
    { revenue: 0, cost: 0 },
  );
  const salesTotal = salesNet.revenue;
  const cogs = salesNet.cost;
  const expensesTotal = expenses.reduce((acc, e) => acc + e.total, 0);

  const cash = accounts
    .filter((a) => a.type === 'CASH')
    .reduce((acc, a) => acc + a.currentBalance, 0);
  const bank = accounts
    .filter((a) => a.type !== 'CASH')
    .reduce((acc, a) => acc + a.currentBalance, 0);

  const receivablesTotal = receivables.reduce((acc, r) => acc + r.remainingAmount, 0);
  const payablesTotal = payables.reduce((acc, p) => acc + p.remainingAmount, 0);

  const inventoryValue = products
    .filter((p) => p.tracksInventory)
    .reduce((acc, p) => acc + Math.round((p.averageCost * p.stock) / 1000), 0);

  const purchasesTotal = purchases.reduce((acc, p) => acc + p.total, 0);

  const alerts: DashboardAlert[] = [];
  const now = Date.now();
  const soon = now + 7 * 86400000;

  for (const product of lowStock.slice(0, 5)) {
    alerts.push({
      kind: product.stock <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      label: product.stock <= 0 ? 'Sin existencias' : 'Stock bajo',
      detail: `${product.sku} — ${product.name}`,
      href: `/inventario/${product.id}`,
    });
  }

  const overdueReceivables = receivables.filter((r) => new Date(r.dueDate).getTime() < now);
  if (overdueReceivables.length > 0) {
    alerts.push({
      kind: 'OVERDUE_RECEIVABLE',
      label: 'Cuentas por cobrar vencidas',
      detail: `${overdueReceivables.length} documento(s) vencido(s)`,
      amount: overdueReceivables.reduce((acc, r) => acc + r.remainingAmount, 0),
      href: '/cuentas-por-cobrar?status=OVERDUE',
    });
  }

  const overduePayables = payables.filter((p) => new Date(p.dueDate).getTime() < now);
  if (overduePayables.length > 0) {
    alerts.push({
      kind: 'OVERDUE_PAYABLE',
      label: 'Cuentas por pagar vencidas',
      detail: `${overduePayables.length} documento(s) vencido(s)`,
      amount: overduePayables.reduce((acc, p) => acc + p.remainingAmount, 0),
      href: '/cuentas-por-pagar?status=OVERDUE',
    });
  }

  const dueSoon = [...receivables, ...payables].filter((d) => {
    const time = new Date(d.dueDate).getTime();
    return time >= now && time <= soon;
  });
  if (dueSoon.length > 0) {
    alerts.push({
      kind: 'DUE_SOON',
      label: 'Próximos vencimientos',
      detail: `${dueSoon.length} documento(s) vencen en los próximos 7 días`,
      amount: dueSoon.reduce((acc, d) => acc + d.remainingAmount, 0),
      href: '/cuentas-por-cobrar',
    });
  }

  return {
    onboarding,
    kpis: {
      sales: salesTotal,
      salesCount: sales.length,
      purchases: purchasesTotal,
      expenses: expensesTotal,
      grossProfit: salesTotal - cogs,
      netProfit: salesTotal - cogs - expensesTotal,
      cash,
      bank,
      receivables: receivablesTotal,
      payables: payablesTotal,
      inventoryValue,
      customers,
      products: products.length,
    },
    series,
    topProducts: topProducts.slice(0, 6).map((r) => ({
      key: r.key,
      label: r.label,
      units: r.units,
      revenue: r.revenue,
    })),
    topCategories: topCategories.slice(0, 5).map((r) => ({
      key: r.key,
      label: r.label,
      revenue: r.revenue,
    })),
    recentSales,
    lowStock,
    alerts,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.currentBalance,
    })),
  };
}

export async function countSuppliers(organizationId: Id): Promise<number> {
  return supplierRepository.count(organizationId);
}

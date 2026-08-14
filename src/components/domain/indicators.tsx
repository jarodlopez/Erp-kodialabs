import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { Badge, Card } from '@/components/ui/primitives';
import { formatMoney, formatQty } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { PurchaseStatus } from '@/types/purchases';
import type { ReceivableStatus } from '@/types/finance';
import type { PaymentStatus, SaleStatus } from '@/types/sales';

/** Importe monetario formateado con alineación tabular. */
export function Money({
  value,
  currency = 'NIO',
  className,
  signed = false,
}: {
  value: number;
  currency?: string;
  className?: string;
  signed?: boolean;
}) {
  const tone =
    signed && value !== 0
      ? value > 0
        ? 'text-[var(--color-positive-700)]'
        : 'text-[var(--color-danger-700)]'
      : undefined;

  return (
    <span className={cn('tabular', tone, className)}>
      {signed && value > 0 ? '+' : ''}
      {formatMoney(value, currency)}
    </span>
  );
}

/** Cantidad de inventario formateada. */
export function Qty({ value, className }: { value: number; className?: string }) {
  return <span className={cn('tabular', className)}>{formatQty(value)}</span>;
}

export function KpiCard({
  label,
  value,
  hint,
  trend,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: number;
  tone?: 'neutral' | 'positive' | 'negative' | 'brand';
  icon?: ReactNode;
}) {
  const toneClass = {
    neutral: 'text-[var(--color-ink)]',
    positive: 'text-[var(--color-positive-700)]',
    negative: 'text-[var(--color-danger-700)]',
    brand: 'text-[var(--color-brand-700)]',
  }[tone];

  // Chip del icono coloreado según el tono, para dar identidad visual a cada KPI.
  const chipClass = {
    neutral: 'bg-[var(--color-brand-50)] text-[var(--color-brand-600)]',
    positive: 'bg-[var(--color-positive-50)] text-[var(--color-positive-700)]',
    negative: 'bg-[var(--color-danger-50)] text-[var(--color-danger-700)]',
    brand: 'bg-[var(--color-brand-50)] text-[var(--color-brand-600)]',
  }[tone];

  return (
    <Card className="card-interactive p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-[var(--color-ink-subtle)] sm:text-sm">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
              chipClass,
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className={cn('mt-2 text-xl font-semibold leading-tight tracking-tight tabular sm:text-2xl', toneClass)}>
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {typeof trend === 'number' && trend !== 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              trend > 0 ? 'text-[var(--color-positive-700)]' : 'text-[var(--color-danger-700)]',
            )}
          >
            {trend > 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-xs text-[var(--color-ink-subtle)]">{hint}</span>}
      </div>
    </Card>
  );
}

const SALE_STATUS_TONE: Record<SaleStatus, 'neutral' | 'brand' | 'positive' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  CONFIRMED: 'brand',
  PARTIAL: 'warning',
  PAID: 'positive',
  CANCELLED: 'danger',
  RETURNED: 'danger',
};

const SALE_STATUS_TEXT: Record<SaleStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
  RETURNED: 'Devuelta',
};

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return <Badge tone={SALE_STATUS_TONE[status]}>{SALE_STATUS_TEXT[status]}</Badge>;
}

const PURCHASE_STATUS_TONE: Record<
  PurchaseStatus,
  'neutral' | 'brand' | 'positive' | 'warning' | 'danger'
> = {
  DRAFT: 'neutral',
  RECEIVED: 'brand',
  PARTIAL: 'warning',
  PAID: 'positive',
  CANCELLED: 'danger',
  RETURNED: 'danger',
};

const PURCHASE_STATUS_TEXT: Record<PurchaseStatus, string> = {
  DRAFT: 'Borrador',
  RECEIVED: 'Recibida',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
  RETURNED: 'Devuelta',
};

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return <Badge tone={PURCHASE_STATUS_TONE[status]}>{PURCHASE_STATUS_TEXT[status]}</Badge>;
}

const DEBT_STATUS_TONE: Record<
  ReceivableStatus,
  'neutral' | 'brand' | 'positive' | 'warning' | 'danger'
> = {
  PENDING: 'brand',
  PARTIAL: 'warning',
  PAID: 'positive',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
};

const DEBT_STATUS_TEXT: Record<ReceivableStatus, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Abonada',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Anulada',
};

export function DebtStatusBadge({ status }: { status: ReceivableStatus }) {
  return <Badge tone={DEBT_STATUS_TONE[status]}>{DEBT_STATUS_TEXT[status]}</Badge>;
}

const PAYMENT_STATUS_TONE: Record<PaymentStatus, 'neutral' | 'positive' | 'warning' | 'danger'> = {
  UNPAID: 'warning',
  PARTIAL: 'warning',
  PAID: 'positive',
  CANCELLED: 'neutral',
};

const PAYMENT_STATUS_TEXT: Record<PaymentStatus, string> = {
  UNPAID: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  CANCELLED: 'Anulado',
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_TEXT[status]}</Badge>;
}

export function StockBadge({ stock, minimum }: { stock: number; minimum: number }) {
  if (stock <= 0) return <Badge tone="danger">Sin existencias</Badge>;
  if (stock <= minimum) return <Badge tone="warning">Stock bajo</Badge>;
  return <Badge tone="positive">Disponible</Badge>;
}

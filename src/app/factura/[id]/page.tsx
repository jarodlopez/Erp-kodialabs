import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { PrintButton } from '@/components/domain/print-button';
import { requirePermission } from '@/lib/auth/session';
import { formatMoney, fromScaledQty } from '@/lib/money';
import { organizationRepository } from '@/lib/repositories/organization';
import { saleRepository } from '@/lib/repositories/documents';
import { PERMISSIONS } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { PAYMENT_STATUS_LABELS } from '@/types/sales';

export const metadata: Metadata = { title: 'Factura' };
export const dynamic = 'force-dynamic';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.SALES_VIEW);

  const [sale, org, settings] = await Promise.all([
    saleRepository.get(session.organizationId, id),
    organizationRepository.get(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
  ]);

  if (!sale) notFound();
  const currency = settings.currency;

  return (
    <div className="mx-auto max-w-2xl p-6 text-[var(--color-ink)]">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden no-print">
        <Link href={`/ventas/${sale.id}`} className="text-sm text-[var(--color-brand-600)] hover:underline">
          ← Volver a la venta
        </Link>
        <PrintButton label="Imprimir / Guardar PDF" />
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-white p-6 print:border-0 print:p-0">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{org?.name ?? 'Mi empresa'}</h1>
            {org?.legalName && <p className="text-sm text-[var(--color-ink-muted)]">{org.legalName}</p>}
            {org?.taxId && <p className="text-xs text-[var(--color-ink-subtle)]">RUC/ID: {org.taxId}</p>}
            {org?.address && <p className="text-xs text-[var(--color-ink-subtle)]">{org.address}</p>}
            {org?.phone && <p className="text-xs text-[var(--color-ink-subtle)]">Tel: {org.phone}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
              Factura
            </p>
            <p className="text-lg font-bold">{sale.number}</p>
            <p className="text-xs text-[var(--color-ink-subtle)]">{formatDate(sale.date)}</p>
          </div>
        </div>

        {/* Cliente */}
        <div className="flex flex-wrap justify-between gap-4 py-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-ink-subtle)]">Cliente</p>
            <p className="font-medium">{sale.customerName}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-[var(--color-ink-subtle)]">Condición</p>
            <p className="font-medium">{sale.type === 'CASH' ? 'Contado' : 'Crédito'}</p>
            <p className="text-xs text-[var(--color-ink-subtle)]">
              {PAYMENT_STATUS_LABELS[sale.paymentStatus]}
            </p>
          </div>
        </div>

        {/* Detalle */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-ink-subtle)]">
              <th className="py-2">Producto</th>
              <th className="py-2 text-right">Cant.</th>
              <th className="py-2 text-right">Precio</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.productId} className="border-b border-[var(--color-border)]">
                <td className="py-2">
                  <span className="font-medium">{item.name}</span>
                  <span className="block text-xs text-[var(--color-ink-subtle)]">{item.sku}</span>
                </td>
                <td className="py-2 text-right tabular">
                  {fromScaledQty(item.quantity).toLocaleString(settings.locale)}
                </td>
                <td className="py-2 text-right tabular">{formatMoney(item.unitPrice, currency)}</td>
                <td className="py-2 text-right tabular">{formatMoney(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-xs space-y-1 text-sm">
            <Row label="Subtotal" value={formatMoney(sale.subtotal, currency)} />
            {sale.discount > 0 && <Row label="Descuentos" value={`- ${formatMoney(sale.discount, currency)}`} />}
            <Row label="Impuesto" value={formatMoney(sale.tax, currency)} />
            <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-1.5">
              <dt className="font-bold">Total</dt>
              <dd className="text-lg font-bold tabular">{formatMoney(sale.total, currency)}</dd>
            </div>
            {sale.paidAmount > 0 && <Row label="Pagado" value={formatMoney(sale.paidAmount, currency)} />}
            {sale.dueAmount > 0 && (
              <Row label="Saldo pendiente" value={formatMoney(sale.dueAmount, currency)} />
            )}
          </dl>
        </div>

        {sale.notes && (
          <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-ink-muted)]">
            <span className="font-medium">Notas: </span>
            {sale.notes}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-[var(--color-ink-subtle)]">
          Atendido por {sale.sellerName} · ¡Gracias por su compra!
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--color-ink-subtle)]">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

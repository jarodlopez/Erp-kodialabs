import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MapPin, Package, Phone } from 'lucide-react';

import { PrintButton } from '@/components/domain/print-button';
import { requirePermission } from '@/lib/auth/session';
import { fromScaledQty } from '@/lib/money';
import { organizationRepository } from '@/lib/repositories/organization';
import { saleRepository } from '@/lib/repositories/documents';
import { PERMISSIONS } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Etiqueta de envío' };
export const dynamic = 'force-dynamic';

export default async function ShippingLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.SALES_VIEW);

  const [sale, org, settings] = await Promise.all([
    saleRepository.get(session.organizationId, id),
    organizationRepository.get(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
  ]);

  if (!sale) notFound();

  const totalUnits = sale.items.reduce((acc, item) => acc + fromScaledQty(item.quantity), 0);
  const recipient = sale.delivery?.recipient || sale.customerName;
  const address = sale.delivery?.address ?? null;
  const phone = sale.delivery?.phone ?? null;

  return (
    <div className="mx-auto max-w-md p-6 text-[var(--color-ink)]">
      <div className="mb-4 flex items-center justify-between gap-2 no-print">
        <Link href={`/ventas/${sale.id}`} className="text-sm text-[var(--color-brand-600)] hover:underline">
          ← Volver a la venta
        </Link>
        <PrintButton label="Imprimir etiqueta" />
      </div>

      <div className="rounded-xl border-2 border-[var(--color-ink)] bg-white p-5">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b-2 border-dashed border-[var(--color-border-strong)] pb-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-[var(--color-ink-subtle)]">
              Envío / Delivery
            </p>
            <p className="text-xl font-extrabold">{sale.number}</p>
          </div>
          <div className="text-right text-xs text-[var(--color-ink-subtle)]">
            <p>{formatDate(sale.date)}</p>
            <p>{totalUnits.toLocaleString(settings.locale)} artículo(s)</p>
          </div>
        </div>

        {/* Remitente */}
        <div className="py-3 text-xs text-[var(--color-ink-muted)]">
          <p className="uppercase tracking-wide text-[var(--color-ink-subtle)]">De</p>
          <p className="font-medium text-[var(--color-ink)]">{org?.name ?? 'Mi empresa'}</p>
          {org?.phone && <p>Tel: {org.phone}</p>}
        </div>

        {/* Destinatario */}
        <div className="rounded-lg bg-[var(--color-canvas)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-subtle)]">Entregar a</p>
          <p className="text-lg font-bold">{recipient}</p>
          {address ? (
            <p className="mt-1 flex items-start gap-1.5 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" />
              <span>{address}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-danger-700)]">
              ⚠ Sin dirección de entrega registrada.
            </p>
          )}
          {phone && (
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <Phone className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" />
              <span>{phone}</span>
            </p>
          )}
          {sale.delivery?.notes && (
            <p className="mt-2 rounded bg-white p-2 text-xs text-[var(--color-ink-muted)]">
              <span className="font-medium">Indicaciones: </span>
              {sale.delivery.notes}
            </p>
          )}
        </div>

        {/* Lista de empaque */}
        <div className="mt-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
            <Package className="h-4 w-4" /> Lista de empaque
          </p>
          <table className="w-full text-sm">
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.productId} className="border-b border-[var(--color-border)]">
                  <td className="py-1.5 pr-2 align-top">
                    <span className="inline-block h-4 w-4 shrink-0 rounded border border-[var(--color-ink-subtle)]" />
                  </td>
                  <td className="w-full py-1.5">
                    <span className="font-medium">{item.name}</span>
                    <span className="block text-xs text-[var(--color-ink-subtle)]">{item.sku}</span>
                  </td>
                  <td className="py-1.5 pl-2 text-right align-top text-base font-bold tabular">
                    ×{fromScaledQty(item.quantity).toLocaleString(settings.locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 border-t border-dashed border-[var(--color-border-strong)] pt-2 text-center text-[11px] text-[var(--color-ink-subtle)]">
          Verifica que el paquete contenga todos los artículos antes de sellarlo.
        </p>
      </div>
    </div>
  );
}

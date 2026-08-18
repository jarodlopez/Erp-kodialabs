import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ExternalLink, Receipt } from 'lucide-react';

import { DeliveryLink } from '@/components/domain/delivery-link';
import { Money, Qty } from '@/components/domain/indicators';
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  TableWrapper,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { optimizeImg } from '@/lib/images';
import { PERMISSIONS } from '@/lib/rbac';
import { accountRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { storeOrderRepository, storeSettingsRepository } from '@/lib/repositories/store';
import { formatDateTime } from '@/lib/utils';
import { STORE_ORDER_STATUS_LABELS, type StoreOrderStatus } from '@/types/store';
import { StoreOrderActions } from './order-actions';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<StoreOrderStatus, 'neutral' | 'warning' | 'positive' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'positive',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission(PERMISSIONS.STORE_ORDERS_VIEW);
  const { id } = await params;
  const order = await storeOrderRepository.get(session.organizationId, id);
  return { title: order ? `Pedido ${order.number}` : 'Pedido' };
}

export default async function StoreOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.STORE_ORDERS_VIEW);
  const { id } = await params;

  const order = await storeOrderRepository.get(session.organizationId, id);
  if (!order) notFound();

  const [orgSettings, storeSettings, accounts] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    storeSettingsRepository.get(session.organizationId),
    accountRepository.list(session.organizationId),
  ]);

  const currency = orgSettings.currency;
  const canResolve =
    order.status === 'PENDING' &&
    session.permissions.includes(PERMISSIONS.STORE_ORDERS_MANAGE);

  return (
    <>
      <PageHeader
        title={`Pedido ${order.number}`}
        breadcrumb={
          <Link href="/tienda/pedidos" className="hover:underline">
            Pedidos online
          </Link>
        }
        description={`Recibido el ${formatDateTime(order.createdAt)}`}
        actions={
          <>
            {/* El reparto se ofrece recién con el pedido aprobado: antes de eso
                no hay venta y podría terminar rechazado. */}
            {order.status === 'APPROVED' && (
              <DeliveryLink
                organizationId={session.organizationId}
                source="STORE_ORDER"
                sourceId={order.id}
                permissions={session.permissions}
              />
            )}
            {canResolve && (
              <StoreOrderActions
                orderId={order.id}
                orderNumber={order.number}
                total={order.total}
                currency={currency}
                accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
                defaultAccountId={storeSettings?.defaultAccountId ?? null}
                hasReceipt={Boolean(order.receiptUrl)}
              />
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[order.status]}>{STORE_ORDER_STATUS_LABELS[order.status]}</Badge>
        {order.saleId && order.saleNumber && (
          <Link
            href={`/ventas/${order.saleId}`}
            className="text-sm text-[var(--color-brand-600)] hover:underline"
          >
            Venta {order.saleNumber} →
          </Link>
        )}
        {order.resolutionNote && (
          <span className="text-sm text-[var(--color-ink-muted)]">· {order.resolutionNote}</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Productos" />
          <TableWrapper>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th align="right">Cantidad</Th>
                <Th align="right">Precio</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <Tr key={item.productId}>
                  <Td>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-[var(--color-ink-subtle)]">
                      {item.sku}
                      {item.variantLabel ? ` · ${item.variantLabel}` : ''}
                    </p>
                  </Td>
                  <Td label="Cantidad" align="right">
                    <Qty value={item.quantity} />
                  </Td>
                  <Td label="Precio" align="right">
                    <Money value={item.unitPrice} currency={currency} />
                  </Td>
                  <Td label="Total" align="right">
                    <Money value={item.total} currency={currency} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrapper>

          <dl className="space-y-1 border-t border-[var(--color-border)] px-5 py-4 text-sm">
            <div className="flex justify-between text-[var(--color-ink-muted)]">
              <dt>Subtotal</dt>
              <dd>
                <Money value={order.subtotal} currency={currency} />
              </dd>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-[var(--color-ink-muted)]">
                <dt>Descuento {order.discountCode ? `(${order.discountCode})` : ''}</dt>
                <dd>
                  − <Money value={order.discountAmount} currency={currency} />
                </dd>
              </div>
            )}
            <div className="flex justify-between text-[var(--color-ink-muted)]">
              <dt>Envío {order.shippingZoneLabel ? `· ${order.shippingZoneLabel}` : ''}</dt>
              <dd>
                <Money value={order.shippingCost} currency={currency} />
              </dd>
            </div>
            <div className="flex justify-between pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>
                <Money value={order.total} currency={currency} />
              </dd>
            </div>
          </dl>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Cliente" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <Detail label="Nombre" value={order.customer.name} />
              <Detail label="Teléfono" value={order.customer.phone} />
              <Detail label="Correo" value={order.customer.email ?? '—'} />
              <Detail label="Documento" value={order.customer.document ?? '—'} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Entrega" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <Detail label="Dirección" value={order.delivery.address} />
              <Detail label="Referencias" value={order.delivery.notes ?? '—'} />
              <Detail label="Zona" value={order.shippingZoneLabel ?? '—'} />
              {order.notes && <Detail label="Nota del cliente" value={order.notes} />}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Comprobante de pago" />
            <div className="px-5 py-4">
              {order.receiptUrl ? (
                <a href={order.receiptUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={optimizeImg(order.receiptUrl, 800)}
                    alt={`Comprobante del pedido ${order.number}`}
                    className="w-full rounded-lg border border-[var(--color-border)]"
                  />
                  <span className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--color-brand-600)]">
                    <ExternalLink className="h-3.5 w-3.5" /> Ver original
                  </span>
                </a>
              ) : (
                <p className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
                  <Receipt className="h-4 w-4" /> El cliente todavía no subió comprobante.
                </p>
              )}
              {order.paymentReference && (
                <p className="mt-2 text-sm">
                  Referencia:{' '}
                  <span className="font-mono">{order.paymentReference}</span>
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-ink-subtle)]">{label}</dt>
      <dd className="text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

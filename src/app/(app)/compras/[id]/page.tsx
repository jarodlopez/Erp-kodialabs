import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Money, PaymentStatusBadge, PurchaseStatusBadge, Qty } from '@/components/domain/indicators';
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
import { PERMISSIONS } from '@/lib/rbac';
import { purchaseRepository, returnRepository } from '@/lib/repositories/documents';
import { accountRepository, paymentRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';
import { PurchaseActions } from './purchase-actions';

export const metadata: Metadata = { title: 'Detalle de compra' };
export const dynamic = 'force-dynamic';

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PURCHASES_VIEW);
  const { id } = await params;

  const purchase = await purchaseRepository.get(session.organizationId, id);
  if (!purchase) notFound();

  const [settings, accounts, payments, returns] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    accountRepository.list(session.organizationId),
    paymentRepository.byReference(session.organizationId, purchase.id),
    returnRepository.byReference(session.organizationId, purchase.id),
  ]);

  const currency = settings.currency;

  return (
    <>
      <PageHeader
        title={purchase.number}
        breadcrumb={
          <Link href="/compras" className="hover:underline">
            Compras
          </Link>
        }
        description={`${formatDate(purchase.date)} · ${purchase.supplierName}`}
        actions={
          <PurchaseActions
            purchase={purchase}
            accounts={accounts}
            currency={currency}
            permissions={session.permissions}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PurchaseStatusBadge status={purchase.status} />
        <PaymentStatusBadge status={purchase.paymentStatus} />
        <Badge tone="neutral">{purchase.type === 'CASH' ? 'Contado' : 'Crédito'}</Badge>
        {purchase.invoiceNumber && <Badge tone="neutral">Factura {purchase.invoiceNumber}</Badge>}
        {purchase.dueDate && <Badge tone="neutral">Vence {formatDate(purchase.dueDate)}</Badge>}
      </div>

      {purchase.status === 'CANCELLED' && (
        <div className="mb-4 rounded-lg border border-[var(--color-danger-500)] bg-[var(--color-danger-50)] p-4 text-sm text-[var(--color-danger-700)]">
          <p className="font-semibold">Compra anulada</p>
          <p className="mt-0.5">
            {purchase.cancelReason} · {formatDateTime(purchase.cancelledAt)}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Productos"
              description="El costo final incluye el flete y otros costos prorrateados."
            />
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th align="right">Cantidad</Th>
                  <Th align="right">Costo</Th>
                  <Th align="right">Costo final</Th>
                  <Th align="right">Impuesto</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item) => (
                  <Tr key={item.productId}>
                    <Td>
                      <Link
                        href={`/inventario/${item.productId}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        {item.name}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {item.sku}
                        {item.returnedQuantity > 0 &&
                          ` · Devuelto: ${(item.returnedQuantity / 1000).toLocaleString('es-NI')}`}
                      </p>
                    </Td>
                    <Td align="right">
                      <Qty value={item.quantity} />
                    </Td>
                    <Td align="right">
                      <Money value={item.unitCost} currency={currency} />
                    </Td>
                    <Td align="right">
                      <Money value={item.landedUnitCost} currency={currency} />
                    </Td>
                    <Td align="right">
                      <Money value={item.taxAmount} currency={currency} />
                    </Td>
                    <Td align="right">
                      <Money value={item.total} currency={currency} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrapper>
          </Card>

          <Card>
            <CardHeader title="Pagos registrados" />
            {payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[var(--color-ink-subtle)]">
                No hay pagos registrados para esta compra.
              </p>
            ) : (
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Número</Th>
                    <Th>Fecha</Th>
                    <Th>Cuenta</Th>
                    <Th>Método</Th>
                    <Th align="right">Importe</Th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <Tr key={payment.id}>
                      <Td>
                        {payment.number}
                        {payment.cancelledAt && (
                          <Badge tone="danger" className="ml-2">
                            Reversado
                          </Badge>
                        )}
                      </Td>
                      <Td>{formatDate(payment.date)}</Td>
                      <Td>{payment.accountName}</Td>
                      <Td>{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</Td>
                      <Td align="right">
                        <Money value={payment.amount} currency={currency} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrapper>
            )}
          </Card>

          {returns.length > 0 && (
            <Card>
              <CardHeader title="Devoluciones" />
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Número</Th>
                    <Th>Fecha</Th>
                    <Th>Motivo</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((doc) => (
                    <Tr key={doc.id}>
                      <Td>{doc.number}</Td>
                      <Td>{formatDate(doc.date)}</Td>
                      <Td className="max-w-[240px] truncate">{doc.reason}</Td>
                      <Td align="right">
                        <Money value={doc.total} currency={currency} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrapper>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Totales" />
            <dl className="space-y-2 p-5 text-sm">
              <Row label="Subtotal" value={<Money value={purchase.subtotal} currency={currency} />} />
              <Row
                label="Descuentos"
                value={<Money value={-purchase.discount} currency={currency} />}
              />
              <Row label="Impuestos" value={<Money value={purchase.tax} currency={currency} />} />
              <Row label="Flete" value={<Money value={purchase.shipping} currency={currency} />} />
              <Row
                label="Otros costos"
                value={<Money value={purchase.otherCosts} currency={currency} />}
              />
              <div className="border-t border-[var(--color-border)] pt-2">
                <Row
                  label={<span className="font-semibold">Total</span>}
                  value={
                    <span className="text-lg font-semibold">
                      <Money value={purchase.total} currency={currency} />
                    </span>
                  }
                />
              </div>
              <Row label="Pagado" value={<Money value={purchase.paidAmount} currency={currency} />} />
              <Row
                label="Pendiente"
                value={
                  <span className={purchase.dueAmount > 0 ? 'text-[var(--color-warning-700)]' : ''}>
                    <Money value={purchase.dueAmount} currency={currency} />
                  </span>
                }
              />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Información" />
            <dl className="space-y-2 p-5 text-sm">
              <Row label="Proveedor" value={purchase.supplierName} />
              <Row label="Fecha" value={formatDate(purchase.date)} />
              <Row
                label="Recibida"
                value={purchase.receivedAt ? formatDateTime(purchase.receivedAt) : 'Pendiente'}
              />
              <Row label="Registrada" value={formatDateTime(purchase.createdAt)} />
            </dl>
            {purchase.notes && (
              <p className="border-t border-[var(--color-border)] px-5 py-3 text-sm text-[var(--color-ink-muted)]">
                {purchase.notes}
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--color-ink-subtle)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

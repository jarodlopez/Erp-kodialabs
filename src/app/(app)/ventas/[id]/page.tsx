import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import {
  Money,
  PaymentStatusBadge,
  Qty,
  SaleStatusBadge,
} from '@/components/domain/indicators';
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
import { returnRepository, saleRepository } from '@/lib/repositories/documents';
import { accountRepository, paymentRepository, receivableRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate, formatDateTime, formatRate } from '@/lib/utils';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';
import { SaleActions } from './sale-actions';

export const metadata: Metadata = { title: 'Detalle de venta' };
export const dynamic = 'force-dynamic';

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(PERMISSIONS.SALES_VIEW);
  const { id } = await params;

  const sale = await saleRepository.get(session.organizationId, id);
  if (!sale) notFound();

  const [settings, accounts, payments, receivable, returns] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    accountRepository.list(session.organizationId),
    paymentRepository.byReference(session.organizationId, sale.id),
    receivableRepository.bySale(session.organizationId, sale.id),
    returnRepository.byReference(session.organizationId, sale.id),
  ]);

  const currency = settings.currency;

  return (
    <>
      <PageHeader
        title={sale.number}
        breadcrumb={
          <Link href="/ventas" className="hover:underline">
            Ventas
          </Link>
        }
        description={`${formatDate(sale.date)} · ${sale.customerName}`}
        actions={
          <SaleActions
            sale={sale}
            accounts={accounts}
            currency={currency}
            permissions={session.permissions}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SaleStatusBadge status={sale.status} />
        <PaymentStatusBadge status={sale.paymentStatus} />
        <Badge tone="neutral">{sale.type === 'CASH' ? 'Contado' : 'Crédito'}</Badge>
        {sale.dueDate && <Badge tone="neutral">Vence {formatDate(sale.dueDate)}</Badge>}
        {sale.returnedAmount > 0 && (
          <Badge tone="warning">
            Devuelto: <Money value={sale.returnedAmount} currency={currency} />
          </Badge>
        )}
      </div>

      {sale.status === 'CANCELLED' && (
        <div className="mb-4 rounded-lg border border-[var(--color-danger-500)] bg-[var(--color-danger-50)] p-4 text-sm text-[var(--color-danger-700)]">
          <p className="font-semibold">Venta anulada</p>
          <p className="mt-0.5">
            {sale.cancelReason} · {formatDateTime(sale.cancelledAt)}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Productos" />
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th align="right">Cantidad</Th>
                  <Th align="right">Precio</Th>
                  <Th align="right">Desc.</Th>
                  <Th align="right">Impuesto</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item) => (
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
                      <Money value={item.unitPrice} currency={currency} />
                    </Td>
                    <Td align="right">
                      <Money value={item.discount} currency={currency} />
                    </Td>
                    <Td align="right">
                      <span className="text-xs text-[var(--color-ink-subtle)]">
                        {formatRate(item.taxRate)}
                      </span>{' '}
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
            <CardHeader title="Cobros registrados" />
            {payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[var(--color-ink-subtle)]">
                Todavía no se ha registrado ningún cobro para esta venta.
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
                    <Th>Reintegro</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((doc) => (
                    <Tr key={doc.id}>
                      <Td>{doc.number}</Td>
                      <Td>{formatDate(doc.date)}</Td>
                      <Td className="max-w-[220px] truncate">{doc.reason}</Td>
                      <Td>
                        {doc.refundMode === 'CASH_REFUND' ? 'Dinero devuelto' : 'Nota de crédito'}
                      </Td>
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
              <Row label="Subtotal" value={<Money value={sale.subtotal} currency={currency} />} />
              <Row label="Descuentos" value={<Money value={-sale.discount} currency={currency} />} />
              <Row label="Impuestos" value={<Money value={sale.tax} currency={currency} />} />
              <div className="border-t border-[var(--color-border)] pt-2">
                <Row
                  label={<span className="font-semibold">Total</span>}
                  value={
                    <span className="text-lg font-semibold">
                      <Money value={sale.total} currency={currency} />
                    </span>
                  }
                />
              </div>
              <Row label="Cobrado" value={<Money value={sale.paidAmount} currency={currency} />} />
              <Row
                label="Pendiente"
                value={
                  <span className={sale.dueAmount > 0 ? 'text-[var(--color-warning-700)]' : ''}>
                    <Money value={sale.dueAmount} currency={currency} />
                  </span>
                }
              />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Rentabilidad" />
            <dl className="space-y-2 p-5 text-sm">
              <Row
                label="Costo de venta"
                value={<Money value={sale.costOfGoodsSold} currency={currency} />}
              />
              <Row
                label="Utilidad bruta"
                value={
                  <span
                    className={
                      sale.grossProfit >= 0
                        ? 'text-[var(--color-positive-700)]'
                        : 'text-[var(--color-danger-700)]'
                    }
                  >
                    <Money value={sale.grossProfit} currency={currency} />
                  </span>
                }
              />
              <Row
                label="Margen"
                value={
                  sale.subtotal > 0
                    ? formatRate(Math.round((sale.grossProfit * 10000) / sale.subtotal))
                    : '—'
                }
              />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Información" />
            <dl className="space-y-2 p-5 text-sm">
              <Row label="Cliente" value={sale.customerName} />
              <Row label="Vendedor" value={sale.sellerName} />
              <Row label="Fecha" value={formatDate(sale.date)} />
              <Row label="Registrada" value={formatDateTime(sale.createdAt)} />
              {receivable && (
                <Row
                  label="Cuenta por cobrar"
                  value={
                    <Link
                      href="/cuentas-por-cobrar"
                      className="text-[var(--color-brand-600)] hover:underline"
                    >
                      {receivable.status}
                    </Link>
                  }
                />
              )}
            </dl>
            {sale.notes && (
              <p className="border-t border-[var(--color-border)] px-5 py-3 text-sm text-[var(--color-ink-muted)]">
                {sale.notes}
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

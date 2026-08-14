import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import {
  DebtStatusBadge,
  Money,
  PurchaseStatusBadge,
  SummaryTile,
} from '@/components/domain/indicators';
import {
  Badge,
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
import { purchaseRepository } from '@/lib/repositories/documents';
import { payableRepository } from '@/lib/repositories/finance';
import { supplierRepository } from '@/lib/repositories/parties';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate } from '@/lib/utils';
import { SupplierManager } from '../supplier-manager';

export const metadata: Metadata = { title: 'Detalle de proveedor' };
export const dynamic = 'force-dynamic';

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.SUPPLIERS_VIEW);
  const { id } = await params;

  const supplier = await supplierRepository.get(session.organizationId, id);
  if (!supplier) notFound();

  const [settings, purchases, payables] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    purchaseRepository.bySupplier(session.organizationId, id, 20),
    payableRepository.bySupplier(session.organizationId, id, 20),
  ]);

  const currency = settings.currency;

  // Productos suministrados: se derivan de las compras registradas.
  const suppliedProducts = new Map<string, { name: string; sku: string; quantity: number }>();
  for (const purchase of purchases) {
    if (purchase.status === 'CANCELLED') continue;
    for (const item of purchase.items) {
      const current = suppliedProducts.get(item.productId);
      if (current) current.quantity += item.quantity;
      else
        suppliedProducts.set(item.productId, {
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
        });
    }
  }

  return (
    <>
      <PageHeader
        title={supplier.name}
        breadcrumb={
          <Link href="/proveedores" className="hover:underline">
            Proveedores
          </Link>
        }
        description={supplier.contactName ?? supplier.document ?? 'Sin contacto registrado'}
        actions={
          session.permissions.includes(PERMISSIONS.SUPPLIERS_UPDATE) ? (
            <SupplierManager mode="edit" supplier={supplier} />
          ) : undefined
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Total comprado"
          value={<Money value={supplier.stats.totalAmount} currency={currency} />}
          variant="sun"
        />
        <SummaryTile label="Compras" value={supplier.stats.documentCount} variant="plain" />
        <SummaryTile
          label="Saldo por pagar"
          value={<Money value={supplier.stats.outstandingBalance} currency={currency} />}
          variant="ember"
        />
        <SummaryTile
          label="Productos suministrados"
          value={suppliedProducts.size}
          variant="plain"
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Historial de compras" />
            {purchases.length === 0 ? (
              <EmptyState title="Sin compras" description="Aún no hay compras a este proveedor." />
            ) : (
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Número</Th>
                    <Th>Fecha</Th>
                    <Th>Estado</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Pendiente</Th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <Tr key={purchase.id}>
                      <Td>
                        <Link
                          href={`/compras/${purchase.id}`}
                          className="font-medium text-[var(--color-brand-600)] hover:underline"
                        >
                          {purchase.number}
                        </Link>
                      </Td>
                      <Td>{formatDate(purchase.date)}</Td>
                      <Td>
                        <PurchaseStatusBadge status={purchase.status} />
                      </Td>
                      <Td align="right">
                        <Money value={purchase.total} currency={currency} />
                      </Td>
                      <Td align="right">
                        <Money value={purchase.dueAmount} currency={currency} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrapper>
            )}
          </Card>

          <Card>
            <CardHeader title="Cuentas por pagar" />
            {payables.length === 0 ? (
              <EmptyState title="Sin deuda" description="No hay documentos pendientes de pago." />
            ) : (
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Documento</Th>
                    <Th>Vence</Th>
                    <Th>Estado</Th>
                    <Th align="right">Original</Th>
                    <Th align="right">Pendiente</Th>
                  </tr>
                </thead>
                <tbody>
                  {payables.map((item) => (
                    <Tr key={item.id}>
                      <Td>{item.referenceNumber}</Td>
                      <Td>{formatDate(item.dueDate)}</Td>
                      <Td>
                        <DebtStatusBadge status={item.status} />
                      </Td>
                      <Td align="right">
                        <Money value={item.originalAmount} currency={currency} />
                      </Td>
                      <Td align="right">
                        <Money value={item.remainingAmount} currency={currency} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrapper>
            )}
          </Card>

          {suppliedProducts.size > 0 && (
            <Card>
              <CardHeader title="Productos suministrados" />
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Producto</Th>
                    <Th>SKU</Th>
                    <Th align="right">Unidades compradas</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...suppliedProducts.entries()].map(([productId, product]) => (
                    <Tr key={productId}>
                      <Td>
                        <Link
                          href={`/inventario/${productId}`}
                          className="font-medium text-[var(--color-brand-600)] hover:underline"
                        >
                          {product.name}
                        </Link>
                      </Td>
                      <Td className="text-[var(--color-ink-subtle)]">{product.sku}</Td>
                      <Td align="right">{(product.quantity / 1000).toLocaleString('es-NI')}</Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrapper>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title="Ficha" />
          <dl className="space-y-3 p-5 text-sm">
            <Row label="Contacto" value={supplier.contactName ?? '—'} />
            <Row label="Teléfono" value={supplier.phone ?? '—'} />
            <Row label="Correo" value={supplier.email ?? '—'} />
            <Row label="Dirección" value={supplier.address ?? '—'} />
            <Row label="Días de crédito" value={`${supplier.creditDays} días`} />
            <Row
              label="Estado"
              value={
                supplier.status === 'ACTIVE' ? (
                  <Badge tone="positive">Activo</Badge>
                ) : (
                  <Badge tone="neutral">Inactivo</Badge>
                )
              }
            />
            <Row label="Última compra" value={formatDate(supplier.stats.lastDocumentAt)} />
          </dl>
          {supplier.notes && (
            <p className="border-t border-[var(--color-border)] px-5 py-3 text-sm text-[var(--color-ink-muted)]">
              {supplier.notes}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[var(--color-ink-subtle)]">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium">{value}</dd>
    </div>
  );
}

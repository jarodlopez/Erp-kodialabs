import Link from 'next/link';
import type { Metadata } from 'next';
import { Tag } from 'lucide-react';

import { Money } from '@/components/domain/indicators';
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
import { organizationRepository } from '@/lib/repositories/organization';
import { storeDiscountRepository } from '@/lib/repositories/store';
import { formatDate } from '@/lib/utils';
import { DISCOUNT_KIND_LABELS } from '@/types/store';
import { DiscountEditor, DiscountStatusToggle } from './discount-editor';

export const metadata: Metadata = { title: 'Cupones · Tienda' };
export const dynamic = 'force-dynamic';

export default async function StoreDiscountsPage() {
  const session = await requirePermission(PERMISSIONS.STORE_MANAGE);

  const [discounts, orgSettings] = await Promise.all([
    storeDiscountRepository.list(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
  ]);

  const currency = orgSettings.currency;
  const now = new Date().toISOString();

  return (
    <>
      <PageHeader
        title="Cupones"
        breadcrumb={
          <Link href="/tienda" className="hover:underline">
            Tienda online
          </Link>
        }
        description="El descuento se aplica al confirmar el pedido y se traslada como descuento global a la venta del ERP."
        actions={<DiscountEditor mode="create" />}
      />

      <Card>
        <CardHeader title={`${discounts.length} cupón(es)`} />

        {discounts.length === 0 ? (
          <EmptyState
            icon={<Tag className="h-5 w-5" />}
            title="Sin cupones"
            description="Creá un código de descuento para tus campañas."
            action={<DiscountEditor mode="create" />}
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Descuento</Th>
                <Th align="right">Compra mínima</Th>
                <Th align="right">Usos</Th>
                <Th>Vence</Th>
                <Th>Estado</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((discount) => {
                const expired = Boolean(discount.expiresAt && discount.expiresAt < now);
                const exhausted =
                  discount.maxUses > 0 && discount.usedCount >= discount.maxUses;

                return (
                  <Tr key={discount.id}>
                    <Td className="font-mono font-medium">{discount.code}</Td>
                    <Td label="Descuento">
                      {discount.kind === 'PERCENT'
                        ? `${discount.value / 100} %`
                        : <Money value={discount.value} currency={currency} />}
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {DISCOUNT_KIND_LABELS[discount.kind]}
                      </p>
                    </Td>
                    <Td label="Compra mínima" align="right">
                      {discount.minimumPurchase > 0 ? (
                        <Money value={discount.minimumPurchase} currency={currency} />
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td label="Usos" align="right">
                      {discount.usedCount}
                      {discount.maxUses > 0 ? ` / ${discount.maxUses}` : ''}
                    </Td>
                    <Td label="Vence" className="text-[var(--color-ink-subtle)]">
                      {discount.expiresAt ? formatDate(discount.expiresAt) : 'Sin vencimiento'}
                    </Td>
                    <Td label="Estado">
                      {discount.status === 'INACTIVE' ? (
                        <Badge tone="neutral">Inactivo</Badge>
                      ) : expired ? (
                        <Badge tone="danger">Vencido</Badge>
                      ) : exhausted ? (
                        <Badge tone="warning">Agotado</Badge>
                      ) : (
                        <Badge tone="positive">Activo</Badge>
                      )}
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <DiscountStatusToggle id={discount.id} status={discount.status} />
                        <DiscountEditor mode="edit" discount={discount} />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </>
  );
}

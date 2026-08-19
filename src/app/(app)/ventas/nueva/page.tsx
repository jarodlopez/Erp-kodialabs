import Link from 'next/link';
import type { Metadata } from 'next';

import { Card, PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { accountRepository } from '@/lib/repositories/finance';
import { productRepository } from '@/lib/repositories/catalog';
import { organizationRepository } from '@/lib/repositories/organization';
import { SaleEditor } from './sale-editor';

export const metadata: Metadata = { title: 'Nueva venta' };
export const dynamic = 'force-dynamic';

export default async function NewSalePage() {
  const session = await requirePermission(PERMISSIONS.SALES_CREATE);

  const [accounts, settings] = await Promise.all([
    accountRepository.list(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
  ]);

  /*
   * Tasa de impuesto del producto de envío, para que la vista previa del total
   * coincida con lo que el servidor va a calcular. Se lee acá y no se asume
   * cero porque el producto es editable desde Inventario: hay países donde el
   * flete se grava y quien lo cambió espera verlo reflejado antes de confirmar.
   * Si todavía no existe, el primer envío lo crea sin impuesto.
   */
  const shippingProduct = settings.shippingProductId
    ? await productRepository.get(session.organizationId, settings.shippingProductId)
    : null;

  return (
    <>
      <PageHeader
        title="Nueva venta"
        breadcrumb={
          <Link href="/ventas" className="hover:underline">
            Ventas
          </Link>
        }
        description="Al confirmar se descuenta inventario, se registra el cobro y se genera la cuenta por cobrar si aplica."
      />

      {accounts.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Antes de vender necesitas al menos una cuenta financiera (caja o banco) donde registrar
            los cobros.{' '}
            <Link href="/caja-y-bancos" className="font-medium text-[var(--color-brand-600)] hover:underline">
              Crear cuenta
            </Link>
          </p>
        </Card>
      ) : (
        <SaleEditor
          accounts={accounts}
          settings={settings}
          shippingTaxRate={shippingProduct?.taxRate ?? 0}
        />
      )}
    </>
  );
}

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { QTY_SCALE } from '@/lib/money';
import { storeSettingsRepository } from '@/lib/repositories/store';
import { loadStorefrontCatalog, sellableIndex } from '@/lib/services/store';
import { CheckoutForm, type CheckoutStock } from './checkout-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

/**
 * Checkout de la tienda.
 *
 * Además de la configuración, baja una foto del catálogo publicado. El carrito
 * vive en `localStorage` y puede llevar horas ahí: con esta foto el resumen
 * pinta el precio VIGENTE y avisa de lo agotado mientras el comprador llena el
 * formulario, en lugar de que lo descubra con el pedido rechazado. Sigue siendo
 * informativa —el pedido se recalcula igual en el servidor—, así que no relaja
 * ninguna validación.
 */
export default async function StoreCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const settings = await storeSettingsRepository.findBySlug(slug);
  if (!settings || settings.status !== 'PUBLISHED') notFound();

  const sellable = sellableIndex(await loadStorefrontCatalog(settings.organizationId));

  const stock: Record<string, CheckoutStock> = {};
  for (const [productId, entry] of sellable) {
    stock[productId] = {
      // `stock` viene escalado por 1000; una opción no disponible cuenta como
      // agotada aunque el ERP tenga existencias reservadas.
      units: entry.option.available ? Math.floor(entry.option.stock / QTY_SCALE) : 0,
      price: entry.option.price,
    };
  }

  return <CheckoutForm settings={settings} stock={stock} />;
}

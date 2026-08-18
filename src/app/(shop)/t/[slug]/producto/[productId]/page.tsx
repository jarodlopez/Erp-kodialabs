import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { storeSettingsRepository } from '@/lib/repositories/store';
import { loadStorefrontCatalog } from '@/lib/services/store';
import { formatStorePrice } from '@/lib/storefront';
import { ShopImage } from '../../chrome';
import { BuyPanel } from './buy-panel';

export const dynamic = 'force-dynamic';

async function loadProduct(slug: string, productId: string) {
  const settings = await storeSettingsRepository.findBySlug(slug);
  if (!settings || settings.status !== 'PUBLISHED') return null;

  const catalog = await loadStorefrontCatalog(settings.organizationId);
  const product = catalog.find((item) => item.productId === productId);
  if (!product) return null;

  return { settings, product };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}): Promise<Metadata> {
  const { slug, productId } = await params;
  const data = await loadProduct(slug, productId);
  if (!data) return { title: 'Producto no disponible' };

  return {
    title: data.product.title,
    description: data.product.description ?? undefined,
    openGraph: {
      title: data.product.title,
      description: data.product.description ?? undefined,
      images: data.product.images.slice(0, 1),
    },
  };
}

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const data = await loadProduct(slug, productId);
  if (!data) notFound();

  const { settings, product } = data;
  const symbol = settings.branding.currencySymbol;

  return (
    <div className="space-y-8">
      <Link
        href={`/t/${slug}`}
        className="text-xs font-bold uppercase tracking-widest"
        style={{ color: 'var(--shop-ink-muted)' }}
      >
        ← Volver a la tienda
      </Link>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="shop-media border" style={{ borderColor: 'var(--shop-line)' }}>
            <ShopImage src={product.images[0] ?? null} alt={product.title} width={1600} eager />
          </div>
          {product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {product.images.slice(1, 5).map((image) => (
                <div
                  key={image}
                  className="shop-media border"
                  style={{ borderColor: 'var(--shop-line)' }}
                >
                  <ShopImage src={image} alt={product.title} width={400} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            {product.collection && <p className="shop-eyebrow">{product.collection}</p>}
            <h1 className="shop-display text-3xl sm:text-4xl">{product.title}</h1>
          </div>

          <BuyPanel
            product={product}
            settings={settings}
            showStock={settings.features.showStock}
          />

          {product.description && (
            <div className="space-y-2 border-t pt-5" style={{ borderColor: 'var(--shop-line)' }}>
              <p className="shop-eyebrow">Descripción</p>
              <p className="whitespace-pre-line text-sm" style={{ color: 'var(--shop-ink-muted)' }}>
                {product.description}
              </p>
            </div>
          )}

          {product.details.length > 0 && (
            <div className="space-y-2 border-t pt-5" style={{ borderColor: 'var(--shop-line)' }}>
              <p className="shop-eyebrow">Detalles</p>
              <ul className="space-y-1 text-sm" style={{ color: 'var(--shop-ink-muted)' }}>
                {product.details.map((detail) => (
                  <li key={detail}>· {detail}</li>
                ))}
              </ul>
            </div>
          )}

          {settings.shippingZones.length > 0 && (
            <div className="space-y-2 border-t pt-5" style={{ borderColor: 'var(--shop-line)' }}>
              <p className="shop-eyebrow">Envíos</p>
              <ul className="space-y-1 text-sm" style={{ color: 'var(--shop-ink-muted)' }}>
                {settings.shippingZones.map((zone) => (
                  <li key={zone.id}>
                    {zone.label} —{' '}
                    {zone.cost === 0 ? 'gratis' : formatStorePrice(zone.cost, symbol)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

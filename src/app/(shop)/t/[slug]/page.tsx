import Link from 'next/link';
import { notFound } from 'next/navigation';

import { storeSettingsRepository } from '@/lib/repositories/store';
import { catalogCollections, loadStorefrontCatalog } from '@/lib/services/store';
import { formatStorePrice, isSoldOut, priceLabel } from '@/lib/storefront';
import type { StorefrontProduct } from '@/types/store';
import { ShopImage } from './chrome';

export const dynamic = 'force-dynamic';

/**
 * Vitrina de la tienda.
 *
 * El catálogo se resuelve en el servidor contra los productos vivos del ERP,
 * así que el precio y la disponibilidad que ve el visitante son los del
 * inventario en ese instante, sin ninguna copia intermedia que sincronizar.
 */
export default async function StoreHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ coleccion?: string }>;
}) {
  const { slug } = await params;
  const { coleccion } = await searchParams;

  const settings = await storeSettingsRepository.findBySlug(slug);
  if (!settings || settings.status !== 'PUBLISHED') notFound();

  const catalog = await loadStorefrontCatalog(settings.organizationId);
  const collections = catalogCollections(catalog);

  const active = coleccion && collections.includes(coleccion) ? coleccion : null;
  const products = active ? catalog.filter((item) => item.collection === active) : catalog;

  const symbol = settings.branding.currencySymbol;
  const hero = settings.features.hero ? settings.heroSlides[0] : null;

  return (
    <div className="space-y-10">
      {hero && (
        <section className="relative overflow-hidden border" style={{ borderColor: 'var(--shop-line)' }}>
          <div className="shop-media" style={{ aspectRatio: '21 / 9' }}>
            <ShopImage src={hero.imageUrl} alt={hero.title ?? settings.branding.name} width={1600} eager />
          </div>
          {(hero.title || hero.subtitle || hero.ctaLabel) && (
            <div
              className="absolute inset-0 flex flex-col justify-end gap-3 p-6 sm:p-10"
              style={{ background: 'linear-gradient(to top, rgb(0 0 0 / 0.85), transparent 65%)' }}
            >
              {hero.title && <h1 className="shop-display text-3xl sm:text-5xl">{hero.title}</h1>}
              {hero.subtitle && (
                <p className="max-w-prose text-sm sm:text-base" style={{ color: 'var(--shop-ink-muted)' }}>
                  {hero.subtitle}
                </p>
              )}
              {hero.ctaLabel && hero.ctaHref && (
                <a href={hero.ctaHref} className="shop-btn w-fit">
                  {hero.ctaLabel}
                </a>
              )}
            </div>
          )}
        </section>
      )}

      {collections.length > 0 && (
        <nav className="flex flex-wrap gap-2">
          <CollectionChip slug={slug} label="Todo" href={`/t/${slug}`} active={!active} />
          {collections.map((collection) => (
            <CollectionChip
              key={collection}
              slug={slug}
              label={collection}
              href={`/t/${slug}?coleccion=${encodeURIComponent(collection)}`}
              active={active === collection}
            />
          ))}
        </nav>
      )}

      {products.length === 0 ? (
        <p className="py-16 text-center text-sm" style={{ color: 'var(--shop-ink-muted)' }}>
          Todavía no hay productos publicados en esta sección.
        </p>
      ) : (
        <section className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.listingId} slug={slug} product={product} symbol={symbol} />
          ))}
        </section>
      )}
    </div>
  );
}

function CollectionChip({
  label,
  href,
  active,
}: {
  slug: string;
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="shop-badge"
      style={
        active
          ? { background: 'var(--accent)', color: '#000' }
          : { background: 'var(--shop-surface-2)', color: 'var(--shop-ink-muted)' }
      }
    >
      {label}
    </Link>
  );
}

function ProductCard({
  slug,
  product,
  symbol,
}: {
  slug: string;
  product: StorefrontProduct;
  symbol: string;
}) {
  const soldOut = isSoldOut(product);

  return (
    <Link href={`/t/${slug}/producto/${product.productId}`} className="shop-card block">
      <div className="shop-media">
        <ShopImage src={product.images[0] ?? null} alt={product.title} width={800} />
        {soldOut && (
          <span className="shop-badge shop-badge-out absolute left-2 top-2">Agotado</span>
        )}
        {!soldOut && product.compareAtPrice > 0 && (
          <span className="shop-badge shop-badge-accent absolute left-2 top-2">Oferta</span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-bold uppercase tracking-wide">{product.title}</p>
        <p className="flex items-baseline gap-2 text-sm">
          <span style={{ color: 'var(--accent)' }}>{priceLabel(product, symbol)}</span>
          {product.compareAtPrice > 0 && (
            <span className="text-xs line-through" style={{ color: 'var(--shop-ink-subtle)' }}>
              {formatStorePrice(product.compareAtPrice, symbol)}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

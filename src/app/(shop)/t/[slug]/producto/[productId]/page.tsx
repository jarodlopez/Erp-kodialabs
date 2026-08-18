import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { toMajorUnits } from '@/lib/money';
import { organizationRepository } from '@/lib/repositories/organization';
import { storeSettingsRepository } from '@/lib/repositories/store';
import { loadStorefrontCatalog } from '@/lib/services/store';
import {
  formatStorePrice,
  isSoldOut,
  priceLabel,
  siteOriginIsShareable,
  storeUrl,
} from '@/lib/storefront';
import type { StoreSettings, StorefrontProduct } from '@/types/store';
import { ShopImage } from '../../chrome';
import { ProductCard } from '../../product-card';
import { BuyPanel } from './buy-panel';
import { ProductGallery } from './gallery';

export const dynamic = 'force-dynamic';

/**
 * Ficha de producto del escaparate público.
 *
 * Todo el dato se resuelve acá contra el catálogo vivo del ERP y baja como
 * props: al navegador solo van los dos trozos que necesitan interacción real
 * —la galería y el panel de compra—. El catálogo completo ya viene cargado para
 * resolver la ficha, así que las recomendaciones del pie no cuestan una lectura
 * extra.
 */

async function loadProduct(slug: string, productId: string) {
  const settings = await storeSettingsRepository.findBySlug(slug);
  if (!settings || settings.status !== 'PUBLISHED') return null;

  const catalog = await loadStorefrontCatalog(settings.organizationId);
  const product = catalog.find((item) => item.productId === productId);
  if (!product) return null;

  return { settings, product, catalog };
}

/** SKU que representa la ficha: el del producto principal. */
function mainSku(product: StorefrontProduct): string {
  const main = product.options.find((option) => option.productId === product.productId);
  return (main ?? product.options[0]).sku;
}

/** Descripción para buscadores y redes: la del comercio o una armada con el dato. */
function seoDescription(product: StorefrontProduct, settings: StoreSettings): string {
  if (product.description) return product.description.replace(/\s+/g, ' ').slice(0, 300);

  const pieces = [
    product.title,
    product.collection,
    `${priceLabel(product, settings.branding.currencySymbol)} en ${settings.branding.name}`,
  ].filter((piece): piece is string => Boolean(piece));

  return pieces.join(' · ');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}): Promise<Metadata> {
  const { slug, productId } = await params;
  const data = await loadProduct(slug, productId);
  if (!data) return { title: 'Producto no disponible', robots: { index: false, follow: false } };

  const { product, settings } = data;
  const description = seoDescription(product, settings);
  const url = storeUrl(slug, `/producto/${productId}`);

  return {
    title: product.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: `${product.title} · ${settings.branding.name}`,
      description,
      url,
      // La portada primero: es la imagen que WhatsApp e Instagram muestran.
      images: product.images.slice(0, 4),
    },
    twitter: {
      card: 'summary_large_image',
      title: product.title,
      description,
      images: product.images.slice(0, 1),
    },
  };
}

/**
 * Datos estructurados de la ficha (schema.org/Product).
 *
 * Es lo que hace que el producto aparezca con foto, precio y disponibilidad en
 * los resultados de búsqueda en lugar de como un enlace suelto.
 *
 * MONEDA — `StoreSettings` solo guarda el SÍMBOLO visible (`C$`, `Q`, `L`), que
 * no sirve acá: `priceCurrency` exige el código ISO-4217. Se toma el de la
 * organización dueña de la tienda, que sí lo guarda; si no se pudo leer se OMITE
 * el campo antes que publicar una moneda inventada, porque un precio con la
 * moneda equivocada es peor que un precio sin moneda.
 */
function productJsonLd({
  product,
  settings,
  currency,
  url,
}: {
  product: StorefrontProduct;
  settings: StoreSettings;
  currency: string | null;
  url: string | null;
}): string {
  const money = (minor: number) => toMajorUnits(minor).toFixed(2);
  const prices = product.options.map((option) => option.price);
  const availability = isSoldOut(product)
    ? 'https://schema.org/OutOfStock'
    : 'https://schema.org/InStock';

  const common = {
    availability,
    ...(currency ? { priceCurrency: currency } : {}),
    ...(url ? { url } : {}),
  };

  // Con variantes el rango es la verdad: cada talla o medida puede tener su
  // propio precio y anunciar uno solo sería engañoso.
  const offers =
    product.options.length > 1
      ? {
          '@type': 'AggregateOffer',
          offerCount: product.options.length,
          lowPrice: money(Math.min(...prices)),
          highPrice: money(Math.max(...prices)),
          ...common,
        }
      : { '@type': 'Offer', price: money(product.price), ...common };

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    image: product.images,
    description: seoDescription(product, settings),
    sku: mainSku(product),
    brand: { '@type': 'Brand', name: settings.branding.name },
    ...(product.collection ? { category: product.collection } : {}),
    offers,
  };

  // El título y la descripción los escribe el comercio: escapando `<` ninguna
  // ficha puede cerrar este `<script>` y meter marcado en la página.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const data = await loadProduct(slug, productId);
  if (!data) notFound();

  const { settings, product, catalog } = data;
  const symbol = settings.branding.currencySymbol;

  const organization = await organizationRepository.get(settings.organizationId);
  const productPath = `/t/${slug}/producto/${productId}`;
  const canonical = storeUrl(slug, `/producto/${productId}`);

  const similar = recommend(catalog, product, 'same');
  const others = recommend(catalog, product, 'other');

  return (
    // El `pb` grande deja pasar la barra fija de compra en móvil sin que tape
    // las recomendaciones del pie.
    <div className="px-4 pb-36 pt-6 md:px-8 md:pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: productJsonLd({
            product,
            settings,
            currency: organization?.currency ?? null,
            // Un enlace de previsualización de Vercel cambia con cada push: no
            // sirve como identidad canónica del producto.
            url: siteOriginIsShareable() ? canonical : null,
          }),
        }}
      />

      <nav
        aria-label="Miga de pan"
        className="shop-mono mb-6 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-widest"
        style={{ color: 'var(--shop-ink-subtle)' }}
      >
        <Link href={`/t/${slug}`} className="transition-colors hover:text-white">
          Inicio
        </Link>
        {product.collection && (
          <>
            <span aria-hidden="true">/</span>
            <Link
              href={`/t/${slug}?coleccion=${encodeURIComponent(product.collection)}`}
              className="transition-colors hover:text-white"
            >
              {product.collection}
            </Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page" style={{ color: 'var(--accent)' }}>
          {product.title}
        </span>
      </nav>

      <div className="flex flex-col gap-8 md:flex-row md:gap-12 lg:gap-16">
        <div className="w-full md:w-[55%]">
          <ProductGallery
            images={product.images}
            title={product.title}
            collection={product.collection}
            onSale={product.compareAtPrice > product.price}
            soldOut={isSoldOut(product)}
          />
        </div>

        <div className="w-full space-y-6 md:w-[45%]">
          <BuyPanel
            product={product}
            settings={settings}
            showStock={settings.features.showStock}
            productUrl={canonical || productPath}
          />

          {settings.shippingZones.length > 0 && (
            <div className="border-t pt-5" style={{ borderColor: 'var(--shop-line)' }}>
              <p className="shop-eyebrow">Envíos</p>
              <ul className="mt-3 space-y-1">
                {settings.shippingZones.map((zone) => (
                  <li
                    key={zone.id}
                    className="shop-mono flex justify-between gap-4 text-xs"
                    style={{ color: 'var(--shop-ink-muted)' }}
                  >
                    <span className="uppercase tracking-widest">{zone.label}</span>
                    <span style={{ color: zone.cost === 0 ? 'var(--accent)' : undefined }}>
                      {zone.cost === 0 ? 'GRATIS' : formatStorePrice(zone.cost, symbol)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {similar.length > 0 && (
        <section className="mt-16 border-t pt-10" style={{ borderColor: 'var(--shop-line-soft)' }}>
          <SectionHeader
            title="Productos similares"
            href={
              product.collection
                ? `/t/${slug}?coleccion=${encodeURIComponent(product.collection)}`
                : `/t/${slug}`
            }
          />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {similar.map((item) => (
              <ProductCard key={item.listingId} slug={slug} product={item} symbol={symbol} />
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="mt-14">
          <SectionHeader title="Esto puede interesarte" href={`/t/${slug}`} />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {others.map((item) => (
              <ProductCard key={item.listingId} slug={slug} product={item} symbol={symbol} muted />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      {/* `shop-section-title` ya dibuja el guion de acento con ::before. */}
      <h2 className="shop-section-title">{title}</h2>
      <Link
        href={href}
        className="shop-mono shrink-0 text-[10px] uppercase tracking-widest transition-colors hover:text-white"
        style={{ color: 'var(--shop-ink-subtle)' }}
      >
        Ver todo →
      </Link>
    </div>
  );
}

/**
 * Recomendaciones del pie: hasta cuatro de la misma colección o de las otras.
 *
 * ORDEN — la plantilla original mezclaba con `Math.random()`, y acá eso no se
 * puede: esto se renderiza en el servidor, así que un orden aleatorio no
 * coincidiría con el del cliente (rompe la hidratación) y además cambiaría en
 * cada request, de modo que volver atrás mostraría otros productos.
 *
 * El criterio es determinista: primero lo que se puede comprar, después lo
 * destacado por el comercio y, para desempatar, un hash del id de la ficha
 * mezclado con el de la ficha abierta. Así cada producto recomienda un surtido
 * distinto —no siempre los cuatro primeros del catálogo— pero SIEMPRE el mismo
 * para el mismo producto.
 */
function recommend(
  catalog: StorefrontProduct[],
  current: StorefrontProduct,
  scope: 'same' | 'other',
): StorefrontProduct[] {
  const pool = catalog.filter((item) => {
    if (item.productId === current.productId) return false;
    const same = item.collection === current.collection;
    return scope === 'same' ? same : !same;
  });

  const rank = (item: StorefrontProduct) => (isSoldOut(item) ? 2 : 0) + (item.featured ? 0 : 1);

  return pool
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        mixHash(a.listingId, current.listingId) - mixHash(b.listingId, current.listingId),
    )
    .slice(0, 4);
}

/** FNV-1a de dos ids: barato, sin dependencias y estable entre despliegues. */
function mixHash(value: string, seed: string): number {
  let hash = 2166136261;
  const text = `${value}:${seed}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

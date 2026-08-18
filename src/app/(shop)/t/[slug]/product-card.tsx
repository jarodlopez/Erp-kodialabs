import Link from 'next/link';

import { formatStorePrice, isSoldOut, priceLabel } from '@/lib/storefront';
import type { StorefrontProduct } from '@/types/store';
import { ShopImage } from './chrome';

/**
 * Tarjeta de producto de la vitrina.
 *
 * Sin `'use client'` a propósito: no tiene estado, así que se renderiza en el
 * servidor cuando la usa una página y viaja en el bundle solo cuando la
 * importa un componente de cliente (el navegador del catálogo). La reusan la
 * portada, los resultados filtrados y cualquier vista que muestre productos.
 */
export function ProductCard({
  slug,
  product,
  symbol,
  eager,
  muted,
}: {
  slug: string;
  product: StorefrontProduct;
  symbol: string;
  /** Solo para las primeras tarjetas visibles al abrir: evita el lazy load. */
  eager?: boolean;
  /**
   * Atenuada: en escala de grises hasta que el puntero pasa por encima. La usa
   * el bloque de descubrimiento de la ficha ("esto puede interesarte"), que no
   * debe competir visualmente con los productos de la misma colección.
   */
  muted?: boolean;
}) {
  const soldOut = isSoldOut(product);
  const onSale = product.compareAtPrice > 0;

  return (
    <Link
      href={`/t/${slug}/producto/${product.productId}`}
      className={`shop-card flex flex-col${
        muted ? ' grayscale transition-[filter] duration-500 hover:grayscale-0' : ''
      }`}
      aria-label={product.title}
    >
      <div className="shop-media">
        <ShopImage src={product.images[0] ?? null} alt={product.title} width={800} eager={eager} />

        {product.collection && (
          <span className="shop-badge shop-badge-light absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] truncate">
            {product.collection}
          </span>
        )}

        {onSale && (
          <span className="shop-badge shop-badge-accent absolute right-2 top-2 z-10">Oferta</span>
        )}

        {/* El agotado tapa la foto entera: es la única forma de que se lea
            antes que el precio y nadie llegue a la ficha con la ilusión de
            poder comprarlo. */}
        {soldOut && (
          <span
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ background: 'rgb(0 0 0 / 0.62)' }}
          >
            <span className="shop-badge shop-badge-out px-3 py-1">Agotado</span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 md:p-4">
        <h3 className="shop-display line-clamp-2 text-xl md:text-2xl">{product.title}</h3>

        <p className="shop-mono mt-auto flex flex-wrap items-baseline gap-x-2 pt-1 text-sm">
          <span className="font-bold" style={{ color: 'var(--accent)' }}>
            {priceLabel(product, symbol)}
          </span>
          {onSale && (
            <span className="text-xs line-through" style={{ color: 'var(--shop-ink-subtle)' }}>
              {formatStorePrice(product.compareAtPrice, symbol)}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

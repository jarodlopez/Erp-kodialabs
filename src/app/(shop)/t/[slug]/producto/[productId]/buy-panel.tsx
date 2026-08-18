'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatStorePrice, whatsappHref } from '@/lib/storefront';
import type { StoreSettings, StorefrontProduct } from '@/types/store';
import { useCart } from '../../cart';

/**
 * Selector de variante y alta al carrito.
 *
 * Lo único que viaja al servidor al confirmar el pedido es el `productId` de
 * la opción elegida —que es un producto real del ERP— y la cantidad. El precio
 * que se muestra aquí es informativo: el checkout lo vuelve a calcular.
 */
export function BuyPanel({
  product,
  settings,
  showStock,
}: {
  product: StorefrontProduct;
  settings: StoreSettings;
  showStock: boolean;
}) {
  const router = useRouter();
  const { add } = useCart();

  const firstAvailable = product.options.find((option) => option.available) ?? product.options[0];
  const [selectedId, setSelectedId] = useState(firstAvailable.productId);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const selected =
    product.options.find((option) => option.productId === selectedId) ?? firstAvailable;

  const symbol = settings.branding.currencySymbol;
  const maxQuantity = Math.max(1, Math.floor(selected.stock / 1000));
  const hasVariants = product.options.length > 1 || selected.label !== 'ÚNICA';
  // El enlace de WhatsApp viaja fuera del sitio, así que necesita la URL
  // absoluta; en el primer render del servidor todavía no hay `window`.
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  function onAdd() {
    if (!selected.available) return;
    add({
      productId: selected.productId,
      listingId: product.listingId,
      title: product.title,
      variantLabel: selected.label === 'ÚNICA' ? null : selected.label,
      unitPrice: selected.price,
      quantity: Math.min(quantity, maxQuantity),
      imageUrl: product.images[0] ?? null,
    });
    setAdded(true);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-3">
        <p className="shop-display text-4xl" style={{ color: 'var(--accent)' }}>
          {formatStorePrice(selected.price, symbol)}
        </p>
        {product.compareAtPrice > 0 && (
          <p className="text-base line-through" style={{ color: 'var(--shop-ink-subtle)' }}>
            {formatStorePrice(product.compareAtPrice, symbol)}
          </p>
        )}
      </div>

      {hasVariants && (
        <div>
          <p className="shop-label">{settings.branding.variantLabel}</p>
          <div className="flex flex-wrap gap-2">
            {product.options.map((option) => {
              const isSelected = option.productId === selected.productId;
              return (
                <button
                  key={option.productId}
                  type="button"
                  disabled={!option.available}
                  onClick={() => {
                    setSelectedId(option.productId);
                    setQuantity(1);
                    setAdded(false);
                  }}
                  className="border px-4 py-2 text-sm font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through"
                  style={{
                    borderColor: isSelected ? 'var(--accent)' : 'var(--shop-line)',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? '#000' : 'var(--shop-ink)',
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showStock && selected.available && (
        <p className="text-xs" style={{ color: 'var(--shop-ink-muted)' }}>
          {maxQuantity} disponible(s)
        </p>
      )}

      {selected.available ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-24">
            <label className="shop-label" htmlFor="quantity">
              Cantidad
            </label>
            <input
              id="quantity"
              type="number"
              className="shop-input"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(event) => {
                const next = Number(event.target.value);
                setQuantity(Number.isFinite(next) ? Math.min(Math.max(1, next), maxQuantity) : 1);
                setAdded(false);
              }}
            />
          </div>
          <button type="button" className="shop-btn flex-1" onClick={onAdd}>
            {added ? '✓ Agregado' : 'Agregar al carrito'}
          </button>
        </div>
      ) : (
        <p
          className="border px-4 py-3 text-sm font-bold uppercase tracking-widest"
          style={{ borderColor: 'var(--shop-line)', color: 'var(--shop-ink-muted)' }}
        >
          Agotado por ahora
        </p>
      )}

      {added && (
        <a href={`/t/${settings.slug}/checkout`} className="shop-btn shop-btn-outline w-full">
          Ir al carrito
        </a>
      )}

      {settings.features.whatsappButton && settings.branding.whatsapp && (
        <a
          className="block text-xs underline"
          style={{ color: 'var(--shop-ink-muted)' }}
          target="_blank"
          rel="noopener noreferrer"
          href={whatsappHref(settings.branding.whatsapp, settings.branding.name, {
            title: product.title,
            variantLabel: selected.label === 'ÚNICA' ? null : selected.label,
            price: formatStorePrice(selected.price, symbol),
            url: `${origin}/t/${settings.slug}/producto/${product.productId}`,
          })}
        >
          Preguntar por este producto por WhatsApp
        </a>
      )}
    </div>
  );
}

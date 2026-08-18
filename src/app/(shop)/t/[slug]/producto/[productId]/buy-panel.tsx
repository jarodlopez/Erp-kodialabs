'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';

import { fromScaledQty } from '@/lib/money';
import { formatStorePrice, whatsappHref } from '@/lib/storefront';
import type { StoreSettings, StorefrontOption, StorefrontProduct } from '@/types/store';
import { useCart } from '../../cart';

/**
 * Mitad derecha de la ficha: lo que efectivamente vende.
 *
 * CONTRATO DE DATOS — la opción elegida define el `productId` que entra al
 * carrito, y ese `productId` es un producto real del ERP: es lo único que el
 * servidor acepta y lo único que vuelve a resolver al crear el pedido. El
 * precio de esta pantalla es informativo; el checkout lo recalcula desde el
 * catálogo, así que un carrito editado a mano no cambia lo que se cobra.
 *
 * Tope de cantidad: `option.stock` es una cantidad ESCALADA (1500 = 1.5), de
 * ahí `fromScaledQty`. Un producto sin control de inventario —un servicio—
 * llega disponible y con existencia 0, y en ese caso el tope no puede salir de
 * la existencia.
 */

/** Tope de cortesía para lo que no lleva inventario; nadie pide 100 en línea. */
const UNTRACKED_MAX = 99;

/** Bajo este número de unidades la ficha empuja con urgencia, no con un dato. */
const LOW_STOCK = 5;

/** Suscripción inerte: solo sirve para distinguir servidor de navegador. */
function neverChanges(): () => void {
  return () => undefined;
}

export function BuyPanel({
  product,
  settings,
  showStock,
  productUrl,
}: {
  product: StorefrontProduct;
  settings: StoreSettings;
  showStock: boolean;
  /** URL pública de esta ficha, resuelta en el servidor, para compartir. */
  productUrl: string;
}) {
  const { add } = useCart();

  const firstAvailable = product.options.find((option) => option.available) ?? product.options[0];
  const [selectedId, setSelectedId] = useState(firstAvailable.productId);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const selected =
    product.options.find((option) => option.productId === selectedId) ?? firstAvailable;

  // En despliegues sin dominio configurado el servidor no conoce el origen y
  // manda una ruta relativa, que en un mensaje de WhatsApp no sirve de nada. Se
  // asciende a URL absoluta con el mismo recurso que usa el carrito para saber
  // si ya está en el navegador: la instantánea del servidor es la del servidor y
  // la del cliente la real, sin desajuste de hidratación y sin un `useEffect`
  // que dispare un render en cascada.
  const shareUrl = useSyncExternalStore(
    neverChanges,
    () => `${window.location.origin}${window.location.pathname}`,
    () => productUrl,
  );

  const symbol = settings.branding.currencySymbol;
  const units = Math.floor(fromScaledQty(selected.stock));
  const maxQuantity = units > 0 ? units : UNTRACKED_MAX;
  const priceText = formatStorePrice(selected.price, symbol);

  // Con oferta, `compareAtPrice` es el precio de lista de la ficha completa: se
  // tacha solo si de verdad está por encima de la opción elegida.
  const onSale = product.compareAtPrice > selected.price;
  const discount = onSale
    ? Math.round(((product.compareAtPrice - selected.price) / product.compareAtPrice) * 100)
    : 0;

  const hasVariants = product.options.length > 1 || selected.label !== 'ÚNICA';
  const variantLabel = selected.label === 'ÚNICA' ? null : selected.label;
  const cartHref = `/t/${settings.slug}/checkout`;

  function pick(option: StorefrontOption) {
    setSelectedId(option.productId);
    setQuantity(1);
    setAdded(false);
  }

  function changeQuantity(next: number) {
    setQuantity(Number.isFinite(next) ? Math.min(Math.max(1, Math.trunc(next)), maxQuantity) : 1);
    setAdded(false);
  }

  function onAdd() {
    if (!selected.available) return;
    add({
      productId: selected.productId,
      listingId: product.listingId,
      title: product.title,
      variantLabel,
      unitPrice: selected.price,
      quantity: Math.min(quantity, maxQuantity),
      imageUrl: product.images[0] ?? null,
    });
    // El carrito vive en `localStorage` y se lee con `useSyncExternalStore`: el
    // contador del header se actualiza solo, sin pedirle nada al servidor.
    setAdded(true);
  }

  const addLabel = selected.available ? 'Añadir al carrito' : 'Agotado';

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        {product.collection && <p className="shop-eyebrow">{product.collection}</p>}
        <h1 className="shop-display text-5xl md:text-7xl">{product.title}</h1>
      </div>

      <p
        className="shop-mono border-b pb-4 text-xs uppercase tracking-widest"
        style={{ color: 'var(--shop-ink-subtle)', borderColor: 'var(--shop-line)' }}
      >
        SKU: <span style={{ color: 'var(--shop-ink)' }}>{selected.sku || 'S/N'}</span>
      </p>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <p
          className="shop-mono text-4xl font-bold leading-none md:text-5xl"
          style={{ color: 'var(--accent)' }}
        >
          {priceText}
        </p>
        {onSale && (
          <>
            <p
              className="shop-mono text-xl line-through"
              style={{ color: 'var(--shop-ink-subtle)' }}
            >
              {formatStorePrice(product.compareAtPrice, symbol)}
            </p>
            {discount > 0 && <span className="shop-badge shop-badge-accent">-{discount}%</span>}
          </>
        )}
      </div>

      {product.description && (
        <p
          className="whitespace-pre-line leading-relaxed"
          style={{ color: 'var(--shop-ink-muted)' }}
        >
          {product.description}
        </p>
      )}

      {product.details.length > 0 && (
        <ul className="space-y-2 border-t pt-5" style={{ borderColor: 'var(--shop-line-soft)' }}>
          {product.details.map((detail) => (
            <li key={detail} className="flex gap-3 text-sm" style={{ color: 'var(--shop-ink)' }}>
              <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
                —
              </span>
              {detail}
            </li>
          ))}
        </ul>
      )}

      {hasVariants && (
        <div className="border-t pt-5" style={{ borderColor: 'var(--shop-line-soft)' }}>
          <p className="shop-label" id="etiqueta-variante">
            Selecciona {settings.branding.variantLabel}
          </p>
          {/* El `pb-5` deja aire para el "AGOT." que cuelga de las agotadas. */}
          <div
            className="flex flex-wrap gap-3 pb-5"
            role="group"
            aria-labelledby="etiqueta-variante"
          >
            {product.options.map((option) => (
              <span key={option.productId} className="relative inline-flex">
                <button
                  type="button"
                  className="shop-swatch"
                  data-selected={option.productId === selected.productId ? 'true' : undefined}
                  disabled={!option.available}
                  aria-label={`${settings.branding.variantLabel} ${option.label}${
                    option.available ? '' : ' (agotada)'
                  }`}
                  onClick={() => pick(option)}
                >
                  {option.label}
                </button>
                {!option.available && (
                  <span
                    aria-hidden="true"
                    className="shop-mono absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold tracking-widest"
                    style={{ color: 'var(--shop-ink-subtle)' }}
                  >
                    AGOT.
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {showStock && selected.available && units > 0 && (
        <p
          className="shop-mono text-xs uppercase tracking-widest"
          style={{ color: units <= LOW_STOCK ? 'var(--accent)' : 'var(--shop-ink-muted)' }}
        >
          {units <= LOW_STOCK ? `¡Últimas ${units} unidades!` : `${units} disponibles`}
        </p>
      )}

      <div className="space-y-4">
        {selected.available && (
          <div className="inline-block">
            <label className="shop-label" htmlFor="cantidad">
              Cantidad
            </label>
            <div
              className="flex items-center rounded-xl border"
              style={{ borderColor: 'var(--shop-line)' }}
            >
              <button
                type="button"
                className="shop-display px-4 py-2 text-2xl leading-none disabled:opacity-30"
                aria-label="Quitar una unidad"
                disabled={quantity <= 1}
                onClick={() => changeQuantity(quantity - 1)}
              >
                −
              </button>
              <input
                id="cantidad"
                type="number"
                inputMode="numeric"
                className="shop-mono w-12 bg-transparent py-2 text-center outline-none"
                min={1}
                max={maxQuantity}
                value={quantity}
                onChange={(event) => changeQuantity(Number(event.target.value))}
              />
              <button
                type="button"
                className="shop-display px-4 py-2 text-2xl leading-none disabled:opacity-30"
                aria-label="Agregar una unidad"
                disabled={quantity >= maxQuantity}
                onClick={() => changeQuantity(quantity + 1)}
              >
                +
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="shop-btn w-full py-4 text-2xl"
          disabled={!selected.available}
          onClick={onAdd}
        >
          {selected.available && <span aria-hidden="true">＋</span>}
          {addLabel}
        </button>
      </div>

      {/* Región viva: quien usa lector de pantalla también se entera de que el
          producto entró al carrito, no solo quien ve el recuadro. */}
      <div aria-live="polite">
        {added && (
          <div
            className="shop-slide-up flex flex-wrap items-center justify-between gap-3 border px-4 py-3"
            style={{ borderColor: 'var(--accent)', background: 'rgb(var(--accent-rgb) / 0.08)' }}
          >
            <p className="shop-mono text-xs uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
              ✓ Agregado{variantLabel ? ` · ${variantLabel}` : ''} × {quantity}
            </p>
            <Link href={cartHref} className="shop-btn-outline" data-active="true">
              {settings.branding.cartTitle}
            </Link>
          </div>
        )}
      </div>

      {settings.features.whatsappButton && settings.branding.whatsapp && (
        <a
          className="shop-mono text-xs uppercase tracking-widest underline"
          style={{ color: 'var(--shop-ink-muted)' }}
          target="_blank"
          rel="noopener noreferrer"
          href={whatsappHref(settings.branding.whatsapp, settings.branding.name, {
            title: product.title,
            variantLabel,
            price: priceText,
            url: shareUrl,
          })}
        >
          Consultar por WhatsApp
        </a>
      )}

      <MobileBar
        priceText={priceText}
        variantLabel={variantLabel}
        available={selected.available}
        added={added}
        addLabel={addLabel}
        cartHref={cartHref}
        cartTitle={settings.branding.cartTitle}
        onAdd={onAdd}
        // El botón flotante de WhatsApp del layout vive fijo abajo a la
        // izquierda y se superpone a esta barra: cuando está activo, el precio
        // arranca después de él en lugar de quedar debajo.
      />
    </div>
  );
}

/**
 * Barra fija de compra en móvil.
 *
 * En teléfono el botón de añadir queda muy por debajo del pliegue —foto,
 * título, descripción, variantes— y ahí se pierden las ventas: esta barra lo
 * mantiene siempre a un pulgar de distancia con el precio a la vista. El
 * `padding-bottom` que evita que tape el contenido lo pone la página.
 */
function MobileBar({
  priceText,
  variantLabel,
  available,
  added,
  addLabel,
  cartHref,
  cartTitle,
  onAdd,
}: {
  priceText: string;
  variantLabel: string | null;
  available: boolean;
  added: boolean;
  addLabel: string;
  cartHref: string;
  cartTitle: string;
  onAdd: () => void;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
      style={{ borderColor: 'var(--shop-line)', background: 'rgb(0 0 0 / 0.96)' }}
    >
      {added && (
        <Link
          href={cartHref}
          className="shop-mono flex items-center justify-center gap-2 py-1.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          ✓ Agregado — Ir a {cartTitle} →
        </Link>
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="shop-mono text-lg font-bold leading-none" style={{ color: 'var(--accent)' }}>
            {priceText}
          </p>
          {variantLabel && (
            <p
              className="shop-mono truncate text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--shop-ink-subtle)' }}
            >
              {variantLabel}
            </p>
          )}
        </div>
        <button
          type="button"
          className="shop-btn flex-1 py-3 text-xl"
          disabled={!available}
          onClick={onAdd}
        >
          {addLabel}
        </button>
      </div>
    </div>
  );
}

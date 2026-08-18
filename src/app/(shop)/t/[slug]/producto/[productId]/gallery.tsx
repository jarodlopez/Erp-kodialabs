'use client';

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';

import { ShopImage } from '../../chrome';

/**
 * Galería de la ficha de producto.
 *
 * Es el único trozo de la mitad izquierda que necesita navegador: cambiar la
 * imagen principal al elegir una miniatura. Se modela como `tablist` porque es
 * exactamente eso —varias pestañas, un solo panel visible— y así el teclado y
 * el lector de pantalla funcionan sin inventar nada: foco móvil (`tabIndex`
 * -1 en las no activas) y flechas para recorrerlas.
 *
 * La imagen principal NO se remonta al cambiar de miniatura (no lleva `key`):
 * reusando el mismo `<img>` el navegador sigue mostrando la foto anterior
 * hasta que decodifica la nueva, en lugar de dejar un hueco gris a medio
 * fundido cada vez que se toca una miniatura.
 */
export function ProductGallery({
  images,
  title,
  collection,
  onSale,
  soldOut,
}: {
  images: string[];
  title: string;
  collection: string | null;
  onSale: boolean;
  soldOut: boolean;
}) {
  const [active, setActive] = useState(0);
  const thumbs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = useCallback((index: number) => {
    setActive(index);
    const thumb = thumbs.current[index];
    thumb?.focus();
    // Sin `behavior: 'smooth'` no hay animación que cortar, así que respeta
    // `prefers-reduced-motion` por omisión y en móvil la tira se acomoda sola.
    thumb?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  // Las flechas cubren los dos ejes porque la tira es horizontal en móvil y
  // vertical en escritorio: el usuario pulsa la que ve.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = images.length - 1;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      select(active === last ? 0 : active + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      select(active === 0 ? last : active - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      select(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      select(last);
    }
  }

  const hasThumbs = images.length > 1;

  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row md:gap-4">
      {hasThumbs && (
        <div
          role="tablist"
          aria-label={`Imágenes de ${title}`}
          onKeyDown={onKeyDown}
          className="shop-no-scrollbar flex shrink-0 gap-3 overflow-x-auto pb-1 md:w-24 md:flex-col md:overflow-visible md:pb-0"
        >
          {images.map((image, index) => {
            const current = index === active;
            return (
              <button
                key={`${image}-${index}`}
                ref={(node) => {
                  thumbs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`galeria-miniatura-${index}`}
                aria-selected={current}
                aria-controls="galeria-principal"
                aria-label={`Ver imagen ${index + 1} de ${images.length} de ${title}`}
                tabIndex={current ? 0 : -1}
                onClick={() => setActive(index)}
                // `p-0` porque un `button` trae relleno propio y dejaría la
                // miniatura flotando dentro de su recuadro.
                className="shop-media w-20 shrink-0 cursor-pointer rounded-lg border-2 p-0 md:w-full"
                style={{ borderColor: current ? 'var(--accent)' : 'var(--shop-line)' }}
              >
                <ShopImage src={image} alt={`${title} — imagen ${index + 1}`} width={400} />
              </button>
            );
          })}
        </div>
      )}

      <div
        id="galeria-principal"
        role={hasThumbs ? 'tabpanel' : undefined}
        aria-labelledby={hasThumbs ? `galeria-miniatura-${active}` : undefined}
        className="relative w-full overflow-hidden rounded-xl border"
        style={{ borderColor: 'var(--shop-line)' }}
      >
        <div className="shop-media">
          <ShopImage
            src={images[active] ?? null}
            alt={`${title}${hasThumbs ? ` — imagen ${active + 1}` : ''}`}
            width={1600}
            eager
          />
        </div>

        {collection && (
          <span className="shop-badge shop-badge-light absolute left-3 top-3">{collection}</span>
        )}
        {soldOut ? (
          <span className="shop-badge shop-badge-out absolute right-3 top-3">Agotado</span>
        ) : (
          onSale && (
            <span className="shop-badge shop-badge-accent absolute right-3 top-3">Oferta</span>
          )
        )}

        {hasThumbs && (
          <p
            className="shop-mono absolute bottom-3 right-3 px-2 py-1 text-[10px] tracking-widest"
            style={{ background: 'rgb(0 0 0 / 0.7)', color: 'var(--shop-ink-muted)' }}
          >
            {active + 1}/{images.length}
          </p>
        )}
      </div>
    </div>
  );
}

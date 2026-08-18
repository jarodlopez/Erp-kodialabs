'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { optimizeImg } from '@/lib/images';
import { whatsappHref } from '@/lib/storefront';
import type { StoreBanner, StoreSettings } from '@/types/store';
import { useCart } from './cart';

/**
 * Piezas del sitio público que necesitan estado en el navegador: el contador
 * del carrito, el pop-up de bienvenida y el botón de WhatsApp. Todo lo demás
 * de la tienda se renderiza en el servidor.
 */

/**
 * Imagen del catálogo.
 *
 * Aparece con un fundido al terminar de cargar —así el escaparate no muestra
 * huecos blancos mientras baja— y si el proxy de optimización falla, cae a la
 * URL original de ImgBB en lugar de dejar la tarjeta vacía.
 */
export function ShopImage({
  src,
  alt,
  width,
  eager,
  className,
}: {
  src: string | null;
  alt: string;
  width?: number;
  eager?: boolean;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className="shop-mono flex h-full w-full items-center justify-center text-[10px] tracking-widest"
        style={{ color: 'var(--shop-ink-subtle)' }}
      >
        SIN IMAGEN
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={optimizeImg(src, width)}
      data-fallback={src}
      alt={alt}
      className={`shop-img-fade ${className ?? ''}`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onLoad={(event) => event.currentTarget.classList.add('shop-img-loaded')}
      onError={(event) => {
        const original = event.currentTarget.dataset.fallback;
        if (original && event.currentTarget.src !== original) {
          event.currentTarget.src = original;
        }
        event.currentTarget.classList.add('shop-img-loaded');
      }}
    />
  );
}

/** Logo: la imagen del comercio o, si no subió ninguna, su nombre en neón. */
export function BrandLogo({ settings }: { settings: StoreSettings }) {
  if (settings.branding.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={optimizeImg(settings.branding.logoUrl, 400)}
        alt={settings.branding.name}
        className="h-9 w-auto object-contain md:h-12"
        draggable={false}
      />
    );
  }

  return (
    <span className="shop-display shop-neon text-3xl md:text-5xl">{settings.branding.name}</span>
  );
}

export function StoreHeader({ settings }: { settings: StoreSettings }) {
  const { count, ready } = useCart();
  const base = `/t/${settings.slug}`;

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{ borderColor: 'var(--shop-line-soft)', background: 'rgb(0 0 0 / 0.95)' }}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Link href={base} aria-label={settings.branding.name}>
          <BrandLogo settings={settings} />
        </Link>

        <Link
          href={`${base}/checkout`}
          className="shop-btn-outline relative"
          aria-label={`${settings.branding.cartTitle}: ${ready ? count : 0}`}
        >
          <CartIcon />
          <span className="hidden sm:inline">{settings.branding.cartTitle}</span>
          {ready && count > 0 && (
            <span
              className="shop-display absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-sm"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {count}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}

function CartIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

export function WhatsAppButton({ phone, brandName }: { phone: string; brandName: string }) {
  return (
    <a
      href={whatsappHref(phone, brandName)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-6 left-4 z-50 flex items-center justify-center rounded-full transition-transform hover:scale-110"
      style={{
        height: 52,
        width: 52,
        background: '#25D366',
        boxShadow: '0 4px 20px rgba(37,211,102,0.45), 0 2px 8px rgba(0,0,0,0.5)',
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="#000" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  );
}

/**
 * Pop-up de bienvenida. Se muestra una vez por sesión del navegador: volver a
 * lanzarlo en cada navegación convierte una promoción en una molestia.
 */
export function StorePopup({ banner, slug }: { banner: StoreBanner; slug: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = `kodia_store_popup:${slug}:${banner.id}`;
    if (window.sessionStorage.getItem(key)) return;

    const timer = window.setTimeout(() => {
      setOpen(true);
      try {
        window.sessionStorage.setItem(key, '1');
      } catch {
        // Sin sessionStorage el pop-up reaparece; no es motivo para fallar.
      }
    }, banner.delaySeconds * 1000);

    return () => window.clearTimeout(timer);
  }, [banner.id, banner.delaySeconds, slug]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.95)' }}
      role="dialog"
      aria-modal="true"
      aria-label={banner.title}
      onClick={() => setOpen(false)}
    >
      <div
        className="shop-slide-up w-full max-w-sm overflow-hidden rounded-2xl border"
        style={{ background: 'var(--shop-surface-2)', borderColor: 'var(--shop-line)' }}
        onClick={(event) => event.stopPropagation()}
      >
        {banner.imageUrl && (
          <div className="shop-media" style={{ aspectRatio: '16 / 9' }}>
            <ShopImage src={banner.imageUrl} alt={banner.title} width={800} eager />
          </div>
        )}
        <div className="space-y-3 p-6">
          <h2 className="shop-display text-3xl" style={{ color: 'var(--accent)' }}>
            {banner.title}
          </h2>
          {banner.message && (
            <p className="text-sm" style={{ color: 'var(--shop-ink-muted)' }}>
              {banner.message}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            {banner.ctaHref && (
              <a href={banner.ctaHref} className="shop-btn flex-1">
                {banner.ctaLabel || 'Ver más'}
              </a>
            )}
            <button
              type="button"
              className="shop-btn-outline flex-1 justify-center py-3"
              onClick={() => setOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

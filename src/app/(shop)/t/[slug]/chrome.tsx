'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { optimizeImg } from '@/lib/images';
import { whatsappHref } from '@/lib/storefront';
import type { StoreBanner, StoreSettings } from '@/types/store';
import { useCart } from './cart';

/**
 * Piezas visuales del sitio público que necesitan estado en el navegador:
 * el contador del carrito, el pop-up de bienvenida y el botón de WhatsApp.
 * Todo lo demás de la tienda se renderiza en el servidor.
 */

/** Imagen con aparición suave y regreso automático a la URL original. */
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
        className={`flex h-full w-full items-center justify-center text-xs ${className ?? ''}`}
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
        // Si el proxy de imágenes falla, se cae a la URL original de ImgBB en
        // lugar de dejar un hueco en la vitrina.
        const original = event.currentTarget.dataset.fallback;
        if (original && event.currentTarget.src !== original) {
          event.currentTarget.src = original;
        }
        event.currentTarget.classList.add('shop-img-loaded');
      }}
    />
  );
}

export function StoreHeader({ settings }: { settings: StoreSettings }) {
  const { count, ready } = useCart();
  const base = `/t/${settings.slug}`;

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{ borderColor: 'var(--shop-line)', background: 'rgb(10 10 10 / 0.92)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={base} className="flex items-center gap-3">
          {settings.branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={optimizeImg(settings.branding.logoUrl, 400)}
              alt={settings.branding.name}
              className="h-9 w-auto object-contain sm:h-11"
              draggable={false}
            />
          ) : (
            <span className="shop-display text-2xl sm:text-3xl">{settings.branding.name}</span>
          )}
        </Link>

        <Link
          href={`${base}/checkout`}
          className="relative inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-widest"
          style={{ color: 'var(--shop-ink)' }}
        >
          {settings.branding.cartTitle}
          <span
            className="inline-flex h-6 min-w-6 items-center justify-center px-1.5 text-xs font-bold"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            {ready ? count : 0}
          </span>
        </Link>
      </div>
    </header>
  );
}

export function WhatsAppButton({
  phone,
  brandName,
}: {
  phone: string;
  brandName: string;
}) {
  return (
    <a
      href={whatsappHref(phone, brandName)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-6 left-4 z-50 flex h-13 w-13 items-center justify-center rounded-full transition-transform hover:scale-110"
      style={{
        height: 52,
        width: 52,
        background: '#25D366',
        boxShadow: '0 4px 20px rgba(37,211,102,0.45)',
      }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="#000" aria-hidden="true">
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.8)' }}
      role="dialog"
      aria-modal="true"
      aria-label={banner.title}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-sm border"
        style={{ background: 'var(--shop-surface)', borderColor: 'var(--shop-line)' }}
        onClick={(event) => event.stopPropagation()}
      >
        {banner.imageUrl && (
          <div className="shop-media" style={{ aspectRatio: '16 / 9' }}>
            <ShopImage src={banner.imageUrl} alt={banner.title} width={800} eager />
          </div>
        )}
        <div className="space-y-3 p-5">
          <h2 className="shop-display text-2xl">{banner.title}</h2>
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
              className="shop-btn shop-btn-outline flex-1"
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

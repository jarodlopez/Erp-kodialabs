import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { storeBannerRepository, storeSettingsRepository } from '@/lib/repositories/store';
import { storeUrl } from '@/lib/storefront';
import type { StoreSettings } from '@/types/store';
import '../../shop.css';
import { CartProvider } from './cart';
import { StoreHeader, StorePopup, WhatsAppButton } from './chrome';

/**
 * Sitio público de una tienda.
 *
 * Vive fuera del grupo `(app)`, así que ninguna de estas rutas exige sesión.
 * La organización se resuelve por el slug de la URL —jamás llega del
 * navegador— y una tienda en borrador simplemente no existe para el visitante.
 */

/** Convierte `#1a2b3c` en `26 43 60`, para usar el color con opacidad en CSS. */
function accentChannels(hex: string): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return '255 255 255';
  return `${parseInt(match[1], 16)} ${parseInt(match[2], 16)} ${parseInt(match[3], 16)}`;
}

async function loadStore(slug: string): Promise<StoreSettings> {
  const settings = await storeSettingsRepository.findBySlug(slug);
  if (!settings || settings.status !== 'PUBLISHED') notFound();
  return settings;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const settings = await storeSettingsRepository.findBySlug(slug);

  if (!settings || settings.status !== 'PUBLISHED') {
    return { title: 'Tienda no disponible', robots: { index: false, follow: false } };
  }

  const description =
    settings.seoDescription ?? `Compra en línea en ${settings.branding.name}.`;

  return {
    title: { default: settings.branding.name, template: `%s · ${settings.branding.name}` },
    description,
    // A diferencia del panel, la tienda SÍ quiere ser indexada.
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      title: settings.branding.name,
      description,
      url: storeUrl(settings.slug),
      images: settings.branding.logoUrl ? [settings.branding.logoUrl] : undefined,
    },
  };
}

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const settings = await loadStore(slug);

  const banners = settings.features.popups
    ? await storeBannerRepository.list(settings.organizationId, true)
    : [];
  const popup = banners[0] ?? null;

  const marquee = settings.branding.marqueeText;

  return (
    <CartProvider slug={settings.slug}>
      <div
        className="shop-root"
        style={
          {
            '--accent': settings.branding.accentColor,
            '--accent-rgb': accentChannels(settings.branding.accentColor),
          } as React.CSSProperties
        }
      >
        {marquee && (
          <div className="shop-marquee">
            {/* El texto va duplicado para que el desplazamiento no deje huecos. */}
            <span>
              {`${marquee} · `.repeat(4)}
              {`${marquee} · `.repeat(4)}
            </span>
          </div>
        )}

        <StoreHeader settings={settings} />

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>

        <footer
          className="mt-16 border-t px-4 py-10 sm:px-6"
          style={{ borderColor: 'var(--shop-line)' }}
        >
          <div className="mx-auto max-w-6xl space-y-2">
            <p className="shop-display text-xl">{settings.branding.name}</p>
            {settings.seoDescription && (
              <p className="max-w-prose text-sm" style={{ color: 'var(--shop-ink-muted)' }}>
                {settings.seoDescription}
              </p>
            )}
            {settings.branding.whatsapp && (
              <p className="text-sm" style={{ color: 'var(--shop-ink-muted)' }}>
                WhatsApp: {settings.branding.whatsapp}
              </p>
            )}
          </div>
        </footer>

        {settings.features.whatsappButton && settings.branding.whatsapp && (
          <WhatsAppButton
            phone={settings.branding.whatsapp}
            brandName={settings.branding.name}
          />
        )}

        {popup && <StorePopup banner={popup} slug={settings.slug} />}
      </div>
    </CartProvider>
  );
}

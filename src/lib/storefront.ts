/**
 * Utilidades compartidas por el sitio público de la tienda.
 *
 * Corre en servidor y navegador: nada de `server-only` ni de Firebase aquí.
 */
import { toMajorUnits } from './money';
import type { StorefrontProduct } from '@/types/store';

/**
 * Formatea un precio con el símbolo que configuró la tienda.
 *
 * La tienda usa el símbolo suelto (`C$ 1,250`) en lugar del formateo ISO del
 * ERP: es lo que espera un comprador y permite que cada cliente ponga el suyo
 * sin depender del código de moneda de la organización.
 */
export function formatStorePrice(minor: number, symbol: string): string {
  const major = toMajorUnits(minor);
  const hasCents = Math.abs(major % 1) > 0.0001;
  const text = new Intl.NumberFormat('es-NI', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(major);
  return `${symbol} ${text}`;
}

/** Línea del carrito tal como vive en `localStorage`. */
export interface CartLine {
  /** Producto real del ERP: es lo único que el servidor vuelve a resolver. */
  productId: string;
  listingId: string;
  title: string;
  variantLabel: string | null;
  /** Precio visto al agregar. Solo informativo: el servidor recalcula. */
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
}

export const CART_STORAGE_KEY = 'kodia_store_cart';

/** Suma de las líneas del carrito en centavos, según los precios vistos. */
export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((acc, line) => acc + line.unitPrice * line.quantity, 0);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((acc, line) => acc + line.quantity, 0);
}

/** Texto de precio de una tarjeta: contempla ofertas y rangos por variante. */
export function priceLabel(product: StorefrontProduct, symbol: string): string {
  const price = formatStorePrice(product.price, symbol);
  return product.priceVaries ? `desde ${price}` : price;
}

/** `true` si ninguna de las opciones de la ficha tiene existencias. */
export function isSoldOut(product: StorefrontProduct): boolean {
  return product.options.every((option) => !option.available);
}

/** Mensaje de WhatsApp con el detalle del producto que está mirando el cliente. */
export function whatsappHref(
  phone: string,
  brandName: string,
  context?: { title: string; variantLabel: string | null; price: string; url: string },
): string {
  const lines = context
    ? [
        `Hola ${brandName} 👋 Me interesa este producto:`,
        '',
        context.title,
        context.variantLabel ? `Variante: ${context.variantLabel}` : null,
        `Precio: ${context.price}`,
        context.url,
      ].filter((line): line is string => line !== null)
    : [`Hola ${brandName} 👋 Quiero más información sobre sus productos.`];

  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

/**
 * Dominio público del despliegue.
 *
 * El orden importa porque este enlace se pega en redes sociales y tiene que
 * seguir funcionando mañana:
 *  1. `NEXT_PUBLIC_SITE_URL` — el dominio propio, si se configuró. Manda.
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — el dominio estable de producción que
 *     Vercel expone solo. Sirve aunque nadie configure nada.
 *  3. `VERCEL_URL` — ÚLTIMO recurso: es la URL de ESE despliegue y cambia con
 *     cada push, así que no se puede compartir. Solo vale para previsualizar.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  const deployment = process.env.VERCEL_URL;
  if (deployment) return `https://${deployment}`;

  return '';
}

/** `true` si el enlace que se va a mostrar es estable y se puede compartir. */
export function siteOriginIsShareable(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL,
  );
}

/** URL pública absoluta de una tienda, para compartir y para los metadatos. */
export function storeUrl(slug: string, path = ''): string {
  return `${siteOrigin()}/t/${slug}${path}`;
}

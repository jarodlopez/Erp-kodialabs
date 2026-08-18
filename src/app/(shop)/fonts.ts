import { Bebas_Neue, Plus_Jakarta_Sans, Space_Mono } from 'next/font/google';

/**
 * Tipografías de la tienda.
 *
 * Son las tres de la plantilla Kodia Shop y cargan la identidad del sitio:
 * sin ellas el escaparate se ve genérico. `next/font` las descarga en el
 * build y las AUTOHOSPEDA, así que en producción no hay petición a Google, no
 * hay parpadeo de texto sin fuente y no se filtra la visita del comprador a un
 * tercero.
 *
 * El panel del ERP sigue con la tipografía del sistema: estas solo se aplican
 * bajo el grupo de rutas `(shop)`.
 */

/** Titulares: condensada, en versales. Es la voz de la marca. */
export const displayFont = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--shop-font-display',
  // Si la fuente no llegara a cargar, el ajuste evita que el salto de
  // tipografía descoloque el diseño.
  adjustFontFallback: true,
  fallback: ['Arial Narrow', 'system-ui', 'sans-serif'],
});

/** Precios, SKU y datos: monoespaciada, para que las cifras se alineen. */
export const monoFont = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--shop-font-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
});

/** Texto corrido: descripciones, formularios, etiquetas. */
export const bodyFont = Plus_Jakarta_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--shop-font-body',
  fallback: ['system-ui', 'sans-serif'],
});

/** Clase que activa las tres variables. Se aplica en el layout de la tienda. */
export const shopFontClass = `${displayFont.variable} ${monoFont.variable} ${bodyFont.variable}`;

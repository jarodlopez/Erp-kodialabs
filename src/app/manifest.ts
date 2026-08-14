import type { MetadataRoute } from 'next';

/**
 * Manifest de la PWA. Habilita la instalación en pantalla de inicio y el modo
 * standalone (sin barra del navegador). Los colores siguen la identidad cálida.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kodialabs ERP',
    short_name: 'Kodialabs',
    description:
      'ERP para gestión de inventario, ventas, compras, gastos, finanzas y reportes.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'es',
    dir: 'ltr',
    background_color: '#f4f1ea',
    theme_color: '#f4f1ea',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

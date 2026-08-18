/**
 * Utilidades de imágenes de la tienda online.
 *
 * Este módulo corre en el servidor y en el navegador (lo usan tanto las
 * páginas públicas como el panel), por eso no importa nada de `server-only`.
 */

/** Host donde ImgBB publica los archivos subidos. */
const IMGBB_HOST = /^https?:\/\/i\.ibb\.co\//i;

/**
 * Anchos a los que se normaliza cualquier petición. Tener pocos tamaños hace
 * que todas las vistas compartan la MISMA URL por imagen: la miniatura del
 * carrito reutiliza la variante que ya descargó la vitrina en lugar de
 * generar una nueva en frío en el proxy.
 */
const WIDTH_BUCKETS = [400, 800, 1600] as const;

function bucketFor(width: number): number {
  return WIDTH_BUCKETS.find((bucket) => width <= bucket) ?? WIDTH_BUCKETS[WIDTH_BUCKETS.length - 1];
}

/**
 * Sirve una imagen de ImgBB a través de `wsrv.nl` (sobre Cloudflare), que la
 * convierte a WebP y la redimensiona al vuelo. Optimiza también las imágenes
 * ya subidas, sin volver a subir nada.
 *
 * Las URLs que no son de ImgBB (relativas, `data:`, otro hosting) se devuelven
 * intactas: el proxy solo se interpone donde sabemos que ayuda.
 */
export function optimizeImg(url: string | null | undefined, width?: number): string {
  if (!url || typeof url !== 'string') return '';
  if (!IMGBB_HOST.test(url)) return url;

  const clean = url.replace(/^https?:\/\//i, '');
  const size = width ? `&w=${bucketFor(width)}` : '';
  // we = no agrandar imágenes más pequeñas que el ancho pedido.
  // il = WebP progresivo: se ve algo borroso de inmediato en vez de nada.
  return `https://wsrv.nl/?url=${encodeURIComponent(clean)}${size}&output=webp&q=82&we&il`;
}

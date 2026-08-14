/*
 * Service worker mínimo y CONSERVADOR para la PWA de Kodialabs.
 *
 * Regla de oro para una ERP con datos en vivo y sesión: NO se cachean páginas,
 * datos ni respuestas autenticadas — siempre van a la red para no mostrar
 * información financiera vieja ni filtrar datos entre sesiones. Solo se cachean
 * los assets ESTÁTICOS e inmutables de Next (con hash en el nombre) y los
 * íconos, lo que además da instalabilidad sin riesgo de servir código viejo:
 * un nuevo despliegue trae URLs con hash nuevo.
 */
const STATIC_CACHE = 'kodialabs-static-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isImmutableStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname === '/maskable-512.png' ||
    url.pathname === '/apple-icon.png'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Cache-first SOLO para assets inmutables. Todo lo demás (navegación,
  // acciones de servidor, datos) se deja pasar a la red sin interceptar.
  if (!isImmutableStatic(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })(),
  );
});

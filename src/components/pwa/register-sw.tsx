'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker de la PWA en el cliente. Silencioso: si el
 * navegador no lo soporta o falla, la app sigue funcionando igual.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* sin conexión o no soportado: se ignora */
      });
    };
    // Se espera a que la página cargue para no competir con recursos críticos.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}

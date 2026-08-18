'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import { CART_STORAGE_KEY, cartCount, cartSubtotal, type CartLine } from '@/lib/storefront';

/**
 * Carrito de la tienda.
 *
 * Vive en `localStorage` porque un comprador no tiene sesión y no queremos
 * escribir en la base de datos por cada clic. Los precios que guarda son solo
 * los que vio el cliente: al confirmar el pedido, el servidor vuelve a
 * calcularlo todo desde el catálogo, así que un carrito editado a mano no
 * cambia lo que se cobra.
 *
 * El almacenamiento ES la fuente de verdad —no hay copia en `useState` que
 * sincronizar— y se lee con `useSyncExternalStore`, que además da una
 * instantánea vacía en el servidor y evita el desajuste de hidratación. Como
 * efecto secundario, dos pestañas de la misma tienda comparten el carrito.
 *
 * El carrito se guarda por tienda (`slug`), de modo que dos tiendas alojadas
 * en el mismo dominio no se pisan el contenido.
 */

interface CartApi {
  lines: CartLine[];
  count: number;
  subtotal: number;
  /** `false` durante el render del servidor y la hidratación inicial. */
  ready: boolean;
  add: (line: CartLine) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartApi | null>(null);

const EMPTY: CartLine[] = [];

const listeners = new Set<() => void>();

/**
 * `useSyncExternalStore` exige que dos lecturas seguidas sin cambios
 * devuelvan la MISMA referencia, o React entra en un bucle de renders. Por eso
 * se cachea el texto crudo y solo se vuelve a parsear cuando cambió.
 */
let rawCache = '';
let linesCache: CartLine[] = EMPTY;

function storageKey(slug: string): string {
  return `${CART_STORAGE_KEY}:${slug}`;
}

function isCartLine(value: unknown): value is CartLine {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CartLine).productId === 'string' &&
    typeof (value as CartLine).quantity === 'number'
  );
}

function readLines(slug: string): CartLine[] {
  let raw = '[]';
  try {
    raw = window.localStorage.getItem(storageKey(slug)) ?? '[]';
  } catch {
    // Modo privado estricto: el carrito simplemente no persiste.
  }

  if (raw === rawCache) return linesCache;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }

  rawCache = raw;
  linesCache = Array.isArray(parsed) ? parsed.filter(isCartLine) : EMPTY;
  return linesCache;
}

function writeLines(slug: string, lines: CartLine[]): void {
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(lines));
  } catch {
    // Sin almacenamiento el carrito no sobrevive a la recarga, pero la compra
    // en curso sigue funcionando gracias a la notificación a los suscriptores.
    rawCache = '';
    linesCache = lines;
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Otras pestañas de la misma tienda escriben el mismo `localStorage`.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Suscripción inerte: solo sirve para distinguir servidor de navegador. */
function neverChanges(): () => void {
  return () => undefined;
}

export function CartProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const lines = useSyncExternalStore(
    subscribe,
    () => readLines(slug),
    () => EMPTY,
  );

  const ready = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );

  const add = useCallback(
    (line: CartLine) => {
      const current = readLines(slug);
      const index = current.findIndex((item) => item.productId === line.productId);
      if (index === -1) {
        writeLines(slug, [...current, line]);
        return;
      }
      writeLines(
        slug,
        current.map((item, i) =>
          i === index ? { ...item, quantity: item.quantity + line.quantity } : item,
        ),
      );
    },
    [slug],
  );

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      const current = readLines(slug);
      writeLines(
        slug,
        quantity <= 0
          ? current.filter((line) => line.productId !== productId)
          : current.map((line) => (line.productId === productId ? { ...line, quantity } : line)),
      );
    },
    [slug],
  );

  const remove = useCallback(
    (productId: string) => {
      writeLines(
        slug,
        readLines(slug).filter((line) => line.productId !== productId),
      );
    },
    [slug],
  );

  const clear = useCallback(() => writeLines(slug, []), [slug]);

  const value = useMemo<CartApi>(
    () => ({
      lines,
      count: cartCount(lines),
      subtotal: cartSubtotal(lines),
      ready,
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, ready, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart debe usarse dentro de CartProvider.');
  return context;
}

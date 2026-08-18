'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { StorefrontProduct } from '@/types/store';
import { ProductCard } from './product-card';

/** Productos por página cuando hay filtro, igual que la plantilla. */
const PAGE_SIZE = 12;

/** Productos por sección en la portada curada. Una fila de escritorio. */
const PREVIEW_SIZE = 4;

/** Cuántos números de página se dibujan alrededor del actual. */
const PAGER_WINDOW = 5;

const ALL = 'TODAS';

/**
 * Normaliza para buscar: sin acentos y en minúsculas.
 *
 * El repositorio tiene `normalizeSearch`, pero es `server-only`; replicarlo en
 * cuatro líneas cuesta menos que arrastrar el módulo al navegador.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function CatalogBrowser({
  slug,
  symbol,
  products,
  collections,
  initialCollection,
  latest,
  sectionOffset,
}: {
  slug: string;
  symbol: string;
  /** Catálogo completo, ya ordenado por el servidor. */
  products: StorefrontProduct[];
  collections: string[];
  /** Colección que venía en la URL (`?coleccion=`), si era válida. */
  initialCollection: string | null;
  /** Rotación del orden de las secciones, calculada en el servidor. */
  /** Novedades resueltas en el servidor por fecha de publicación. */
  latest: StorefrontProduct[];
  sectionOffset: number;
}) {
  /*
   * El estado del filtro vive en `useState`, no en la URL.
   *
   * La página es `force-dynamic`: mover el filtro a `searchParams` obligaría a
   * un viaje al servidor —y una lectura de Firestore— por cada chip tocado y
   * por cada tecla del buscador, para recortar una lista que el navegador ya
   * tiene entera. La URL sigue siendo la puerta de entrada (`?coleccion=` se
   * lee en el servidor y siembra este estado), así que un enlace compartido a
   * una colección sigue funcionando; lo que no se serializa es el trasteo.
   */
  const [collection, setCollection] = useState<string | null>(initialCollection);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const resultsRef = useRef<HTMLDivElement>(null);

  /*
   * El bar se pega justo debajo del header del layout, cuyo alto cambia según
   * si el comercio subió logo o usa su nombre en texto. Se mide en vez de
   * cablear un número: fijarlo deja una franja de fondo a la vista o esconde
   * los chips detrás del header.
   */
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);

  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;

    const measure = () => setHeaderHeight(header.getBoundingClientRect().height);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const trimmed = query.trim();
  const isFiltered = collection !== null || trimmed !== '';

  const results = useMemo(() => {
    const needle = fold(trimmed);
    return products.filter((product) => {
      if (collection && product.collection !== collection) return false;
      if (needle && !fold(product.title).includes(needle)) return false;
      return true;
    });
  }, [products, collection, trimmed]);

  // Titular de los resultados: dice exactamente por qué se está filtrando,
  // porque el chip activo puede haber quedado fuera del scroll horizontal.
  const resultsTitle = [collection, trimmed ? `“${trimmed}”` : null]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  // Cambiar de filtro con la página 3 puesta dejaría un vacío falso.
  const safePage = Math.min(page, totalPages);
  const pageItems = results.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function applyFilter(next: string | null) {
    setCollection(next);
    setPage(1);
  }

  function goToPage(next: number) {
    setPage(next);
    // Al paginar hay que volver al principio de la rejilla; si no, el visitante
    // aterriza a mitad de la página nueva.
    resultsRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  if (products.length === 0) {
    return (
      <div className="px-4 md:px-8">
        <EmptyState emoji="🛸" title="Sin productos aún" hint="Vuelve pronto: la vitrina se está llenando." />
      </div>
    );
  }

  return (
    <>
      <div
        id="catalogo"
        className="sticky z-30 border-b px-4 py-4 backdrop-blur-md md:px-8"
        style={{
          top: headerHeight ?? 68,
          borderColor: 'var(--shop-line-soft)',
          background: 'rgb(0 0 0 / 0.95)',
          scrollMarginTop: headerHeight ?? 68,
        }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="shop-no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1">
            <span
              className="shop-mono mr-1 shrink-0 text-[10px] font-bold tracking-[0.18em]"
              style={{ color: 'var(--shop-ink-subtle)' }}
            >
              COLECCIONES:
            </span>
            <button
              type="button"
              className="shop-btn-outline shrink-0"
              data-active={collection === null}
              onClick={() => applyFilter(null)}
            >
              {ALL}
            </button>
            {collections.map((item) => (
              <button
                key={item}
                type="button"
                className="shop-btn-outline shrink-0"
                data-active={collection === item}
                onClick={() => applyFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="relative w-full shrink-0 md:w-64">
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar producto..."
              aria-label="Buscar producto por nombre"
              className="shop-input pr-9"
            />
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--shop-ink-subtle)' }}
              aria-hidden="true"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      <div ref={resultsRef} className="scroll-mt-32 px-4 py-8 md:px-8 md:py-10">
        {isFiltered ? (
          results.length === 0 ? (
            <EmptyState
              emoji="🛸"
              title="No se encontró nada"
              hint="Prueba con otra palabra o mira otra colección."
            />
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between gap-4">
                <h2 className="shop-section-title">{resultsTitle}</h2>
                <p
                  className="shop-mono shrink-0 text-[10px] tracking-[0.18em]"
                  style={{ color: 'var(--shop-ink-subtle)' }}
                >
                  {results.length} PRODUCTO{results.length === 1 ? '' : 'S'}
                </p>
              </div>

              <ProductGrid slug={slug} symbol={symbol} products={pageItems} />

              <Pagination page={safePage} totalPages={totalPages} onGo={goToPage} />
            </>
          )
        ) : (
          <div className="space-y-12">
            {latest.length > 0 && (
              <section>
                <SectionHeader title="Últimas novedades" />
                <ProductGrid slug={slug} symbol={symbol} products={latest} eagerFirst />
              </section>
            )}

            {rotate(collections, sectionOffset).map((item) => {
              const preview = products.filter((product) => product.collection === item);
              if (preview.length === 0) return null;

              return (
                <section
                  key={item}
                  className="border-t pt-10"
                  style={{ borderColor: 'var(--shop-line-soft)' }}
                >
                  <SectionHeader title={item} onViewAll={() => applyFilter(item)} />
                  <ProductGrid
                    slug={slug}
                    symbol={symbol}
                    products={preview.slice(0, PREVIEW_SIZE)}
                  />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Rota el orden de las secciones. El desplazamiento lo calcula el servidor a
 * partir del día, así que la portada se ve distinta cada jornada sin que el
 * cliente y el servidor rendericen cosas diferentes.
 */
function rotate(items: string[], offset: number): string[] {
  if (items.length === 0) return items;
  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function ProductGrid({
  slug,
  symbol,
  products,
  eagerFirst,
}: {
  slug: string;
  symbol: string;
  products: StorefrontProduct[];
  eagerFirst?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 md:gap-8">
      {products.map((product, index) => (
        <ProductCard
          key={product.listingId}
          slug={slug}
          product={product}
          symbol={symbol}
          eager={eagerFirst && index < 2}
        />
      ))}
    </div>
  );
}

function SectionHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      {/* `shop-section-title` ya dibuja el guion de acento. */}
      <h2 className="shop-section-title">{title}</h2>
      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          className="shop-mono shrink-0 text-[10px] font-bold tracking-[0.18em] transition-colors"
          style={{ color: 'var(--accent)', textShadow: '0 0 8px rgb(var(--accent-rgb) / 0.7)' }}
        >
          VER TODO →
        </button>
      )}
    </div>
  );
}

/**
 * Paginación al estilo de la plantilla (← 1 2 3 →).
 *
 * A diferencia del original, la lista de números se recorta a una ventana
 * alrededor de la página actual: con un catálogo grande la plantilla dibujaba
 * treinta botones y rompía el ancho del teléfono.
 */
function Pagination({
  page,
  totalPages,
  onGo,
}: {
  page: number;
  totalPages: number;
  onGo: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const half = Math.floor(PAGER_WINDOW / 2);
  const start = Math.max(1, Math.min(page - half, totalPages - PAGER_WINDOW + 1));
  const end = Math.min(totalPages, start + PAGER_WINDOW - 1);
  const numbers = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Paginación">
      <button
        type="button"
        className="shop-btn-outline shop-page-btn disabled:opacity-30"
        onClick={() => onGo(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
      >
        ←
      </button>

      {numbers.map((number) => (
        <button
          key={number}
          type="button"
          className="shop-btn-outline shop-page-btn shrink-0"
          data-shape="square"
          data-active={number === page}
          aria-label={`Página ${number}`}
          aria-current={number === page ? 'page' : undefined}
          onClick={() => onGo(number)}
        >
          {number}
        </button>
      ))}

      <button
        type="button"
        className="shop-btn-outline shop-page-btn disabled:opacity-30"
        onClick={() => onGo(page + 1)}
        disabled={page === totalPages}
        aria-label="Página siguiente"
      >
        →
      </button>
    </nav>
  );
}

/** Vacío con carácter: emoji grande y titular en Bebas gris, como la plantilla. */
function EmptyState({ emoji, title, hint }: { emoji: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <span className="mb-4 text-5xl" aria-hidden="true">
        {emoji}
      </span>
      <p className="shop-display text-3xl md:text-4xl" style={{ color: 'var(--shop-ink-subtle)' }}>
        {title}
      </p>
      {hint && (
        <p className="shop-mono mt-3 text-[11px] tracking-widest" style={{ color: 'var(--shop-ink-subtle)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

import { searchProductsAction } from '@/app/actions/catalog';
import { Input } from '@/components/ui/primitives';
import { formatMoney } from '@/lib/money';
import type { Product } from '@/types/catalog';

/**
 * Buscador de productos con resultados del servidor.
 * No descarga el catálogo completo al navegador: cada búsqueda consulta el
 * servidor con un límite pequeño.
 */
export function ProductPicker({
  onSelect,
  currency = 'NIO',
  placeholder = 'Buscar producto por nombre o SKU...',
  excludeIds = [],
}: {
  onSelect: (product: Product) => void;
  currency?: string;
  placeholder?: string;
  excludeIds?: string[];
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await searchProductsAction(term);
      if (cancelled) return;
      setResults(result.ok ? result.data.filter((p) => !excludeIds.includes(p.id)) : []);
      setHighlight(0);
      setLoading(false);
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `excludeIds` cambia en cada render del padre; se compara por contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, open, excludeIds.join(',')]);

  const choose = (product: Product) => {
    onSelect(product);
    setTerm('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-subtle)]" />
      <Input
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlight((h) => Math.min(h + 1, results.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (event.key === 'Enter' && results[highlight]) {
            event.preventDefault();
            choose(results[highlight]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="pl-9"
        aria-label="Buscar producto"
      />

      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
          {loading && (
            <p className="px-3 py-3 text-sm text-[var(--color-ink-subtle)]">Buscando…</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-3 text-sm text-[var(--color-ink-subtle)]">
              No se encontraron productos.
            </p>
          )}
          {!loading &&
            results.map((product, index) => (
              <button
                key={product.id}
                type="button"
                onClick={() => choose(product)}
                onMouseEnter={() => setHighlight(index)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  index === highlight ? 'bg-[var(--color-brand-50)]' : 'hover:bg-[var(--color-canvas)]'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--color-ink)]">
                    {product.name}
                  </span>
                  <span className="block text-xs text-[var(--color-ink-subtle)]">
                    {product.sku} · Existencias: {(product.stock / 1000).toLocaleString('es-NI')}
                  </span>
                </span>
                <span className="shrink-0 tabular text-[var(--color-ink)]">
                  {formatMoney(product.salePrice, currency)}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

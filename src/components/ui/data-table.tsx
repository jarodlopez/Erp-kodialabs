'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

import { Button, Input, Select } from './primitives';
import { buildQuery, cn } from '@/lib/utils';

/**
 * Barra de filtros sincronizada con la URL. Mantener el estado en la query
 * permite compartir enlaces, usar el botón "atrás" del navegador y renderizar
 * las páginas en el servidor sin estado de cliente adicional.
 */
export function FilterBar({
  searchPlaceholder = 'Buscar...',
  filters = [],
  children,
}: {
  searchPlaceholder?: string;
  filters?: {
    name: string;
    label: string;
    options: { value: string; label: string }[];
  }[];
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const queryFromUrl = params.get('q') ?? '';

  const apply = (changes: Record<string, string | null>) => {
    startTransition(() => {
      router.push(`${pathname}${buildQuery(params, { ...changes, cursor: null })}`);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-5 py-3">
      {/*
        El campo de búsqueda es no controlado y se reinicia con `key` cuando
        cambia la URL: así el estado vive en un único lugar (la query string) y
        no hace falta sincronizarlo con un efecto.
      */}
      <form
        key={queryFromUrl}
        className="relative min-w-[220px] flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(new FormData(event.currentTarget).get('q') ?? '').trim();
          apply({ q: value || null });
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-subtle)]" />
        <Input
          name="q"
          defaultValue={queryFromUrl}
          placeholder={searchPlaceholder}
          className="pl-9 pr-9"
          aria-label={searchPlaceholder}
        />
        {queryFromUrl && (
          <button
            type="button"
            onClick={() => apply({ q: null })}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-ink-subtle)] hover:bg-[var(--color-canvas)]"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </form>

      {filters.map((filter) => (
        <Select
          key={filter.name}
          value={params.get(filter.name) ?? ''}
          onChange={(event) => apply({ [filter.name]: event.target.value || null })}
          className="w-auto min-w-[150px]"
          aria-label={filter.label}
        >
          <option value="">{filter.label}</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ))}

      {children}
      {isPending && <span className="text-xs text-[var(--color-ink-subtle)]">Actualizando…</span>}
    </div>
  );
}

/** Filtro de rango de fechas sincronizado con la URL. */
export function DateRangeFilter({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const apply = (key: 'from' | 'to', value: string) => {
    router.push(`${pathname}${buildQuery(params, { [key]: value || null, cursor: null })}`);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Input
        type="date"
        value={params.get('from') ?? ''}
        onChange={(event) => apply('from', event.target.value)}
        className="w-auto"
        aria-label="Desde"
      />
      <span className="text-sm text-[var(--color-ink-subtle)]">a</span>
      <Input
        type="date"
        value={params.get('to') ?? ''}
        onChange={(event) => apply('to', event.target.value)}
        className="w-auto"
        aria-label="Hasta"
      />
    </div>
  );
}

/**
 * Paginación por cursor. No se descarga la colección completa: cada página
 * pide exactamente los documentos que muestra.
 */
export function CursorPagination({
  nextCursor,
  hasMore,
  count,
}: {
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const currentCursor = params.get('cursor');

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-[var(--color-ink-subtle)]">
      <span>
        {count} {count === 1 ? 'registro' : 'registros'} en esta página
      </span>
      <div className="flex items-center gap-2">
        {currentCursor && (
          <Link href={`${pathname}${buildQuery(params, { cursor: null })}`}>
            <Button variant="secondary" size="sm">
              <ChevronLeft className="h-4 w-4" /> Inicio
            </Button>
          </Link>
        )}
        {hasMore && nextCursor && (
          <Link href={`${pathname}${buildQuery(params, { cursor: nextCursor })}`}>
            <Button variant="secondary" size="sm">
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import { searchCustomersAction, searchSuppliersAction } from '@/app/actions/parties';
import { Button, Input } from '@/components/ui/primitives';

export interface PartyOption {
  id: string;
  name: string;
  document: string | null;
  outstandingBalance: number;
}

/** Selector de cliente o proveedor con búsqueda en el servidor. */
export function PartyPicker({
  kind,
  value,
  onSelect,
  placeholder,
  allowEmpty = false,
}: {
  kind: 'customer' | 'supplier';
  value: PartyOption | null;
  onSelect: (party: PartyOption | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PartyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result =
        kind === 'customer' ? await searchCustomersAction(term) : await searchSuppliersAction(term);
      if (cancelled) return;
      setResults(
        result.ok
          ? result.data.map((party) => ({
              id: party.id,
              name: party.name,
              document: party.document,
              outstandingBalance: party.stats?.outstandingBalance ?? 0,
            }))
          : [],
      );
      setLoading(false);
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, open, kind]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--color-ink)]">{value.name}</p>
          {value.document && (
            <p className="text-xs text-[var(--color-ink-subtle)]">{value.document}</p>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
          <X className="h-4 w-4" /> Cambiar
        </Button>
      </div>
    );
  }

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
        placeholder={
          placeholder ?? (kind === 'customer' ? 'Buscar cliente...' : 'Buscar proveedor...')
        }
        className="pl-9"
      />

      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
          {allowEmpty && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-canvas)]"
            >
              Sin cliente (venta ocasional)
            </button>
          )}
          {loading && <p className="px-3 py-3 text-sm text-[var(--color-ink-subtle)]">Buscando…</p>}
          {!loading && results.length === 0 && (
            <p className="px-3 py-3 text-sm text-[var(--color-ink-subtle)]">Sin resultados.</p>
          )}
          {!loading &&
            results.map((party) => (
              <button
                key={party.id}
                type="button"
                onClick={() => {
                  onSelect(party);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--color-canvas)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{party.name}</span>
                  {party.document && (
                    <span className="block text-xs text-[var(--color-ink-subtle)]">
                      {party.document}
                    </span>
                  )}
                </span>
                {party.outstandingBalance > 0 && (
                  <span className="shrink-0 text-xs text-[var(--color-warning-700)]">
                    Saldo pendiente
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

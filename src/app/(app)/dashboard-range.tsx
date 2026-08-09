'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button, Input } from '@/components/ui/primitives';
import { toDateInput } from '@/lib/utils';

/** Selector de rango de fechas del dashboard, con atajos comunes. */
export function DashboardRangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const go = (nextFrom: string, nextTo: string) => {
    startTransition(() => {
      router.push(`${pathname}?from=${nextFrom}&to=${nextTo}`);
    });
  };

  const presets = [
    {
      label: 'Hoy',
      run: () => {
        const today = toDateInput();
        go(today, today);
      },
    },
    {
      label: '7 días',
      run: () => {
        const end = new Date();
        const start = new Date(end.getTime() - 6 * 86400000);
        go(toDateInput(start), toDateInput(end));
      },
    },
    {
      label: 'Mes',
      run: () => {
        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        go(toDateInput(start), toDateInput(now));
      },
    },
    {
      label: 'Año',
      run: () => {
        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
        go(toDateInput(start), toDateInput(now));
      },
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] bg-white p-0.5">
        {presets.map((preset) => (
          <Button key={preset.label} variant="ghost" size="sm" onClick={preset.run}>
            {preset.label}
          </Button>
        ))}
      </div>
      <Input
        type="date"
        value={from}
        onChange={(event) => go(event.target.value, to)}
        className="w-auto"
        aria-label="Desde"
      />
      <Input
        type="date"
        value={to}
        onChange={(event) => go(from, event.target.value)}
        className="w-auto"
        aria-label="Hasta"
      />
      {isPending && <span className="text-xs text-[var(--color-ink-subtle)]">Actualizando…</span>}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { buildQuery, cn } from '@/lib/utils';

export function ReportTabs({
  tabs,
  active,
}: {
  tabs: readonly { key: string; label: string }[];
  active: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <nav className="flex flex-wrap gap-1 rounded-lg bg-[var(--color-canvas)] p-1" aria-label="Reportes">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`${pathname}${buildQuery(params, { tab: tab.key })}`}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm transition-colors',
            active === tab.key
              ? 'bg-white font-medium text-[var(--color-ink)] shadow-sm'
              : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
          )}
          aria-current={active === tab.key ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

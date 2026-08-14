import Link from 'next/link';
import type { Metadata } from 'next';

import { NAV_SECTIONS } from '@/components/layout/nav-config';
import { PageHeader } from '@/components/ui/primitives';
import { requireSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Menú' };
export const dynamic = 'force-dynamic';

/**
 * Lanzador tipo app: cuadrícula de accesos con ícono para cada módulo,
 * agrupados por sección y filtrados por los permisos del usuario. Da una
 * apariencia nativa de app móvil como pantalla principal de navegación.
 */
export default async function MenuPage() {
  const session = await requireSession();

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.href !== '/menu' && session.permissions.includes(item.permission),
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <PageHeader title="Menú" description="Todos los módulos a un toque." />

      <div className="space-y-7">
        {sections.map((section) => (
          <section key={section.title ?? 'root'}>
            {section.title && (
              <h2 className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-subtle)]">
                {section.title}
              </h2>
            )}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white p-3 text-center shadow-sm transition-colors hover:border-[var(--color-brand-200)] hover:bg-[var(--color-brand-50)] active:bg-[var(--color-brand-100)]"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="text-xs font-medium leading-tight text-[var(--color-ink)]">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

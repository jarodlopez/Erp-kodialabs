import Link from 'next/link';
import type { Metadata } from 'next';
import type { LucideIcon } from 'lucide-react';
import { Boxes, Receipt, ShoppingCart, Store, Truck } from 'lucide-react';

import { NAV_SECTIONS } from '@/components/layout/nav-config';
import { PageHeader } from '@/components/ui/primitives';
import { requireSession } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { PERMISSIONS, type Permission } from '@/lib/rbac';

export const metadata: Metadata = { title: 'Menú' };
export const dynamic = 'force-dynamic';

type Accent = 'brand' | 'sun' | 'ember';

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  accent: Accent;
}

/** Acciones más frecuentes, mostradas como botones destacados al inicio. */
const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Punto de venta', href: '/pos', icon: Store, permission: PERMISSIONS.SALES_CREATE, accent: 'brand' },
  { label: 'Nueva venta', href: '/ventas/nueva', icon: ShoppingCart, permission: PERMISSIONS.SALES_CREATE, accent: 'sun' },
  { label: 'Nuevo producto', href: '/inventario/nuevo', icon: Boxes, permission: PERMISSIONS.PRODUCTS_CREATE, accent: 'ember' },
  { label: 'Nueva compra', href: '/compras/nueva', icon: Truck, permission: PERMISSIONS.PURCHASES_CREATE, accent: 'brand' },
  { label: 'Registrar gasto', href: '/gastos', icon: Receipt, permission: PERMISSIONS.EXPENSES_CREATE, accent: 'sun' },
];

/** Tarjeta rellena para accesos rápidos, según su acento. */
const QA_CARD: Record<Accent, string> = {
  brand: 'brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.5)]',
  sun: 'tile-sun shadow-[0_8px_20px_-8px_rgba(208,220,23,0.45)]',
  ember: 'tile-ember shadow-[0_8px_20px_-8px_rgba(239,133,68,0.45)]',
};
const QA_CHIP: Record<Accent, string> = {
  brand: 'bg-white/20 text-white',
  sun: 'bg-black/10 text-[var(--color-sun-ink)]',
  ember: 'bg-white/25 text-white',
};

/** Chips de icono para las tarjetas de módulo (vidrio), rotando 3 acentos. */
const TILE_CHIPS: string[] = [
  'bg-[var(--color-brand-50)] text-[var(--color-brand-600)]',
  'bg-[var(--color-sun-100)] text-[var(--color-sun-ink)]',
  'bg-[var(--color-ember-100)] text-[var(--color-ember-700)]',
];

/**
 * Lanzador tipo app: cuadrícula de accesos con ícono para cada módulo,
 * agrupados por sección y filtrados por los permisos del usuario. Sobre el
 * fondo cálido, con tarjetas de vidrio y acentos índigo/amarillo/naranja.
 */
export default async function MenuPage() {
  const session = await requireSession();

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.href !== '/menu' && session.permissions.includes(item.permission),
    ),
  })).filter((section) => section.items.length > 0);

  const quickActions = QUICK_ACTIONS.filter((a) => session.permissions.includes(a.permission));

  // Contador global para que los chips de icono roten de color entre secciones.
  let tileIndex = 0;

  return (
    <>
      <PageHeader title="Menú" description="Todos los módulos a un toque." />

      {quickActions.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-subtle)]">
            Accesos rápidos
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={cn(
                    'tap flex items-center gap-3 rounded-2xl p-3.5',
                    QA_CARD[action.accent],
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      QA_CHIP[action.accent],
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium leading-tight">{action.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

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
                const chip = TILE_CHIPS[tileIndex % TILE_CHIPS.length];
                tileIndex += 1;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="glass-card card-interactive tap flex flex-col items-center gap-2 rounded-2xl p-3 text-center"
                  >
                    <span
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-2xl',
                        chip,
                      )}
                    >
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

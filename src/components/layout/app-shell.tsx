'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  Boxes,
  Building2,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  ShoppingCart,
  Store,
  X,
} from 'lucide-react';

import { NAV_SECTIONS } from './nav-config';
import { Button } from '@/components/ui/primitives';
import { cn, initials } from '@/lib/utils';
import { PERMISSIONS, ROLE_LABELS, type Role } from '@/lib/rbac';

export interface ShellUser {
  name: string;
  email: string;
  role: Role;
  permissions: string[];
  organizationName: string;
}

export function AppShell({
  user,
  onSignOut,
  isSuperAdmin = false,
  children,
}: {
  user: ShellUser;
  onSignOut: (formData: FormData) => void | Promise<void>;
  isSuperAdmin?: boolean;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string, match?: string[]) => {
    if (href === '/') return pathname === '/';
    if (pathname.startsWith(href)) return true;
    return match?.some((m) => pathname.startsWith(m)) ?? false;
  };

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => user.permissions.includes(item.permission)),
  })).filter((section) => section.items.length > 0);

  // Accesos rápidos para la barra inferior en móvil (máximo 4 + "Más").
  const tabCandidates = [
    { label: 'Inicio', href: '/', icon: Home, permission: PERMISSIONS.DASHBOARD_VIEW },
    { label: 'POS', href: '/pos', icon: Store, permission: PERMISSIONS.SALES_CREATE },
    { label: 'Inventario', href: '/inventario', icon: Boxes, permission: PERMISSIONS.INVENTORY_VIEW },
    { label: 'Ventas', href: '/ventas', icon: ShoppingCart, permission: PERMISSIONS.SALES_VIEW },
  ];
  const mobileTabs = tabCandidates
    .filter((t) => user.permissions.includes(t.permission))
    .slice(0, 4);
  // La barra inferior coloca el botón de Menú (lanzador) elevado en el centro,
  // con las pestañas repartidas a los lados.
  const half = Math.ceil(mobileTabs.length / 2);
  const leftTabs = mobileTabs.slice(0, half);
  const rightTabs = mobileTabs.slice(half);
  const menuActive = pathname.startsWith('/menu');

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.title ?? 'root'}>
          {section.title && (
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-subtle)]">
              {section.title}
            </p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href, item.match);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-[var(--color-brand-50)] font-medium text-[var(--color-brand-700)]'
                        : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {isSuperAdmin && (
        <div>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-subtle)]">
            Plataforma
          </p>
          <ul className="space-y-0.5">
            <li>
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                  pathname.startsWith('/admin')
                    ? 'bg-[var(--color-brand-50)] font-medium text-[var(--color-brand-700)]'
                    : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]',
                )}
              >
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="truncate">Administrar plataforma</span>
              </Link>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );

  const brand = (
    <div className="flex h-14 items-center gap-2.5 border-b border-[var(--color-border)] px-5">
      <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm">
        <Store className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
          {user.organizationName}
        </p>
        <p className="text-[11px] text-[var(--color-ink-subtle)]">ERP</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Barra lateral fija en escritorio */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-white lg:flex">
        {brand}
        {nav}
        <UserCard user={user} onSignOut={onSignOut} />
      </aside>

      {/* Barra lateral deslizante en móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative flex h-full w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pr-2">
              <div className="flex-1">{brand}</div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-[var(--color-ink-subtle)]"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            <UserCard user={user} onSignOut={onSignOut} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-white/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-[var(--color-ink-muted)] hover:bg-[var(--color-canvas)]"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-semibold">{user.organizationName}</span>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8">{children}</main>
      </div>

      {/* Barra de navegación inferior (solo móvil) con Menú elevado al centro */}
      <nav className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <div className="flex items-end justify-around border-t border-[var(--color-border)] bg-white/90 px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_30px_-18px_rgba(16,24,40,0.35)] backdrop-blur">
          {leftTabs.map((tab) => (
            <BottomTab key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}

          {/* Botón central elevado: lanzador del menú completo */}
          <Link
            href="/menu"
            aria-label="Menú"
            aria-current={menuActive ? 'page' : undefined}
            className="flex flex-1 flex-col items-center gap-1 py-1 text-[10px] font-medium"
          >
            <span
              className={cn(
                'tap -mt-8 flex h-14 w-14 items-center justify-center rounded-full text-white ring-4 ring-white',
                'brand-gradient shadow-[0_8px_20px_-6px_rgba(79,70,229,0.6)]',
                menuActive && 'ring-[var(--color-brand-100)]',
              )}
            >
              <LayoutGrid className="h-6 w-6" />
            </span>
            <span
              className={cn(
                menuActive ? 'text-[var(--color-brand-600)]' : 'text-[var(--color-ink-muted)]',
              )}
            >
              Menú
            </span>
          </Link>

          {rightTabs.map((tab) => (
            <BottomTab key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Pestaña de la barra inferior, con indicador superior cuando está activa. */
function BottomTab({
  tab,
  active,
}: {
  tab: { label: string; href: string; icon: typeof Home };
  active: boolean;
}) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'tap relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors',
        active ? 'text-[var(--color-brand-600)]' : 'text-[var(--color-ink-muted)]',
      )}
    >
      <span
        className={cn(
          'absolute -top-0.5 h-1 w-6 rounded-full bg-[var(--color-brand-500)] transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden="true"
      />
      <Icon className="h-5 w-5" />
      {tab.label}
    </Link>
  );
}

function UserCard({
  user,
  onSignOut,
}: {
  user: ShellUser;
  onSignOut: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="border-t border-[var(--color-border)] p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-100)] text-xs font-semibold text-[var(--color-brand-700)]">
          {initials(user.name || user.email)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-ink)]">{user.name}</p>
          <p className="truncate text-xs text-[var(--color-ink-subtle)]">
            {ROLE_LABELS[user.role] ?? user.role}
          </p>
        </div>
      </div>
      <form action={onSignOut} className="mt-1">
        <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </Button>
      </form>
    </div>
  );
}

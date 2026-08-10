'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Building2, LogOut, Menu, Store, X } from 'lucide-react';

import { NAV_SECTIONS } from './nav-config';
import { Button } from '@/components/ui/primitives';
import { cn, initials } from '@/lib/utils';
import { ROLE_LABELS, type Role } from '@/lib/rbac';

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
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-500)] text-white">
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

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
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

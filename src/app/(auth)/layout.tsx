import Link from 'next/link';
import { Store } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10">
        <div className="grid w-full gap-12 lg:grid-cols-2 lg:items-center">
          <section className="hidden lg:block">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-brand-500)] text-white">
                <Store className="h-5 w-5" />
              </div>
              <span className="text-lg font-semibold">ERP HomeMart</span>
            </div>
            <h1 className="mt-8 max-w-md text-4xl font-semibold leading-tight tracking-tight text-[var(--color-ink)]">
              Todo tu negocio, en un solo sistema.
            </h1>
            <p className="mt-4 max-w-md text-[var(--color-ink-muted)]">
              Inventario con costo promedio ponderado, ventas y compras con control de existencias,
              caja y bancos, cuentas por cobrar y pagar, y reportes construidos sobre datos reales.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-[var(--color-ink-muted)]">
              {[
                'Operaciones atómicas: nunca queda una venta sin inventario ni asiento.',
                'Permisos granulares por rol y aislamiento estricto por organización.',
                'Auditoría completa de cada movimiento de dinero e inventario.',
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-500)]" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="mx-auto w-full max-w-md">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-brand-500)] text-white">
                <Store className="h-4 w-4" />
              </div>
              <span className="font-semibold">ERP HomeMart</span>
            </div>
            {children}
          </section>
        </div>
      </div>

      <footer className="border-t border-[var(--color-border)] py-4 text-center text-xs text-[var(--color-ink-subtle)]">
        <Link href="/login" className="hover:text-[var(--color-ink)]">
          ERP HomeMart
        </Link>{' '}
        · Sistema de gestión empresarial
      </footer>
    </div>
  );
}

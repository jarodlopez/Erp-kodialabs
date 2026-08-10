import Link from 'next/link';
import { ArrowRight, Check, ShoppingCart, Truck, UsersRound, Boxes, Sparkles } from 'lucide-react';

import { Button, Card } from '@/components/ui/primitives';
import type { OnboardingStatus } from '@/lib/services/dashboard';
import type { LucideIcon } from 'lucide-react';

interface Step {
  key: keyof Omit<OnboardingStatus, 'complete'>;
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: LucideIcon;
}

const STEPS: Step[] = [
  {
    key: 'hasProducts',
    title: 'Agrega tu primer producto',
    description: 'Registra lo que vendes para poder controlar existencias y precios.',
    href: '/inventario/nuevo',
    cta: 'Nuevo producto',
    icon: Boxes,
  },
  {
    key: 'hasParties',
    title: 'Registra un cliente o proveedor',
    description: 'Necesitas al menos uno para facturar ventas o registrar compras.',
    href: '/clientes',
    cta: 'Agregar cliente',
    icon: UsersRound,
  },
  {
    key: 'hasPurchases',
    title: 'Registra tu primera compra',
    description: 'La recepción de mercadería ingresa existencias y calcula el costo.',
    href: '/compras/nueva',
    cta: 'Nueva compra',
    icon: Truck,
  },
  {
    key: 'hasSales',
    title: 'Haz tu primera venta',
    description: 'Al confirmarla se descuenta inventario y se registra el ingreso.',
    href: '/ventas/nueva',
    cta: 'Nueva venta',
    icon: ShoppingCart,
  },
];

/**
 * Guía de primeros pasos para organizaciones nuevas. Reemplaza el dashboard
 * ejecutivo (que estaría en cero) mientras el negocio aún no opera, y marca
 * cada paso según la existencia real de datos.
 */
export function OnboardingChecklist({ status }: { status: OnboardingStatus }) {
  const done = STEPS.filter((step) => status[step.key]).length;
  // El primer paso pendiente es el que recibe el botón destacado.
  const nextIndex = STEPS.findIndex((step) => !status[step.key]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">
              Configura tu negocio en 4 pasos
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-subtle)]">
              Ya creamos por ti la bodega principal, una caja, el impuesto por defecto y las
              categorías de gasto. Completa estos pasos para empezar a operar; el dashboard con tus
              indicadores aparecerá en cuanto registres tu primera venta.
            </p>
          </div>
        </div>

        {/* Progreso */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--color-ink-subtle)]">
            <span>Progreso</span>
            <span>
              {done} de {STEPS.length}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--color-canvas)]">
            <div
              className="h-full rounded-full bg-[var(--color-brand-500)] transition-all"
              style={{ width: `${(done / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </Card>

      <ul className="space-y-3">
        {STEPS.map((step, index) => {
          const complete = status[step.key];
          const isNext = index === nextIndex;
          const Icon = step.icon;
          return (
            <li key={step.key}>
              <Card
                className={
                  isNext
                    ? 'p-4 ring-2 ring-[var(--color-brand-200)]'
                    : 'p-4'
                }
              >
                <div className="flex items-center gap-4">
                  <div
                    className={
                      complete
                        ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-positive-50)] text-[var(--color-positive-700)]'
                        : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-canvas)] text-[var(--color-ink-muted)]'
                    }
                  >
                    {complete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        complete
                          ? 'text-sm font-medium text-[var(--color-ink-subtle)] line-through'
                          : 'text-sm font-medium text-[var(--color-ink)]'
                      }
                    >
                      {step.title}
                    </p>
                    {!complete && (
                      <p className="mt-0.5 text-xs text-[var(--color-ink-subtle)]">
                        {step.description}
                      </p>
                    )}
                  </div>

                  {complete ? (
                    <span className="shrink-0 text-xs font-medium text-[var(--color-positive-700)]">
                      Listo
                    </span>
                  ) : (
                    <Link href={step.href} className="shrink-0">
                      <Button variant={isNext ? 'primary' : 'secondary'} size="sm">
                        {step.cta}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

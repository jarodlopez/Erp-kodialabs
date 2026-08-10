import type { PlanConfig, Subscription, SubscriptionStatus } from '@/types/subscription';

/** Días de prueba gratis para un comercio nuevo. */
export const TRIAL_DAYS = 14;

/**
 * Planes por defecto (semilla). Son solo el punto de partida: el súper-admin
 * puede editar nombres, precios, monedas, duración y límites desde `/admin`, y
 * quedan guardados en la base de datos. `0` en un límite significa ilimitado.
 */
export const DEFAULT_PLANS: PlanConfig[] = [
  {
    key: 'TRIAL',
    name: 'Prueba gratis',
    price: 0,
    currency: 'NIO',
    months: 0,
    isTrial: true,
    limits: { users: 0, products: 0 }, // acceso total durante la prueba
  },
  {
    key: 'EMPRENDEDOR',
    name: 'Emprendedor',
    price: 0,
    currency: 'NIO',
    months: 1,
    limits: { users: 2, products: 100 },
  },
  {
    key: 'NEGOCIO',
    name: 'Negocio',
    price: 0,
    currency: 'NIO',
    months: 1,
    limits: { users: 5, products: 1000 },
  },
  {
    key: 'EMPRESA',
    name: 'Empresa',
    price: 0,
    currency: 'NIO',
    months: 1,
    limits: { users: 0, products: 0 }, // ilimitado
  },
];

export function findPlan(plans: PlanConfig[], key: string): PlanConfig | null {
  return plans.find((p) => p.key === key) ?? null;
}

/** Planes de pago (excluye la prueba). */
export function paidPlans(plans: PlanConfig[]): PlanConfig[] {
  return plans.filter((p) => !p.isTrial);
}

export function planName(plans: PlanConfig[], key: string): string {
  return findPlan(plans, key)?.name ?? key;
}

/** `true` si el valor de un límite es ilimitado (0, nulo o inválido). */
export function isUnlimited(value: number | null | undefined): boolean {
  return !value || value <= 0;
}

function addDaysIso(base: string, days: number): string {
  return new Date(new Date(base).getTime() + days * 86400000).toISOString();
}

export function addMonthsIso(base: string, months: number): string {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export interface EffectiveSubscription {
  status: SubscriptionStatus;
  plan: string;
  validUntil: string;
  allowed: boolean;
  daysLeft: number;
  isTrial: boolean;
}

/**
 * Calcula el estado efectivo de la suscripción SIN escribir en la base:
 *  - Si no existe registro, se sintetiza una prueba desde la fecha de creación.
 *  - SUSPENDED bloquea siempre; vencida (validUntil pasado) bloquea también.
 */
export function effectiveSubscription(
  sub: Subscription | null,
  organizationCreatedAt: string,
  now: number = Date.now(),
): EffectiveSubscription {
  const plan = sub?.plan ?? 'TRIAL';
  const storedStatus = sub?.status ?? 'TRIAL';
  const validUntil = sub?.validUntil ?? addDaysIso(organizationCreatedAt, TRIAL_DAYS);
  const until = new Date(validUntil).getTime();
  const isTrial = storedStatus === 'TRIAL';

  if (storedStatus === 'SUSPENDED') {
    return { status: 'SUSPENDED', plan, validUntil, allowed: false, daysLeft: 0, isTrial: false };
  }
  if (Number.isNaN(until) || now > until) {
    return { status: 'EXPIRED', plan, validUntil, allowed: false, daysLeft: 0, isTrial };
  }
  const daysLeft = Math.ceil((until - now) / 86400000);
  return { status: storedStatus, plan, validUntil, allowed: true, daysLeft, isTrial };
}

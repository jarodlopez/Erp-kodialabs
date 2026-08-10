import type { Subscription, SubscriptionStatus } from '@/types/subscription';

/** Días de prueba gratis para un comercio nuevo. */
export const TRIAL_DAYS = 14;

export interface Plan {
  key: string;
  name: string;
  /** Precio sugerido de referencia (el cobro es manual). */
  price: number;
  /** Meses que otorga una compra de este plan. */
  months: number;
  features: string[];
}

/** Planes disponibles. El precio es referencial; el pago se valida manualmente. */
export const PLANS: Record<string, Plan> = {
  TRIAL: {
    key: 'TRIAL',
    name: 'Prueba gratis',
    price: 0,
    months: 0,
    features: [`${TRIAL_DAYS} días de acceso completo`],
  },
  BASIC: {
    key: 'BASIC',
    name: 'Básico',
    price: 15,
    months: 1,
    features: ['1 mes de acceso', 'Todos los módulos', 'Usuarios ilimitados'],
  },
  ANNUAL: {
    key: 'ANNUAL',
    name: 'Anual',
    price: 150,
    months: 12,
    features: ['12 meses de acceso', 'Ahorro vs. mensual', 'Todos los módulos'],
  },
};

export const PLAN_LIST = Object.values(PLANS).filter((p) => p.key !== 'TRIAL');

export function planName(key: string): string {
  return PLANS[key]?.name ?? key;
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

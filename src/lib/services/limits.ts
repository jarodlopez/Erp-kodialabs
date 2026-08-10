import 'server-only';

/**
 * Aplicación de los límites del plan del comercio (usuarios, productos).
 * La verificación ocurre en la capa de acciones, ANTES de las operaciones
 * transaccionales, para no interferir con la lógica de negocio.
 *
 * Regla: un límite en 0 (o ausente) significa ILIMITADO. La prueba y los
 * planes sin configuración de límites se tratan como ilimitados.
 */
import { errors } from '@/lib/errors';
import { productRepository } from '@/lib/repositories/catalog';
import { organizationRepository, userRepository } from '@/lib/repositories/organization';
import { platformConfigRepository } from '@/lib/repositories/platform-config';
import { subscriptionRepository } from '@/lib/repositories/subscription';
import { effectiveSubscription, findPlan, isUnlimited } from '@/lib/subscription';
import type { Id } from '@/types/common';
import type { PlanLimits } from '@/types/subscription';

async function resolveLimits(organizationId: Id): Promise<PlanLimits> {
  const [org, sub, plans] = await Promise.all([
    organizationRepository.get(organizationId),
    subscriptionRepository.get(organizationId),
    platformConfigRepository.getPlans(),
  ]);
  const state = effectiveSubscription(sub, org?.createdAt ?? new Date().toISOString());
  const plan = findPlan(plans, state.plan);
  return plan?.limits ?? { users: 0, products: 0 };
}

/** Lanza si la organización ya alcanzó el límite de usuarios de su plan. */
export async function assertCanAddUser(organizationId: Id): Promise<void> {
  const limits = await resolveLimits(organizationId);
  if (isUnlimited(limits.users)) return;
  const current = await userRepository.countMemberships(organizationId);
  if (current >= limits.users) {
    throw errors.validation(
      `Tu plan permite hasta ${limits.users} usuario(s). Mejora tu plan para agregar más.`,
    );
  }
}

/** Cupo de productos que aún se pueden crear (Infinity si es ilimitado). */
export async function productsRemaining(organizationId: Id): Promise<number> {
  const limits = await resolveLimits(organizationId);
  if (isUnlimited(limits.products)) return Number.POSITIVE_INFINITY;
  const current = await productRepository.countActive(organizationId);
  return Math.max(0, limits.products - current);
}

/** Lanza si la organización ya alcanzó el límite de productos de su plan. */
export async function assertCanAddProduct(organizationId: Id): Promise<void> {
  const remaining = await productsRemaining(organizationId);
  if (remaining <= 0) {
    const limits = await resolveLimits(organizationId);
    throw errors.validation(
      `Tu plan permite hasta ${limits.products} producto(s). Mejora tu plan para agregar más.`,
    );
  }
}

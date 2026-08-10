'use server';

import { revalidatePath } from 'next/cache';

import { errors, fail, logError, ok, type ActionResult } from '@/lib/errors';
import { requireSuperAdmin } from '@/lib/auth/platform';
import { organizationRepository } from '@/lib/repositories/organization';
import { subscriptionPaymentRepository, subscriptionRepository } from '@/lib/repositories/subscription';
import { addMonthsIso, PLANS } from '@/lib/subscription';
import { nowIso } from '@/lib/repositories/base';
import type { SubscriptionStatus } from '@/types/subscription';

/** Base de cálculo: si aún es válida, se extiende desde el vencimiento; si no, desde hoy. */
function extensionBase(currentValidUntil: string | null): string {
  const now = Date.now();
  if (currentValidUntil && new Date(currentValidUntil).getTime() > now) return currentValidUntil;
  return new Date(now).toISOString();
}

/** Extiende (o crea) la suscripción de un comercio por N meses. */
export async function extendSubscriptionAction(
  organizationId: string,
  plan: string,
  months: number,
): Promise<ActionResult<{ validUntil: string }>> {
  try {
    const session = await requireSuperAdmin();
    const safeMonths = Number.isFinite(months) && months > 0 ? Math.trunc(months) : 1;

    const current = await subscriptionRepository.get(organizationId);
    const validUntil = addMonthsIso(extensionBase(current?.validUntil ?? null), safeMonths);

    await subscriptionRepository.set(
      organizationId,
      { plan, status: 'ACTIVE', validUntil, note: null },
      session.uid,
    );

    revalidatePath('/admin');
    return ok({ validUntil });
  } catch (error) {
    logError('platform.extend', error);
    return fail(error);
  }
}

/** Suspende o reactiva un comercio. */
export async function setSubscriptionStatusAction(
  organizationId: string,
  status: SubscriptionStatus,
): Promise<ActionResult<undefined>> {
  try {
    const session = await requireSuperAdmin();
    const org = await organizationRepository.get(organizationId);
    if (!org) throw errors.notFound('Organización');

    const current = await subscriptionRepository.get(organizationId);
    await subscriptionRepository.set(
      organizationId,
      {
        status,
        plan: current?.plan ?? 'BASIC',
        validUntil: current?.validUntil ?? new Date().toISOString(),
      },
      session.uid,
    );

    revalidatePath('/admin');
    return ok();
  } catch (error) {
    logError('platform.setStatus', error);
    return fail(error);
  }
}

/** Aprueba un reporte de pago y extiende la suscripción según su plan. */
export async function approvePaymentAction(
  paymentId: string,
): Promise<ActionResult<{ validUntil: string }>> {
  try {
    const session = await requireSuperAdmin();
    const payment = await subscriptionPaymentRepository.get(paymentId);
    if (!payment) throw errors.notFound('Reporte de pago');
    if (payment.status !== 'PENDING') {
      throw errors.validation('Este reporte ya fue revisado.');
    }

    const months = PLANS[payment.plan]?.months ?? 1;
    const current = await subscriptionRepository.get(payment.organizationId);
    const validUntil = addMonthsIso(extensionBase(current?.validUntil ?? null), months);

    await subscriptionRepository.set(
      payment.organizationId,
      { plan: payment.plan, status: 'ACTIVE', validUntil, note: null },
      session.uid,
    );
    await subscriptionPaymentRepository.update(paymentId, {
      status: 'APPROVED',
      reviewedBy: session.uid,
      reviewedAt: nowIso(),
    });

    revalidatePath('/admin');
    return ok({ validUntil });
  } catch (error) {
    logError('platform.approve', error);
    return fail(error);
  }
}

/** Rechaza un reporte de pago. */
export async function rejectPaymentAction(
  paymentId: string,
  reason: string,
): Promise<ActionResult<undefined>> {
  try {
    const session = await requireSuperAdmin();
    const payment = await subscriptionPaymentRepository.get(paymentId);
    if (!payment) throw errors.notFound('Reporte de pago');
    if (payment.status !== 'PENDING') {
      throw errors.validation('Este reporte ya fue revisado.');
    }

    await subscriptionPaymentRepository.update(paymentId, {
      status: 'REJECTED',
      reviewedBy: session.uid,
      reviewedAt: nowIso(),
      reviewNote: reason || null,
    });

    revalidatePath('/admin');
    return ok();
  } catch (error) {
    logError('platform.reject', error);
    return fail(error);
  }
}

'use server';

import { revalidatePath } from 'next/cache';

import { fail, logError, ok, type ActionResult } from '@/lib/errors';
import { getActorContext } from '@/lib/server-context';
import { nowIso, parseDate } from '@/lib/repositories/base';
import { newDoc } from '@/lib/repositories/refs';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { organizationRepository } from '@/lib/repositories/organization';
import { subscriptionPaymentRepository } from '@/lib/repositories/subscription';
import { parseOrThrow } from '@/lib/validation/parse';
import { subscriptionPaymentReportSchema } from '@/lib/validation/schemas';
import type { SubscriptionPayment } from '@/types/subscription';

/** Un comercio reporta un pago manual (transferencia/depósito) para validación. */
export async function reportSubscriptionPaymentAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { session, actor } = await getActorContext();
    const data = parseOrThrow(subscriptionPaymentReportSchema, input);

    const org = await organizationRepository.get(actor.organizationId);
    const ref = newDoc(COLLECTIONS.SUBSCRIPTION_PAYMENTS);
    const payment: SubscriptionPayment = {
      id: ref.id,
      organizationId: actor.organizationId,
      organizationName: org?.name ?? '',
      reportedBy: actor.userId,
      reporterEmail: session.email,
      plan: data.plan,
      amount: data.amount,
      method: data.method,
      reference: data.reference ?? null,
      paidAt: parseDate(data.paidAt),
      note: data.note ?? null,
      status: 'PENDING',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: nowIso(),
    };

    await subscriptionPaymentRepository.create(payment);
    revalidatePath('/suscripcion');
    revalidatePath('/admin');
    return ok({ id: ref.id });
  } catch (error) {
    logError('subscription.report', error);
    return fail(error);
  }
}

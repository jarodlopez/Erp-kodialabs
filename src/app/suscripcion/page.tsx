import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { signOutAction } from '@/app/actions/auth';
import { Badge, Button, Card, CardHeader } from '@/components/ui/primitives';
import { getSession } from '@/lib/auth/session';
import { organizationRepository } from '@/lib/repositories/organization';
import {
  subscriptionPaymentRepository,
  subscriptionRepository,
} from '@/lib/repositories/subscription';
import { effectiveSubscription, planName, PLAN_LIST } from '@/lib/subscription';
import { formatDate } from '@/lib/utils';
import {
  PAYMENT_REPORT_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from '@/types/subscription';
import { ReportPaymentForm } from './report-form';

export const metadata: Metadata = { title: 'Suscripción' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<SubscriptionStatus, 'brand' | 'positive' | 'danger' | 'warning'> = {
  TRIAL: 'brand',
  ACTIVE: 'positive',
  EXPIRED: 'danger',
  SUSPENDED: 'danger',
};

export default async function SubscriptionPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.organizationId) redirect('/sin-organizacion');

  const [org, subscription, reports] = await Promise.all([
    organizationRepository.get(session.organizationId),
    subscriptionRepository.get(session.organizationId),
    subscriptionPaymentRepository.listByOrg(session.organizationId),
  ]);

  const state = effectiveSubscription(subscription, org?.createdAt ?? new Date().toISOString());
  const paymentInfo = process.env.SUBSCRIPTION_PAYMENT_INFO?.trim();

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Suscripción
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-subtle)]">
          {org?.name ?? 'Tu comercio'} · {session.email}
        </p>
      </div>

      {/* Estado */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[state.status]}>
                {SUBSCRIPTION_STATUS_LABELS[state.status]}
              </Badge>
              <span className="text-sm text-[var(--color-ink-muted)]">
                Plan: {planName(state.plan)}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              {state.allowed
                ? `Acceso válido hasta el ${formatDate(state.validUntil)} (${state.daysLeft} día(s)).`
                : state.status === 'SUSPENDED'
                  ? 'Tu cuenta está suspendida. Reporta tu pago o contacta al administrador.'
                  : `Tu acceso venció el ${formatDate(state.validUntil)}. Reporta tu pago para reactivarlo.`}
            </p>
          </div>
          {state.allowed ? (
            <Link href="/">
              <Button>Ir al sistema</Button>
            </Link>
          ) : (
            <form action={signOutAction}>
              <Button type="submit" variant="secondary">
                Cerrar sesión
              </Button>
            </form>
          )}
        </div>
      </Card>

      {/* Planes + instrucciones de pago */}
      <Card>
        <CardHeader
          title="Cómo pagar"
          description="El pago se valida manualmente. Realiza el pago y luego repórtalo abajo."
        />
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {PLAN_LIST.map((p) => (
              <div key={p.key} className="rounded-lg border border-[var(--color-border)] p-3">
                <p className="font-semibold text-[var(--color-ink)]">{p.name}</p>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Referencia: {p.price} / {p.months} mes(es)
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-[var(--color-ink-subtle)]">
                  {p.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-[var(--color-canvas)] p-3 text-sm text-[var(--color-ink-muted)]">
            <p className="mb-1 font-medium text-[var(--color-ink)]">Datos para el pago</p>
            {paymentInfo ? (
              <pre className="whitespace-pre-wrap font-sans">{paymentInfo}</pre>
            ) : (
              <p>
                Contacta al administrador de la plataforma para obtener los datos de la cuenta donde
                realizar el pago.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Reportar pago */}
      <ReportPaymentForm />

      {/* Historial de reportes */}
      {reports.length > 0 && (
        <Card>
          <CardHeader title="Tus reportes de pago" />
          <ul className="divide-y divide-[var(--color-border)]">
            {reports.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium text-[var(--color-ink)]">
                    {planName(r.plan)} · {r.amount}
                  </p>
                  <p className="text-xs text-[var(--color-ink-subtle)]">
                    {formatDate(r.paidAt)} · {r.method}
                    {r.reference ? ` · ${r.reference}` : ''}
                  </p>
                </div>
                <Badge
                  tone={
                    r.status === 'APPROVED'
                      ? 'positive'
                      : r.status === 'REJECTED'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {PAYMENT_REPORT_STATUS_LABELS[r.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

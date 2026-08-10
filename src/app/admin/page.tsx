import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { getSession } from '@/lib/auth/session';
import { isSuperAdminEmail } from '@/lib/auth/platform';
import { organizationRepository } from '@/lib/repositories/organization';
import { platformConfigRepository } from '@/lib/repositories/platform-config';
import {
  subscriptionPaymentRepository,
  subscriptionRepository,
} from '@/lib/repositories/subscription';
import { effectiveSubscription, paidPlans } from '@/lib/subscription';
import type { Subscription } from '@/types/subscription';
import { PlansEditor } from './plans-editor';
import { PlatformConsole, type ReportRow, type TenantRow } from './platform-console';

export const metadata: Metadata = { title: 'Administración de plataforma' };
export const dynamic = 'force-dynamic';

export default async function PlatformAdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isSuperAdminEmail(session.email)) redirect('/');

  const [orgs, subscriptions, reports, allPlans] = await Promise.all([
    organizationRepository.listAll(),
    subscriptionRepository.listAll(),
    subscriptionPaymentRepository.listAll(),
    platformConfigRepository.getPlans(),
  ]);

  const subByOrg = new Map<string, Subscription>();
  for (const s of subscriptions) subByOrg.set(s.organizationId, s);

  const tenants: TenantRow[] = orgs
    .map((org) => {
      const state = effectiveSubscription(subByOrg.get(org.id) ?? null, org.createdAt);
      return {
        id: org.id,
        name: org.name,
        email: org.email ?? '',
        status: state.status,
        plan: state.plan,
        validUntil: state.validUntil,
        allowed: state.allowed,
        daysLeft: state.daysLeft,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const pending: ReportRow[] = reports
    .filter((r) => r.status === 'PENDING')
    .map((r) => ({
      id: r.id,
      organizationName: r.organizationName,
      reporterEmail: r.reporterEmail,
      plan: r.plan,
      amount: r.amount,
      method: r.method,
      reference: r.reference,
      paidAt: r.paidAt,
      note: r.note,
      createdAt: r.createdAt,
    }));

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            Administración de plataforma
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-subtle)]">
            Gestión de comercios y validación manual de pagos.
          </p>
        </div>
        <Link href="/" className="text-sm text-[var(--color-brand-600)] hover:underline">
          ← Volver al sistema
        </Link>
      </div>

      <PlatformConsole tenants={tenants} pending={pending} plans={paidPlans(allPlans)} />
      <PlansEditor initialPlans={allPlans} />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  approvePaymentAction,
  extendSubscriptionAction,
  rejectPaymentAction,
  setSubscriptionStatusAction,
} from '@/app/actions/platform';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Select,
  TableWrapper,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PLAN_LIST } from '@/lib/subscription';
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from '@/types/subscription';

export interface TenantRow {
  id: string;
  name: string;
  email: string;
  status: SubscriptionStatus;
  plan: string;
  validUntil: string;
  allowed: boolean;
  daysLeft: number;
}

export interface ReportRow {
  id: string;
  organizationName: string;
  reporterEmail: string;
  plan: string;
  amount: number;
  method: string;
  reference: string | null;
  paidAt: string;
  note: string | null;
  createdAt: string;
}

const TONE: Record<SubscriptionStatus, 'brand' | 'positive' | 'danger' | 'warning'> = {
  TRIAL: 'brand',
  ACTIVE: 'positive',
  EXPIRED: 'danger',
  SUSPENDED: 'danger',
};

function fmt(iso: string) {
  return iso ? iso.slice(0, 10) : '—';
}

export function PlatformConsole({
  tenants,
  pending,
}: {
  tenants: TenantRow[];
  pending: ReportRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [planByOrg, setPlanByOrg] = useState<Record<string, string>>({});

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: { message: string } }>, okMsg: string) {
    if (busy) return;
    setBusy(key);
    const result = await fn();
    setBusy(null);
    if (!result.ok) {
      toast.error('No se pudo completar', result.error?.message ?? 'Error');
      return;
    }
    toast.success(okMsg);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Pagos pendientes de validar */}
      <Card>
        <CardHeader
          title={`Pagos por validar (${pending.length})`}
          description="Aprueba para extender la suscripción del comercio según el plan reportado."
        />
        {pending.length === 0 ? (
          <EmptyState title="Sin pagos pendientes" description="No hay reportes por revisar." />
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {pending.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--color-ink)]">{r.organizationName}</p>
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      {r.plan} · {r.amount} · {r.method}
                      {r.reference ? ` · ref ${r.reference}` : ''}
                    </p>
                    <p className="text-xs text-[var(--color-ink-subtle)]">
                      Pagado {fmt(r.paidAt)} · reportó {r.reporterEmail}
                      {r.note ? ` · "${r.note}"` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      loading={busy === `ap-${r.id}`}
                      onClick={() =>
                        run(`ap-${r.id}`, () => approvePaymentAction(r.id), 'Pago aprobado')
                      }
                    >
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === `re-${r.id}`}
                      onClick={() => {
                        const reason = window.prompt('Motivo del rechazo (opcional):') ?? '';
                        run(`re-${r.id}`, () => rejectPaymentAction(r.id, reason), 'Reporte rechazado');
                      }}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Comercios */}
      <Card>
        <CardHeader title={`Comercios (${tenants.length})`} description="Estado de suscripción de cada tenant." />
        <TableWrapper>
          <thead>
            <tr>
              <Th>Comercio</Th>
              <Th>Estado</Th>
              <Th>Vence</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <span className="font-medium text-[var(--color-ink)]">{t.name}</span>
                  <span className="block text-xs text-[var(--color-ink-subtle)]">{t.email}</span>
                </Td>
                <Td>
                  <Badge tone={TONE[t.status]}>{SUBSCRIPTION_STATUS_LABELS[t.status]}</Badge>
                  {t.allowed && (
                    <span className="ml-1 text-xs text-[var(--color-ink-subtle)]">
                      {t.daysLeft}d
                    </span>
                  )}
                </Td>
                <Td className="text-sm">{fmt(t.validUntil)}</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Select
                      value={planByOrg[t.id] ?? PLAN_LIST[0]?.key ?? 'BASIC'}
                      onChange={(e) => setPlanByOrg((s) => ({ ...s, [t.id]: e.target.value }))}
                      className="h-8 py-0 text-xs"
                    >
                      {PLAN_LIST.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name} ({p.months}m)
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      loading={busy === `ex-${t.id}`}
                      onClick={() => {
                        const plan = planByOrg[t.id] ?? PLAN_LIST[0]?.key ?? 'BASIC';
                        const months = PLAN_LIST.find((p) => p.key === plan)?.months ?? 1;
                        run(
                          `ex-${t.id}`,
                          () => extendSubscriptionAction(t.id, plan, months),
                          'Suscripción extendida',
                        );
                      }}
                    >
                      Extender
                    </Button>
                    {t.status === 'SUSPENDED' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy === `st-${t.id}`}
                        onClick={() =>
                          run(
                            `st-${t.id}`,
                            () => setSubscriptionStatusAction(t.id, 'ACTIVE'),
                            'Comercio reactivado',
                          )
                        }
                      >
                        Reactivar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={busy === `st-${t.id}`}
                        onClick={() => {
                          if (!window.confirm(`¿Suspender a ${t.name}? Perderá el acceso.`)) return;
                          run(
                            `st-${t.id}`,
                            () => setSubscriptionStatusAction(t.id, 'SUSPENDED'),
                            'Comercio suspendido',
                          );
                        }}
                      >
                        Suspender
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrapper>
      </Card>
    </div>
  );
}

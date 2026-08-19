'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { reportSubscriptionPaymentAction } from '@/app/actions/subscription';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { toDateInput } from '@/lib/utils';
import type { PlanConfig } from '@/types/subscription';
import {
  Banknote,
  CalendarDays,
  CreditCard,
  Hash,
  Sparkles,
  StickyNote,
} from 'lucide-react';

export function ReportPaymentForm({ plans }: { plans: PlanConfig[] }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(plans[0]?.key ?? 'BASIC');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    setLoading(true);
    const result = await reportSubscriptionPaymentAction({
      plan: String(form.get('plan') ?? ''),
      amount: Number(form.get('amount') ?? 0),
      method: String(form.get('method') ?? ''),
      reference: String(form.get('reference') ?? ''),
      paidAt: String(form.get('paidAt') ?? toDateInput()),
      note: String(form.get('note') ?? ''),
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo enviar el reporte', result.error.message);
      return;
    }
    toast.success('Pago reportado', 'Lo revisaremos y activaremos tu acceso pronto.');
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="Reportar un pago" icon={<Banknote />}
        description="Tras pagar por transferencia o depósito, envía los datos para validar tu suscripción."
      />
      <form onSubmit={onSubmit} className="space-y-4 p-4">
        <Field label="Plan que pagaste" icon={<Sparkles />} required>
          <Select name="plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {plans.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} — {p.months} mes(es){p.price > 0 ? ` · ${p.price} ${p.currency}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Monto pagado" icon={<Banknote />} required>
            <Input name="amount" type="number" step="0.01" min="0" required placeholder="0.00" />
          </Field>
          <Field label="Fecha de pago" icon={<CalendarDays />} required>
            <Input name="paidAt" type="date" defaultValue={toDateInput()} required />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Método" icon={<CreditCard />} required>
            <Select name="method" defaultValue="TRANSFER">
              <option value="TRANSFER">Transferencia</option>
              <option value="DEPOSIT">Depósito</option>
              <option value="CASH">Efectivo</option>
              <option value="OTHER">Otro</option>
            </Select>
          </Field>
          <Field label="Referencia / N.º de operación" icon={<Hash />}>
            <Input name="reference" placeholder="Ej. 00123456" />
          </Field>
        </div>
        <Field label="Nota (opcional)" icon={<StickyNote />}>
          <Textarea name="note" placeholder="Cualquier detalle que quieras indicar." />
        </Field>
        <Button type="submit" loading={loading}>
          Enviar reporte de pago
        </Button>
      </form>
    </Card>
  );
}

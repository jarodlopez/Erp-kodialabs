'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { savePlansAction } from '@/app/actions/platform';
import { Badge, Button, Card, CardHeader, Field, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import type { PlanConfig } from '@/types/subscription';

/**
 * Edición de planes (precio, moneda, duración y límites). Se guarda en la base
 * de datos, así que el súper-admin cambia precios y límites sin tocar código.
 * `0` en un límite = ilimitado.
 */
export function PlansEditor({ initialPlans }: { initialPlans: PlanConfig[] }) {
  const router = useRouter();
  const toast = useToast();
  const [plans, setPlans] = useState<PlanConfig[]>(initialPlans);
  const [loading, setLoading] = useState(false);

  function patch(index: number, field: string, value: string) {
    setPlans((current) =>
      current.map((p, i) => {
        if (i !== index) return p;
        if (field === 'name') return { ...p, name: value };
        if (field === 'currency') return { ...p, currency: value };
        if (field === 'price') return { ...p, price: Number(value) || 0 };
        if (field === 'months') return { ...p, months: Math.trunc(Number(value)) || 0 };
        if (field === 'users') return { ...p, limits: { ...p.limits, users: Math.trunc(Number(value)) || 0 } };
        if (field === 'products') return { ...p, limits: { ...p.limits, products: Math.trunc(Number(value)) || 0 } };
        return p;
      }),
    );
  }

  async function save() {
    setLoading(true);
    const result = await savePlansAction(plans);
    setLoading(false);
    if (!result.ok) {
      toast.error('No se pudo guardar', result.error.message);
      return;
    }
    toast.success('Planes actualizados', 'Los cambios ya están vigentes.');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="Planes y precios"
        description="Edita precios, duración y límites. Un límite en 0 significa ilimitado."
        actions={
          <Button onClick={save} loading={loading}>
            Guardar planes
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        {plans.map((p, index) => (
          <div key={p.key} className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone={p.isTrial ? 'brand' : 'neutral'}>{p.key}</Badge>
              {p.isTrial && <span className="text-xs text-[var(--color-ink-subtle)]">Prueba gratis</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="Nombre">
                <Input value={p.name} onChange={(e) => patch(index, 'name', e.target.value)} />
              </Field>
              <Field label="Precio">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.price}
                  onChange={(e) => patch(index, 'price', e.target.value)}
                  disabled={p.isTrial}
                />
              </Field>
              <Field label="Moneda">
                <Input value={p.currency} onChange={(e) => patch(index, 'currency', e.target.value)} />
              </Field>
              <Field label="Meses">
                <Input
                  type="number"
                  min="0"
                  value={p.months}
                  onChange={(e) => patch(index, 'months', e.target.value)}
                  disabled={p.isTrial}
                />
              </Field>
              <Field label="Máx. usuarios">
                <Input
                  type="number"
                  min="0"
                  value={p.limits.users}
                  onChange={(e) => patch(index, 'users', e.target.value)}
                />
              </Field>
              <Field label="Máx. productos">
                <Input
                  type="number"
                  min="0"
                  value={p.limits.products}
                  onChange={(e) => patch(index, 'products', e.target.value)}
                />
              </Field>
            </div>
          </div>
        ))}
        <p className="text-xs text-[var(--color-ink-subtle)]">
          Nota: cambiar un límite afecta a los comercios en ese plan la próxima vez que intenten
          crear un usuario o producto. Reducir un límite no elimina lo ya creado.
        </p>
      </div>
    </Card>
  );
}

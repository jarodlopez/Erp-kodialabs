'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';

import { saveStoreDiscountAction, setStoreDiscountStatusAction } from '@/app/actions/store';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { toMajorUnits } from '@/lib/money';
import { toDateInput } from '@/lib/utils';
import type { StoreDiscount } from '@/types/store';

/**
 * Alta y edición de cupones.
 *
 * El porcentaje se guarda en puntos base (igual que los impuestos del ERP) y
 * el monto fijo en centavos, así que el formulario trabaja en unidades
 * "humanas" y la conversión ocurre en el servidor.
 */
export function DiscountEditor({
  mode,
  discount,
}: {
  mode: 'create' | 'edit';
  discount?: StoreDiscount;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<StoreDiscount['kind']>(discount?.kind ?? 'PERCENT');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const payload = {
      code: String(form.get('code') ?? ''),
      kind,
      value: Number(form.get('value') ?? 0),
      minimumPurchase: Number(form.get('minimumPurchase') ?? 0),
      maxUses: Number(form.get('maxUses') ?? 0),
      expiresAt: String(form.get('expiresAt') ?? ''),
      status: String(form.get('status') ?? 'ACTIVE'),
    };

    setLoading(true);
    setErrors({});

    const result = await saveStoreDiscountAction(discount?.id ?? null, payload);
    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar el cupón', result.error.message);
      return;
    }

    toast.success(mode === 'edit' ? 'Cupón actualizado' : 'Cupón creado');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {mode === 'create' ? (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo cupón
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={mode === 'edit' ? `Cupón ${discount?.code}` : 'Nuevo cupón'}
        size="sm"
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Código" htmlFor="code" required error={errors.code}>
            <Input
              id="code"
              name="code"
              defaultValue={discount?.code ?? ''}
              maxLength={24}
              required
              placeholder="VERANO20"
              style={{ textTransform: 'uppercase' }}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="kind" error={errors.kind}>
              <Select
                id="kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as StoreDiscount['kind'])}
              >
                <option value="PERCENT">Porcentaje</option>
                <option value="AMOUNT">Monto fijo</option>
              </Select>
            </Field>

            <Field
              label={kind === 'PERCENT' ? 'Porcentaje (1-100)' : 'Monto'}
              htmlFor="value"
              required
              error={errors.value}
            >
              <Input
                id="value"
                name="value"
                type="number"
                step={kind === 'PERCENT' ? '1' : '0.01'}
                min="0"
                max={kind === 'PERCENT' ? '100' : undefined}
                required
                defaultValue={
                  discount
                    ? discount.kind === 'PERCENT'
                      ? discount.value / 100
                      : toMajorUnits(discount.value)
                    : ''
                }
              />
            </Field>

            <Field
              label="Compra mínima"
              htmlFor="minimumPurchase"
              error={errors.minimumPurchase}
              hint="0 = sin mínimo"
            >
              <Input
                id="minimumPurchase"
                name="minimumPurchase"
                type="number"
                step="0.01"
                min="0"
                defaultValue={toMajorUnits(discount?.minimumPurchase ?? 0)}
              />
            </Field>

            <Field label="Usos máximos" htmlFor="maxUses" error={errors.maxUses} hint="0 = ilimitado">
              <Input
                id="maxUses"
                name="maxUses"
                type="number"
                min="0"
                defaultValue={discount?.maxUses ?? 0}
              />
            </Field>

            <Field label="Vence el" htmlFor="expiresAt" error={errors.expiresAt}>
              <Input
                id="expiresAt"
                name="expiresAt"
                type="date"
                defaultValue={discount?.expiresAt ? toDateInput(discount.expiresAt) : ''}
              />
            </Field>

            <Field label="Estado" htmlFor="status" error={errors.status}>
              <Select id="status" name="status" defaultValue={discount?.status ?? 'ACTIVE'}>
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
              </Select>
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Activa o desactiva un cupón sin abrir el formulario. */
export function DiscountStatusToggle({
  id,
  status,
}: {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function onToggle() {
    setLoading(true);
    const next = status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const result = await setStoreDiscountStatusAction(id, next);
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo cambiar el estado', result.error.message);
      return;
    }
    toast.success(next === 'ACTIVE' ? 'Cupón activado' : 'Cupón desactivado');
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={onToggle} loading={loading}>
      {status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
    </Button>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  MessageSquare,
  Package,
  SlidersHorizontal,
} from 'lucide-react';

import { adjustInventoryAction } from '@/app/actions/inventory';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { newIdempotencyKey } from '@/lib/utils';

/** Ajuste manual de existencias. Exige motivo y queda auditado. */
export function AdjustPanel({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    setLoading(true);
    setErrors({});

    const result = await adjustInventoryAction({
      productId,
      quantity: Number(form.get('quantity') ?? 0),
      direction: String(form.get('direction') ?? 'IN'),
      reason: String(form.get('reason') ?? ''),
      idempotencyKey: newIdempotencyKey(),
    });

    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo ajustar el inventario', result.error.message);
      return;
    }

    toast.success(
      'Inventario ajustado',
      `Nuevas existencias: ${(result.data.newStock / 1000).toLocaleString('es-NI')}`,
    );
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" /> Ajustar existencias
      </Button>

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Ajuste de inventario"
        description={productName}
        size="sm"
      >
        <form onSubmit={onSubmit} className="space-y-4" id="adjust-form" noValidate>
          <Field label="Tipo de ajuste" icon={<SlidersHorizontal />} htmlFor="direction" required>
            <Select id="direction" name="direction" defaultValue="IN">
              <option value="IN">Entrada (aumentar existencias)</option>
              <option value="OUT">Salida (disminuir existencias)</option>
            </Select>
          </Field>

          <Field label="Cantidad" icon={<Package />} htmlFor="quantity" required error={errors.quantity}>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="0.001"
              min="0.001"
              required
              invalid={Boolean(errors.quantity)}
            />
          </Field>

          <Field
            label="Motivo" icon={<MessageSquare />}
            htmlFor="reason"
            required
            error={errors.reason}
            hint="Queda registrado en la auditoría junto con tu usuario."
          >
            <Textarea
              id="reason"
              name="reason"
              placeholder="Conteo físico, merma, producto dañado..."
              required
              invalid={Boolean(errors.reason)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Aplicar ajuste
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

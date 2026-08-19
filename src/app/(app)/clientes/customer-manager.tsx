'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  CalendarClock,
  CircleDot,
  CreditCard,
  IdCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Type,
} from 'lucide-react';

import { createCustomerAction, updateCustomerAction } from '@/app/actions/parties';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { toMajorUnits } from '@/lib/money';
import { DOCUMENT_TYPE_LABELS, type Customer } from '@/types/parties';

export function CustomerManager({
  mode,
  customer,
}: {
  mode: 'create' | 'edit';
  customer?: Customer;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''),
      documentType: String(form.get('documentType') ?? '') || null,
      document: String(form.get('document') ?? ''),
      phone: String(form.get('phone') ?? ''),
      email: String(form.get('email') ?? ''),
      address: String(form.get('address') ?? ''),
      notes: String(form.get('notes') ?? ''),
      creditLimit: Number(form.get('creditLimit') ?? 0),
      creditDays: Number(form.get('creditDays') ?? 30),
      status: String(form.get('status') ?? 'ACTIVE'),
    };

    setLoading(true);
    setErrors({});

    const result =
      mode === 'edit' && customer
        ? await updateCustomerAction(customer.id, payload)
        : await createCustomerAction(payload);

    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar el cliente', result.error.message);
      return;
    }

    toast.success(mode === 'edit' ? 'Cliente actualizado' : 'Cliente creado');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {mode === 'create' ? (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo cliente
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={mode === 'edit' ? 'Editar cliente' : 'Nuevo cliente'}
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Nombre o razón social" icon={<Type />} htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" defaultValue={customer?.name} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de documento" icon={<IdCard />} htmlFor="documentType">
              <Select id="documentType" name="documentType" defaultValue={customer?.documentType ?? ''}>
                <option value="">Sin especificar</option>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Número de documento" icon={<IdCard />} htmlFor="document" error={errors.document}>
              <Input id="document" name="document" defaultValue={customer?.document ?? ''} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono" icon={<Phone />} htmlFor="phone" error={errors.phone}>
              <Input id="phone" name="phone" defaultValue={customer?.phone ?? ''} />
            </Field>
            <Field label="Correo" icon={<Mail />} htmlFor="email" error={errors.email}>
              <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ''} />
            </Field>
          </div>

          <Field label="Dirección" icon={<MapPin />} htmlFor="address" error={errors.address}>
            <Input id="address" name="address" defaultValue={customer?.address ?? ''} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Límite de crédito" icon={<CreditCard />} htmlFor="creditLimit" error={errors.creditLimit}>
              <Input
                id="creditLimit"
                name="creditLimit"
                type="number"
                step="0.01"
                min="0"
                defaultValue={customer ? toMajorUnits(customer.creditLimit) : 0}
              />
            </Field>
            <Field label="Días de crédito" icon={<CalendarClock />} htmlFor="creditDays" error={errors.creditDays}>
              <Input
                id="creditDays"
                name="creditDays"
                type="number"
                min="0"
                defaultValue={customer?.creditDays ?? 30}
              />
            </Field>
            <Field label="Estado" icon={<CircleDot />} htmlFor="status">
              <Select id="status" name="status" defaultValue={customer?.status ?? 'ACTIVE'}>
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
              </Select>
            </Field>
          </div>

          <Field label="Notas" icon={<StickyNote />} htmlFor="notes">
            <Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ''} />
          </Field>

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

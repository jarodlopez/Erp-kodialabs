'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  CalendarClock,
  CircleDot,
  IdCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Type,
  UserRound,
} from 'lucide-react';

import { createSupplierAction, updateSupplierAction } from '@/app/actions/parties';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { DOCUMENT_TYPE_LABELS, type Supplier } from '@/types/parties';

export function SupplierManager({
  mode,
  supplier,
}: {
  mode: 'create' | 'edit';
  supplier?: Supplier;
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
      contactName: String(form.get('contactName') ?? ''),
      phone: String(form.get('phone') ?? ''),
      email: String(form.get('email') ?? ''),
      address: String(form.get('address') ?? ''),
      notes: String(form.get('notes') ?? ''),
      creditDays: Number(form.get('creditDays') ?? 30),
      status: String(form.get('status') ?? 'ACTIVE'),
    };

    setLoading(true);
    setErrors({});

    const result =
      mode === 'edit' && supplier
        ? await updateSupplierAction(supplier.id, payload)
        : await createSupplierAction(payload);

    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar el proveedor', result.error.message);
      return;
    }

    toast.success(mode === 'edit' ? 'Proveedor actualizado' : 'Proveedor creado');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {mode === 'create' ? (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo proveedor
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={mode === 'edit' ? 'Editar proveedor' : 'Nuevo proveedor'}
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Nombre o razón social" icon={<Type />} htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" defaultValue={supplier?.name} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de documento" icon={<IdCard />} htmlFor="documentType">
              <Select id="documentType" name="documentType" defaultValue={supplier?.documentType ?? ''}>
                <option value="">Sin especificar</option>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Número de documento" icon={<IdCard />} htmlFor="document" error={errors.document}>
              <Input id="document" name="document" defaultValue={supplier?.document ?? ''} />
            </Field>
          </div>

          <Field label="Persona de contacto" icon={<UserRound />} htmlFor="contactName">
            <Input id="contactName" name="contactName" defaultValue={supplier?.contactName ?? ''} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono" icon={<Phone />} htmlFor="phone" error={errors.phone}>
              <Input id="phone" name="phone" defaultValue={supplier?.phone ?? ''} />
            </Field>
            <Field label="Correo" icon={<Mail />} htmlFor="email" error={errors.email}>
              <Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ''} />
            </Field>
          </div>

          <Field label="Dirección" icon={<MapPin />} htmlFor="address">
            <Input id="address" name="address" defaultValue={supplier?.address ?? ''} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Días de crédito" icon={<CalendarClock />} htmlFor="creditDays" error={errors.creditDays}>
              <Input
                id="creditDays"
                name="creditDays"
                type="number"
                min="0"
                defaultValue={supplier?.creditDays ?? 30}
              />
            </Field>
            <Field label="Estado" icon={<CircleDot />} htmlFor="status">
              <Select id="status" name="status" defaultValue={supplier?.status ?? 'ACTIVE'}>
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
              </Select>
            </Field>
          </div>

          <Field label="Notas" icon={<StickyNote />} htmlFor="notes">
            <Textarea id="notes" name="notes" defaultValue={supplier?.notes ?? ''} />
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

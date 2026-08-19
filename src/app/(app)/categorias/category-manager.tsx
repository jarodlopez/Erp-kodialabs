'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlignLeft,
  CircleDot,
  Palette,
  Pencil,
  Plus,
  Type,
} from 'lucide-react';

import { createCategoryAction, updateCategoryAction } from '@/app/actions/catalog';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import type { Category } from '@/types/catalog';

export function CategoryManager({
  mode,
  category,
}: {
  mode: 'create' | 'edit';
  category?: Category;
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
      description: String(form.get('description') ?? ''),
      color: String(form.get('color') ?? ''),
      status: String(form.get('status') ?? 'ACTIVE'),
    };

    setLoading(true);
    setErrors({});

    const result =
      mode === 'edit' && category
        ? await updateCategoryAction(category.id, payload)
        : await createCategoryAction(payload);

    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar la categoría', result.error.message);
      return;
    }

    toast.success(mode === 'edit' ? 'Categoría actualizada' : 'Categoría creada');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {mode === 'create' ? (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva categoría
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={mode === 'edit' ? 'Editar categoría' : 'Nueva categoría'}
        size="sm"
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Nombre" icon={<Type />} htmlFor="name" required error={errors.name}>
            <Input
              id="name"
              name="name"
              defaultValue={category?.name}
              required
              invalid={Boolean(errors.name)}
            />
          </Field>

          <Field label="Descripción" icon={<AlignLeft />} htmlFor="description" error={errors.description}>
            <Textarea id="description" name="description" defaultValue={category?.description ?? ''} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Color" icon={<Palette />} htmlFor="color" error={errors.color}>
              <Input
                id="color"
                name="color"
                type="color"
                defaultValue={category?.color ?? '#e2661f'}
                className="h-10 p-1"
              />
            </Field>

            <Field label="Estado" icon={<CircleDot />} htmlFor="status" error={errors.status}>
              <Select id="status" name="status" defaultValue={category?.status ?? 'ACTIVE'}>
                <option value="ACTIVE">Activa</option>
                <option value="INACTIVE">Inactiva</option>
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

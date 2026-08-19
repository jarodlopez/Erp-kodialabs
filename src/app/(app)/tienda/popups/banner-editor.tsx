'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  CircleDot,
  Link2,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  Type,
} from 'lucide-react';

import { deleteStoreBannerAction, saveStoreBannerAction } from '@/app/actions/store';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import type { StoreBanner } from '@/types/store';
import { ImageUploader } from '../image-uploader';

/**
 * Pop-ups de la tienda. Se muestra el más reciente activo, una vez por
 * sesión del visitante.
 */
export function BannerEditor({
  mode,
  banner,
}: {
  mode: 'create' | 'edit';
  banner?: StoreBanner;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? '');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get('title') ?? ''),
      message: String(form.get('message') ?? ''),
      imageUrl,
      ctaLabel: String(form.get('ctaLabel') ?? ''),
      ctaHref: String(form.get('ctaHref') ?? ''),
      delaySeconds: Number(form.get('delaySeconds') ?? 3),
      status: String(form.get('status') ?? 'ACTIVE'),
    };

    setLoading(true);
    setErrors({});

    const result = await saveStoreBannerAction(banner?.id ?? null, payload);
    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar el pop-up', result.error.message);
      return;
    }

    toast.success(mode === 'edit' ? 'Pop-up actualizado' : 'Pop-up creado');
    setOpen(false);
    router.refresh();
  }

  async function onDelete() {
    if (!banner) return;
    setLoading(true);
    const result = await deleteStoreBannerAction(banner.id);
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo eliminar', result.error.message);
      return;
    }
    toast.success('Pop-up eliminado');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {mode === 'create' ? (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo pop-up
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={mode === 'edit' ? `Pop-up: ${banner?.title}` : 'Nuevo pop-up'}
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Título" icon={<Type />} htmlFor="title" required error={errors.title}>
            <Input id="title" name="title" defaultValue={banner?.title ?? ''} maxLength={80} required />
          </Field>

          <Field label="Mensaje" icon={<StickyNote />} htmlFor="message" error={errors.message}>
            <Textarea
              id="message"
              name="message"
              rows={3}
              defaultValue={banner?.message ?? ''}
              maxLength={300}
            />
          </Field>

          <ImageUploader
            images={imageUrl ? [imageUrl] : []}
            onChange={(images) => setImageUrl(images[0] ?? '')}
            max={1}
            label="Imagen"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Texto del botón" icon={<Type />} htmlFor="ctaLabel" error={errors.ctaLabel}>
              <Input id="ctaLabel" name="ctaLabel" defaultValue={banner?.ctaLabel ?? ''} maxLength={40} />
            </Field>

            <Field label="Enlace del botón" icon={<Link2 />} htmlFor="ctaHref" error={errors.ctaHref}>
              <Input id="ctaHref" name="ctaHref" defaultValue={banner?.ctaHref ?? ''} maxLength={300} />
            </Field>

            <Field
              label="Retraso (segundos)"
              htmlFor="delaySeconds"
              error={errors.delaySeconds}
              hint="Cuánto espera antes de aparecer"
            >
              <Input
                id="delaySeconds"
                name="delaySeconds"
                type="number"
                min="0"
                max="60"
                defaultValue={banner?.delaySeconds ?? 3}
              />
            </Field>

            <Field label="Estado" icon={<CircleDot />} htmlFor="status" error={errors.status}>
              <Select id="status" name="status" defaultValue={banner?.status ?? 'ACTIVE'}>
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
              </Select>
            </Field>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            {mode === 'edit' ? (
              <Button type="button" variant="danger" onClick={onDelete} disabled={loading}>
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={loading}>
                Guardar
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

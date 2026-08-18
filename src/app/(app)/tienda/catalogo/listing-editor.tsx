'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import {
  removeStoreListingAction,
  saveStoreListingAction,
} from '@/app/actions/store';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { toMajorUnits } from '@/lib/money';
import type { Product } from '@/types/catalog';
import type { StoreListing } from '@/types/store';
import { ImageUploader } from '../image-uploader';

/**
 * Alta y edición de una ficha de vitrina.
 *
 * Una ficha no crea producto: elige uno que ya existe en el ERP y le agrega lo
 * que la web necesita (fotos, texto largo, oferta). Las variantes se mapean a
 * otros productos del ERP, así que cada talla o medida conserva su SKU, su
 * existencia y su costo.
 */
export function ListingEditor({
  mode,
  listing,
  products,
  collections,
}: {
  mode: 'create' | 'edit';
  listing?: StoreListing;
  /** Productos activos del ERP disponibles para publicar. */
  products: Pick<Product, 'id' | 'name' | 'sku' | 'salePrice'>[];
  collections: string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [productId, setProductId] = useState(listing?.productId ?? products[0]?.id ?? '');
  const [images, setImages] = useState<string[]>(listing?.images ?? []);
  const [variants, setVariants] = useState<{ label: string; productId: string }[]>(
    listing?.variants ?? [],
  );

  function addVariant() {
    setVariants((current) => [...current, { label: '', productId: productId || products[0]?.id || '' }]);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const payload = {
      productId,
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      details: String(form.get('details') ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      images,
      collection: String(form.get('collection') ?? ''),
      variants: variants.filter((variant) => variant.label.trim() && variant.productId),
      salePrice: Number(form.get('salePrice') ?? 0),
      featured: form.get('featured') === 'on',
      position: Number(form.get('position') ?? 100),
      visible: form.get('visible') === 'on',
    };

    setLoading(true);
    setErrors({});

    const result = await saveStoreListingAction(payload);
    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar la ficha', result.error.message);
      return;
    }

    toast.success(mode === 'edit' ? 'Ficha actualizada' : 'Producto publicado');
    setOpen(false);
    router.refresh();
  }

  async function onRemove() {
    if (!listing) return;
    setLoading(true);
    const result = await removeStoreListingAction(listing.productId);
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo quitar de la vitrina', result.error.message);
      return;
    }
    toast.success('Producto retirado de la vitrina');
    setOpen(false);
    router.refresh();
  }

  const selectedProduct = products.find((product) => product.id === productId);

  return (
    <>
      {mode === 'create' ? (
        <Button onClick={() => setOpen(true)} disabled={products.length === 0}>
          <Plus className="h-4 w-4" /> Publicar producto
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={mode === 'edit' ? `Ficha de ${listing?.title}` : 'Publicar producto en la tienda'}
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Producto del ERP" htmlFor="productId" required error={errors.productId}>
            <Select
              id="productId"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              disabled={mode === 'edit'}
              required
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} · {product.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título en la tienda" htmlFor="title" error={errors.title}>
              <Input
                id="title"
                name="title"
                defaultValue={listing?.title ?? ''}
                placeholder={selectedProduct?.name ?? 'Se usa el nombre del producto'}
                maxLength={150}
              />
            </Field>

            <Field label="Colección" htmlFor="collection" error={errors.collection}>
              <Input
                id="collection"
                name="collection"
                list="store-collections"
                defaultValue={listing?.collection ?? ''}
                placeholder="Se usa la categoría del producto"
                maxLength={80}
              />
              <datalist id="store-collections">
                {collections.map((collection) => (
                  <option key={collection} value={collection} />
                ))}
              </datalist>
            </Field>
          </div>

          <Field label="Descripción" htmlFor="description" error={errors.description}>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={listing?.description ?? ''}
              maxLength={2000}
            />
          </Field>

          <Field
            label="Detalles (uno por línea)"
            htmlFor="details"
            error={errors.details}
            hint="Aparecen como viñetas en la ficha: material, garantía, medidas…"
          >
            <Textarea
              id="details"
              name="details"
              rows={3}
              defaultValue={(listing?.details ?? []).join('\n')}
            />
          </Field>

          <ImageUploader
            images={images}
            onChange={setImages}
            hint="La primera imagen es la portada. Se alojan en ImgBB y se sirven optimizadas."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Precio de oferta"
              htmlFor="salePrice"
              error={errors.salePrice}
              hint={
                selectedProduct
                  ? `Precio actual: ${toMajorUnits(selectedProduct.salePrice).toFixed(2)}. 0 = sin oferta.`
                  : '0 = sin oferta'
              }
            >
              <Input
                id="salePrice"
                name="salePrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={toMajorUnits(listing?.salePrice ?? 0)}
              />
            </Field>

            <Field label="Orden" htmlFor="position" error={errors.position} hint="Menor aparece primero">
              <Input
                id="position"
                name="position"
                type="number"
                min="0"
                defaultValue={listing?.position ?? 100}
              />
            </Field>

            <div className="space-y-2 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="visible"
                  defaultChecked={listing?.visible ?? true}
                  className="h-4 w-4"
                />
                Visible en la tienda
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="featured"
                  defaultChecked={listing?.featured ?? false}
                  className="h-4 w-4"
                />
                Destacado
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Variantes</p>
                <p className="text-xs text-[var(--color-ink-subtle)]">
                  Cada variante es otro producto del ERP con su propio SKU y existencia. Sin
                  variantes, se vende el producto principal.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addVariant}>
                <Plus className="h-3.5 w-3.5" /> Agregar
              </Button>
            </div>

            {variants.length > 0 && (
              <ul className="space-y-2">
                {variants.map((variant, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Input
                      value={variant.label}
                      onChange={(event) =>
                        setVariants((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, label: event.target.value.toUpperCase() } : item,
                          ),
                        )
                      }
                      placeholder="M / 1/2 pulgada"
                      className="w-40"
                      maxLength={30}
                    />
                    <Select
                      value={variant.productId}
                      onChange={(event) =>
                        setVariants((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, productId: event.target.value } : item,
                          ),
                        )
                      }
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.sku} · {product.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setVariants((current) => current.filter((_, i) => i !== index))
                      }
                      aria-label={`Quitar variante ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-between gap-2 pt-2">
            {mode === 'edit' ? (
              <Button type="button" variant="danger" onClick={onRemove} disabled={loading}>
                <Trash2 className="h-4 w-4" /> Quitar de la vitrina
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

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createProductAction, updateProductAction } from '@/app/actions/catalog';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { basisPointsToPercent, percentToBasisPoints, toMajorUnits } from '@/lib/money';
import { parseSafe } from '@/lib/validation/parse';
import { productSchema } from '@/lib/validation/schemas';
import type { Category, Product } from '@/types/catalog';
import { PRODUCT_UNIT_LABELS } from '@/types/catalog';

export function ProductForm({
  categories,
  product,
  defaultTaxRate,
}: {
  categories: Category[];
  product?: Product;
  defaultTaxRate: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isEdit = Boolean(product);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const raw = {
      sku: String(form.get('sku') ?? ''),
      barcode: String(form.get('barcode') ?? ''),
      name: String(form.get('name') ?? ''),
      description: String(form.get('description') ?? ''),
      categoryId: String(form.get('categoryId') ?? ''),
      brand: String(form.get('brand') ?? ''),
      unit: String(form.get('unit') ?? 'UNIT'),
      cost: Number(form.get('cost') ?? 0),
      salePrice: Number(form.get('salePrice') ?? 0),
      wholesalePrice: Number(form.get('wholesalePrice') ?? 0),
      taxRate: percentToBasisPoints(Number(form.get('taxRatePercent') ?? 0)),
      minimumStock: Number(form.get('minimumStock') ?? 0),
      initialStock: Number(form.get('initialStock') ?? 0),
      tracksInventory: form.get('tracksInventory') === 'on',
      status: String(form.get('status') ?? 'ACTIVE'),
      imageUrl: String(form.get('imageUrl') ?? ''),
    };

    const parsed = parseSafe(productSchema, raw);
    if (!parsed.ok) {
      setErrors(parsed.fieldErrors);
      toast.error('Revisa el formulario', 'Hay campos con información inválida.');
      return;
    }

    setErrors({});
    setLoading(true);

    const result = product
      ? await updateProductAction(product.id, parsed.data)
      : await createProductAction(parsed.data);

    if (!result.ok) {
      setLoading(false);
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar el producto', result.error.message);
      return;
    }

    toast.success(isEdit ? 'Producto actualizado' : 'Producto creado');
    const id = product?.id ?? (result.data as { id: string }).id;
    router.push(`/inventario/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-3" noValidate>
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="Información general" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="SKU" htmlFor="sku" required error={errors.sku} className="sm:col-span-1">
              <Input
                id="sku"
                name="sku"
                defaultValue={product?.sku}
                placeholder="PRD-001"
                invalid={Boolean(errors.sku)}
                required
              />
            </Field>

            <Field label="Código de barras" htmlFor="barcode" error={errors.barcode}>
              <Input
                id="barcode"
                name="barcode"
                defaultValue={product?.barcode ?? ''}
                placeholder="7501234567890"
              />
            </Field>

            <Field
              label="Nombre"
              htmlFor="name"
              required
              error={errors.name}
              className="sm:col-span-2"
            >
              <Input
                id="name"
                name="name"
                defaultValue={product?.name}
                invalid={Boolean(errors.name)}
                required
              />
            </Field>

            <Field label="Categoría" htmlFor="categoryId" error={errors.categoryId}>
              <Select id="categoryId" name="categoryId" defaultValue={product?.categoryId ?? ''}>
                <option value="">Sin categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Marca" htmlFor="brand" error={errors.brand}>
              <Input id="brand" name="brand" defaultValue={product?.brand ?? ''} />
            </Field>

            <Field label="Unidad de medida" htmlFor="unit" required error={errors.unit}>
              <Select id="unit" name="unit" defaultValue={product?.unit ?? 'UNIT'}>
                {Object.entries(PRODUCT_UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Estado" htmlFor="status" error={errors.status}>
              <Select id="status" name="status" defaultValue={product?.status ?? 'ACTIVE'}>
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
              </Select>
            </Field>

            <Field
              label="Descripción"
              htmlFor="description"
              error={errors.description}
              className="sm:col-span-2"
            >
              <Textarea id="description" name="description" defaultValue={product?.description ?? ''} />
            </Field>

            <Field
              label="URL de imagen"
              htmlFor="imageUrl"
              error={errors.imageUrl}
              className="sm:col-span-2"
              hint="Opcional. También puedes subir la imagen desde el detalle del producto."
            >
              <Input id="imageUrl" name="imageUrl" defaultValue={product?.imageUrl ?? ''} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Precios e impuestos"
            description="El costo promedio se calcula automáticamente con cada compra recibida."
          />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field
              label={isEdit ? 'Costo actual' : 'Costo inicial'}
              htmlFor="cost"
              error={errors.cost}
              hint={isEdit ? 'Solo lectura: lo define el flujo de compras.' : undefined}
            >
              <Input
                id="cost"
                name="cost"
                type="number"
                step="0.01"
                min="0"
                defaultValue={product ? toMajorUnits(product.cost) : 0}
                readOnly={isEdit}
                disabled={isEdit}
              />
            </Field>

            <Field label="Precio de venta" htmlFor="salePrice" required error={errors.salePrice}>
              <Input
                id="salePrice"
                name="salePrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={product ? toMajorUnits(product.salePrice) : 0}
                invalid={Boolean(errors.salePrice)}
                required
              />
            </Field>

            <Field label="Precio mayorista" htmlFor="wholesalePrice" error={errors.wholesalePrice}>
              <Input
                id="wholesalePrice"
                name="wholesalePrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={product ? toMajorUnits(product.wholesalePrice) : 0}
              />
            </Field>

            <Field label="Impuesto (%)" htmlFor="taxRatePercent" error={errors.taxRate}>
              <Input
                id="taxRatePercent"
                name="taxRatePercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={basisPointsToPercent(product?.taxRate ?? defaultTaxRate)}
              />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Inventario" />
          <div className="space-y-4 p-5">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                name="tracksInventory"
                defaultChecked={product?.tracksInventory ?? true}
                className="mt-0.5 h-4 w-4 rounded border-[var(--color-border-strong)]"
              />
              <span className="text-sm">
                <span className="font-medium text-[var(--color-ink)]">Controlar existencias</span>
                <span className="block text-xs text-[var(--color-ink-subtle)]">
                  Desactívalo para servicios que no descuentan inventario.
                </span>
              </span>
            </label>

            <Field label="Stock mínimo" htmlFor="minimumStock" error={errors.minimumStock}>
              <Input
                id="minimumStock"
                name="minimumStock"
                type="number"
                step="0.001"
                min="0"
                defaultValue={product ? product.minimumStock / 1000 : 0}
              />
            </Field>

            {!isEdit && (
              <Field
                label="Existencias iniciales"
                htmlFor="initialStock"
                error={errors.initialStock}
                hint="Genera un movimiento de inventario inicial trazable."
              >
                <Input id="initialStock" name="initialStock" type="number" step="0.001" min="0" defaultValue={0} />
              </Field>
            )}

            {isEdit && (
              <div className="rounded-lg bg-[var(--color-surface-muted)] p-3 text-sm">
                <p className="text-[var(--color-ink-subtle)]">Existencias actuales</p>
                <p className="mt-0.5 text-lg font-semibold tabular">
                  {(product!.stock / 1000).toLocaleString('es-NI')}
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink-subtle)]">
                  Para modificarlas usa un ajuste de inventario, que queda auditado.
                </p>
              </div>
            )}
          </div>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" loading={loading} className="flex-1">
            {isEdit ? 'Guardar cambios' : 'Crear producto'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()} disabled={loading}>
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  );
}

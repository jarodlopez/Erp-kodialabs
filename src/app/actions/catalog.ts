'use server';

import { revalidatePath } from 'next/cache';

import { errors, fail, logError, ok, type ActionResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/rbac';
import { categoryRepository, productRepository } from '@/lib/repositories/catalog';
import { getActorContext, getOperationContext } from '@/lib/server-context';
import { catalogService } from '@/lib/services/catalog';
import { parseOrThrow } from '@/lib/validation/parse';
import { categorySchema, productSchema } from '@/lib/validation/schemas';
import type { Product, ProductUnit } from '@/types/catalog';

export async function createCategoryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.CATEGORIES_MANAGE);
    const data = parseOrThrow(categorySchema, input);
    const id = await catalogService.createCategory(actor, data);
    revalidatePath('/categorias');
    revalidatePath('/inventario');
    return ok({ id });
  } catch (error) {
    logError('catalog.createCategory', error);
    return fail(error);
  }
}

export async function updateCategoryAction(
  id: string,
  input: unknown,
): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.CATEGORIES_MANAGE);
    const data = parseOrThrow(categorySchema, input);
    await catalogService.updateCategory(actor, id, data);
    revalidatePath('/categorias');
    return ok();
  } catch (error) {
    logError('catalog.updateCategory', error);
    return fail(error);
  }
}

export async function createProductAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.PRODUCTS_CREATE);
    const data = parseOrThrow(productSchema, input);
    const id = await catalogService.createProduct(ctx.actor, data, ctx.defaultWarehouseId);
    revalidatePath('/inventario');
    return ok({ id });
  } catch (error) {
    logError('catalog.createProduct', error);
    return fail(error);
  }
}

export async function updateProductAction(
  id: string,
  input: unknown,
): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.PRODUCTS_UPDATE);
    const data = parseOrThrow(productSchema, input);
    await catalogService.updateProduct(actor, id, data);
    revalidatePath('/inventario');
    revalidatePath(`/inventario/${id}`);
    return ok();
  } catch (error) {
    logError('catalog.updateProduct', error);
    return fail(error);
  }
}

export async function setProductStatusAction(
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.PRODUCTS_DEACTIVATE);
    await catalogService.setProductStatus(actor, id, status);
    revalidatePath('/inventario');
    revalidatePath(`/inventario/${id}`);
    return ok();
  } catch (error) {
    logError('catalog.setProductStatus', error);
    return fail(error);
  }
}

/** Búsqueda de productos para los selectores de ventas y compras. */
export async function searchProductsAction(term: string): Promise<ActionResult<Product[]>> {
  try {
    const { session } = await getActorContext(PERMISSIONS.PRODUCTS_VIEW);
    const products = await productRepository.quickSearch(session.organizationId, term, 12);
    return ok(products);
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------------- */
/* Importación masiva de productos por CSV                                    */
/* ------------------------------------------------------------------------- */

export interface ProductImportRow {
  sku?: string;
  nombre?: string;
  codigo_barras?: string;
  categoria?: string;
  unidad?: string;
  precio_venta?: string;
  costo?: string;
  precio_mayorista?: string;
  iva?: string;
  stock_inicial?: string;
  stock_minimo?: string;
  marca?: string;
  descripcion?: string;
}

export interface ImportRowResult {
  line: number;
  sku: string;
  ok: boolean;
  error?: string;
  note?: string;
}

const UNIT_ALIASES: Record<string, ProductUnit> = {
  unit: 'UNIT',
  unidad: 'UNIT',
  und: 'UNIT',
  box: 'BOX',
  caja: 'BOX',
  pack: 'PACK',
  paquete: 'PACK',
  kg: 'KG',
  kilogramo: 'KG',
  gram: 'GRAM',
  gramo: 'GRAM',
  liter: 'LITER',
  litro: 'LITER',
  meter: 'METER',
  metro: 'METER',
  service: 'SERVICE',
  servicio: 'SERVICE',
};

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Crea productos en lote a partir de filas de un CSV. Cada fila se valida con
 * el mismo `productSchema` y se crea con el mismo servicio que la alta manual,
 * por lo que respeta unicidad de SKU/código y genera el movimiento de stock
 * inicial. Devuelve el resultado por fila para mostrar errores puntuales.
 */
export async function importProductsAction(
  rows: ProductImportRow[],
): Promise<ActionResult<{ created: number; results: ImportRowResult[] }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.PRODUCTS_CREATE);

    if (!Array.isArray(rows) || rows.length === 0) {
      throw errors.validation('El archivo no contiene filas para importar.');
    }
    if (rows.length > 500) {
      throw errors.validation('Máximo 500 productos por importación. Divide el archivo en partes.');
    }

    const categories = await categoryRepository.list(ctx.actor.organizationId);
    const categoryByName = new Map(categories.map((c) => [normalizeKey(c.name), c.id]));

    const results: ImportRowResult[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const line = i + 2; // +1 por el encabezado, +1 para numerar desde 1.
      const sku = (raw.sku ?? '').trim();

      try {
        let note: string | undefined;
        const unitKey = normalizeKey(raw.unidad ?? 'unidad');
        const unit = UNIT_ALIASES[unitKey] ?? 'UNIT';

        let categoryId: string | null = null;
        if (raw.categoria && raw.categoria.trim()) {
          categoryId = categoryByName.get(normalizeKey(raw.categoria)) ?? null;
          if (!categoryId) {
            note = `La categoría "${raw.categoria.trim()}" no existe; el producto se creó sin categoría.`;
          }
        }

        const ivaPercent = Number(raw.iva ?? '') || 0;
        const candidate = {
          sku,
          barcode: raw.codigo_barras?.trim() || null,
          name: (raw.nombre ?? '').trim(),
          description: raw.descripcion?.trim() || null,
          categoryId,
          brand: raw.marca?.trim() || null,
          unit,
          cost: Number(raw.costo ?? '') || 0,
          salePrice: Number(raw.precio_venta ?? ''),
          wholesalePrice: Number(raw.precio_mayorista ?? '') || 0,
          taxRate: Math.round(ivaPercent * 100), // porcentaje → puntos base
          minimumStock: Number(raw.stock_minimo ?? '') || 0,
          initialStock: Number(raw.stock_inicial ?? '') || 0,
          tracksInventory: unit !== 'SERVICE',
          status: 'ACTIVE' as const,
        };

        const parsed = productSchema.safeParse(candidate);
        if (!parsed.success) {
          results.push({
            line,
            sku,
            ok: false,
            error: parsed.error.issues[0]?.message ?? 'Datos inválidos.',
          });
          continue;
        }

        await catalogService.createProduct(ctx.actor, parsed.data, ctx.defaultWarehouseId);
        created++;
        results.push({ line, sku, ok: true, note });
      } catch (error) {
        results.push({
          line,
          sku,
          ok: false,
          error: error instanceof Error ? error.message : 'No se pudo crear el producto.',
        });
      }
    }

    revalidatePath('/inventario');
    return ok({ created, results });
  } catch (error) {
    logError('catalog.importProducts', error);
    return fail(error);
  }
}

/** Búsqueda por código de barras, para el lector del punto de venta. */
export async function findProductByBarcodeAction(
  barcode: string,
): Promise<ActionResult<Product | null>> {
  try {
    const { session } = await getActorContext(PERMISSIONS.PRODUCTS_VIEW);
    const product = await productRepository.findByBarcode(session.organizationId, barcode);
    return ok(product);
  } catch (error) {
    return fail(error);
  }
}

'use server';

import { revalidatePath } from 'next/cache';

import { fail, logError, ok, type ActionResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/rbac';
import { productRepository } from '@/lib/repositories/catalog';
import { getActorContext, getOperationContext } from '@/lib/server-context';
import { catalogService } from '@/lib/services/catalog';
import { parseOrThrow } from '@/lib/validation/parse';
import { categorySchema, productSchema } from '@/lib/validation/schemas';
import type { Product } from '@/types/catalog';

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

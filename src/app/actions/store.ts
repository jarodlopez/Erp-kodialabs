'use server';

import { revalidatePath } from 'next/cache';

import { errors, fail, logError, ok, type ActionResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/rbac';
import { storeSettingsRepository } from '@/lib/repositories/store';
import { getActorContext, getOperationContext } from '@/lib/server-context';
import { storeOrderService } from '@/lib/services/store-orders';
import { storeService } from '@/lib/services/store';
import { parseOrThrow } from '@/lib/validation/parse';
import {
  approveStoreOrderSchema,
  storeBannerSchema,
  storeDiscountSchema,
  storeListingSchema,
  storeOrderResolutionSchema,
  storeSettingsSchema,
} from '@/lib/validation/schemas';
import type { PaymentMethod } from '@/types/finance';

/**
 * Acciones del módulo de tienda online.
 *
 * Aprobar un pedido mueve inventario y dinero, así que además del permiso de
 * la tienda exige el de crear ventas: quien no puede facturar en el ERP
 * tampoco puede hacerlo por la puerta de atrás del canal web.
 */

function refreshStore(slug?: string | null) {
  revalidatePath('/tienda');
  revalidatePath('/tienda/catalogo');
  revalidatePath('/tienda/pedidos');
  if (slug) revalidatePath(`/t/${slug}`, 'layout');
}

// ---------------------------------------------------------------------------
// Configuración y vitrina
// ---------------------------------------------------------------------------

export async function saveStoreSettingsAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.STORE_MANAGE);
    const data = parseOrThrow(storeSettingsSchema, input);
    const previous = await storeSettingsRepository.get(actor.organizationId);

    await storeService.updateSettings(actor, data);

    refreshStore(data.slug);
    // Si cambió la dirección pública, hay que refrescar también la anterior.
    if (previous && previous.slug !== data.slug) revalidatePath(`/t/${previous.slug}`, 'layout');
    revalidatePath('/tienda/diseno');
    return ok();
  } catch (error) {
    logError('store.saveSettings', error);
    return fail(error);
  }
}

export async function saveStoreListingAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.STORE_MANAGE);
    const data = parseOrThrow(storeListingSchema, input);
    const id = await storeService.saveListing(actor, data);

    const settings = await storeSettingsRepository.get(actor.organizationId);
    refreshStore(settings?.slug);
    return ok({ id });
  } catch (error) {
    logError('store.saveListing', error);
    return fail(error);
  }
}

export async function setStoreListingVisibilityAction(
  productId: string,
  visible: boolean,
): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.STORE_MANAGE);
    await storeService.setListingVisibility(actor, productId, visible);

    const settings = await storeSettingsRepository.get(actor.organizationId);
    refreshStore(settings?.slug);
    return ok();
  } catch (error) {
    logError('store.setListingVisibility', error);
    return fail(error);
  }
}

export async function removeStoreListingAction(productId: string): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.STORE_MANAGE);
    await storeService.removeListing(actor, productId);

    const settings = await storeSettingsRepository.get(actor.organizationId);
    refreshStore(settings?.slug);
    return ok();
  } catch (error) {
    logError('store.removeListing', error);
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Cupones y pop-ups
// ---------------------------------------------------------------------------

export async function saveStoreDiscountAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.STORE_MANAGE);
    const data = parseOrThrow(storeDiscountSchema, input);
    const discountId = await storeService.saveDiscount(actor, id, data);
    revalidatePath('/tienda/descuentos');
    return ok({ id: discountId });
  } catch (error) {
    logError('store.saveDiscount', error);
    return fail(error);
  }
}

export async function setStoreDiscountStatusAction(
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.STORE_MANAGE);
    await storeService.setDiscountStatus(actor, id, status);
    revalidatePath('/tienda/descuentos');
    return ok();
  } catch (error) {
    logError('store.setDiscountStatus', error);
    return fail(error);
  }
}

export async function saveStoreBannerAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.STORE_MANAGE);
    const data = parseOrThrow(storeBannerSchema, input);
    const bannerId = await storeService.saveBanner(actor, id, data);

    const settings = await storeSettingsRepository.get(actor.organizationId);
    revalidatePath('/tienda/popups');
    if (settings) revalidatePath(`/t/${settings.slug}`, 'layout');
    return ok({ id: bannerId });
  } catch (error) {
    logError('store.saveBanner', error);
    return fail(error);
  }
}

export async function deleteStoreBannerAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.STORE_MANAGE);
    await storeService.deleteBanner(actor, id);

    const settings = await storeSettingsRepository.get(actor.organizationId);
    revalidatePath('/tienda/popups');
    if (settings) revalidatePath(`/t/${settings.slug}`, 'layout');
    return ok();
  } catch (error) {
    logError('store.deleteBanner', error);
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export async function approveStoreOrderAction(
  input: unknown,
): Promise<ActionResult<{ saleId: string; saleNumber: string }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.STORE_ORDERS_MANAGE);
    if (!ctx.actor.permissions.includes(PERMISSIONS.SALES_CREATE)) {
      throw errors.forbidden('Aprobar un pedido genera una venta y requiere ese permiso.');
    }

    const data = parseOrThrow(approveStoreOrderSchema, input);

    const result = await storeOrderService.approve(ctx, data.orderId, {
      payment: data.accountId
        ? {
            accountId: data.accountId,
            method: data.method as PaymentMethod,
            reference: data.reference,
          }
        : null,
      note: data.note,
    });

    revalidatePath('/tienda');
    revalidatePath('/tienda/pedidos');
    revalidatePath(`/tienda/pedidos/${data.orderId}`);
    revalidatePath('/ventas');
    revalidatePath('/inventario');
    revalidatePath('/finanzas');
    revalidatePath('/');
    return ok({ saleId: result.saleId, saleNumber: result.saleNumber });
  } catch (error) {
    logError('store.approveOrder', error);
    return fail(error);
  }
}

export async function rejectStoreOrderAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.STORE_ORDERS_MANAGE);
    const data = parseOrThrow(storeOrderResolutionSchema, input);
    await storeOrderService.resolveWithoutSale(actor, data.orderId, 'REJECTED', data.note);

    revalidatePath('/tienda');
    revalidatePath('/tienda/pedidos');
    revalidatePath(`/tienda/pedidos/${data.orderId}`);
    return ok();
  } catch (error) {
    logError('store.rejectOrder', error);
    return fail(error);
  }
}

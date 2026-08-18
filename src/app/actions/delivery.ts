'use server';

import { revalidatePath } from 'next/cache';

import { fail, logError, ok, type ActionResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/rbac';
import { getActorContext, getOperationContext } from '@/lib/server-context';
import { deliveryService } from '@/lib/services/delivery';
import { parseOrThrow } from '@/lib/validation/parse';
import {
  assignDeliverySchema,
  cancelDeliverySchema,
  createDeliverySchema,
  deliverySettingsSchema,
  finishDeliverySchema,
  trackPingSchema,
} from '@/lib/validation/schemas';
import type { PingResult } from '@/types/delivery';

/**
 * Acciones del módulo de reparto.
 *
 * Hay dos públicos con permisos distintos y conviene no confundirlos:
 *
 *  - QUIEN DESPACHA (`delivery.manage`) crea, asigna, anula y tarifa. Trabaja
 *    desde el panel.
 *  - EL RIDER (`delivery.ride`) solo arranca, informa posición y cierra SU
 *    reparto. El servicio verifica además que el reparto sea suyo, porque el
 *    permiso dice "puede repartir", no "puede repartir cualquier cosa".
 */

function refreshDeliveries(deliveryId?: string | null) {
  revalidatePath('/repartos');
  if (deliveryId) revalidatePath(`/repartos/${deliveryId}`);
}

// ---------------------------------------------------------------------------
// Despacho
// ---------------------------------------------------------------------------

export async function createDeliveryAction(
  input: unknown,
): Promise<ActionResult<{ deliveryId: string; number: string }>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.DELIVERY_MANAGE);
    const data = parseOrThrow(createDeliverySchema, input);
    const result = await deliveryService.create(actor, data);

    refreshDeliveries(result.deliveryId);
    // El documento de origen muestra el reparto en su ficha, así que también
    // hay que refrescarlo para que aparezca sin recargar a mano.
    revalidatePath(data.source === 'SALE' ? `/ventas/${data.sourceId}` : '/tienda/pedidos');
    return ok(result);
  } catch (error) {
    logError('delivery.create', error);
    return fail(error);
  }
}

export async function assignDeliveryAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.DELIVERY_MANAGE);
    const data = parseOrThrow(assignDeliverySchema, input);
    await deliveryService.assign(actor, data.deliveryId, data.riderId);

    refreshDeliveries(data.deliveryId);
    revalidatePath('/reparto');
    return ok();
  } catch (error) {
    logError('delivery.assign', error);
    return fail(error);
  }
}

export async function cancelDeliveryAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.DELIVERY_MANAGE);
    const data = parseOrThrow(cancelDeliverySchema, input);
    await deliveryService.cancel(actor, data.deliveryId, data.note);

    refreshDeliveries(data.deliveryId);
    revalidatePath('/reparto');
    return ok();
  } catch (error) {
    logError('delivery.cancel', error);
    return fail(error);
  }
}

export async function saveDeliverySettingsAction(
  input: unknown,
): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.DELIVERY_MANAGE);
    const data = parseOrThrow(deliverySettingsSchema, input);
    await deliveryService.updateSettings(actor, data);

    revalidatePath('/repartos/tarifas');
    refreshDeliveries();
    return ok();
  } catch (error) {
    logError('delivery.saveSettings', error);
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Rider
// ---------------------------------------------------------------------------

export async function startDeliveryAction(deliveryId: string): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.DELIVERY_RIDE);
    await deliveryService.start(actor, deliveryId);

    revalidatePath('/reparto');
    revalidatePath(`/reparto/${deliveryId}`);
    refreshDeliveries(deliveryId);
    return ok();
  } catch (error) {
    logError('delivery.start', error);
    return fail(error);
  }
}

/**
 * Cierra el reparto. Exige el contexto completo de operación porque puede
 * terminar registrando un gasto en la contabilidad, y eso necesita la
 * configuración del comercio (moneda, impuestos) además del permiso.
 */
export async function finishDeliveryAction(
  input: unknown,
): Promise<ActionResult<{ cost: number; riderPay: number; expenseId: string | null }>> {
  try {
    const ctx = await getOperationContext(PERMISSIONS.DELIVERY_RIDE);
    const data = parseOrThrow(finishDeliverySchema, input);
    const result = await deliveryService.finish(ctx, data.deliveryId, {
      status: data.status,
      note: data.note,
    });

    revalidatePath('/reparto');
    revalidatePath(`/reparto/${data.deliveryId}`);
    refreshDeliveries(data.deliveryId);
    return ok(result);
  } catch (error) {
    logError('delivery.finish', error);
    return fail(error);
  }
}

/**
 * Registra una marca de posición.
 *
 * Es la acción más frecuente del ERP: una cada `pingSeconds` por rider en
 * camino. No revalida NINGUNA ruta a propósito — hacerlo invalidaría la caché
 * del panel entero cada medio minuto. El mapa en vivo se refresca por su
 * cuenta, leyendo los repartos activos.
 */
export async function pingDeliveryAction(
  deliveryId: string,
  input: unknown,
): Promise<ActionResult<PingResult>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.DELIVERY_RIDE);
    const data = parseOrThrow(trackPingSchema, input);
    return ok(await deliveryService.recordPing(actor, deliveryId, data));
  } catch (error) {
    logError('delivery.ping', error);
    return fail(error);
  }
}

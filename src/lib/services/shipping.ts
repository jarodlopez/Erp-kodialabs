import 'server-only';

/**
 * Producto de servicio "Envío a domicilio".
 *
 * El cobro del envío no puede ser un campo suelto del documento: tiene que
 * viajar como una LÍNEA de la venta. Solo así el total de la venta coincide con
 * lo que el cliente pagó, el ingreso por envío entra al estado de resultados y
 * el impuesto se calcula sobre él como sobre cualquier otra venta.
 *
 * Ese producto tiene que ser UNO SOLO por organización — da igual si el envío
 * vino de la tienda online o de una venta escrita a mano. Si hubiera uno por
 * canal, la pregunta "cuánto facturé en envíos" tendría dos respuestas y
 * ninguna completa.
 */
import { errors } from '@/lib/errors';
import { organizationRepository, warehouseRepository } from '@/lib/repositories/organization';
import { productRepository } from '@/lib/repositories/catalog';
import type { ActorContext, Id } from '@/types/common';
import type { Settings } from '@/types/organization';
import { catalogService } from './catalog';

/**
 * SKU del producto de envío.
 *
 * Se conserva `ENVIO-WEB` aunque ya no sea solo de la web: es la llave por la
 * que se reconoce el producto que las organizaciones existentes ya tienen
 * creado desde la tienda. Renombrarlo crearía un segundo producto de envío y
 * partiría el histórico en dos.
 */
export const SHIPPING_SKU = 'ENVIO-WEB';

/**
 * Devuelve el producto de envío de la organización, creándolo la primera vez.
 *
 * Busca en tres pasos, y el orden importa:
 *  1. el id guardado en la configuración — el camino normal, sin consultas;
 *  2. el SKU — así una organización que ya lo tenía por la tienda reutiliza
 *     *ese mismo* producto en lugar de estrenar uno;
 *  3. lo crea.
 *
 * No lleva inventario ni costo: es un servicio, no mercadería. Si llevara
 * existencias, cada envío intentaría descontar stock de algo que no existe.
 */
export async function ensureShippingProduct(
  actor: ActorContext,
  settings: Settings,
): Promise<Id> {
  if (settings.shippingProductId) {
    const existing = await productRepository.get(actor.organizationId, settings.shippingProductId);
    if (existing) return existing.id;
  }

  const bySku = await productRepository.findBySku(actor.organizationId, SHIPPING_SKU);
  const productId =
    bySku?.id ??
    (await catalogService.createProduct(
      actor,
      {
        sku: SHIPPING_SKU,
        name: 'Envío a domicilio',
        description: 'Cobro del envío. Se agrega como línea de la venta.',
        unit: 'SERVICE',
        cost: 0,
        salePrice: 0,
        wholesalePrice: 0,
        // Sin impuesto por defecto: en la mayoría de los países el flete se
        // grava distinto que la mercadería, y ponerle el impuesto general por
        // omisión sería decidir por el contador. Se edita desde Inventario.
        taxRate: 0,
        minimumStock: 0,
        tracksInventory: false,
        status: 'ACTIVE',
      },
      (await warehouseRepository.getDefault(actor.organizationId)).id,
    ));

  await organizationRepository.saveSettings(
    actor.organizationId,
    { shippingProductId: productId },
    actor.userId,
  );

  return productId;
}

/**
 * Valida el cobro de envío contra los datos de entrega.
 *
 * Cobrar un envío sin dirección a dónde llevarlo es un error de captura, no una
 * venta: se corta acá antes de que quede un ingreso por un servicio que nadie
 * sabe prestar.
 */
export function assertShippingIsDeliverable(
  shippingCost: number,
  delivery: { address?: string | null } | null | undefined,
): void {
  if (shippingCost > 0 && !delivery?.address?.trim()) {
    throw errors.validation(
      'Para cobrar el envío hace falta la dirección de entrega.',
      { 'delivery.address': 'Escribe a dónde hay que llevarlo.' },
    );
  }
}

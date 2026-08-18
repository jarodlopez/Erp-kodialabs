import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { logError, toAppError } from '@/lib/errors';
import { previewStorefrontDiscount } from '@/lib/services/store-orders';
import { parseOrThrow } from '@/lib/validation/parse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Previsualización de cupón para el checkout público.
 *
 * Sirve para que el comprador sepa si su código vale MIENTRAS llena el
 * formulario. Es de solo lectura: no consume el uso del cupón ni crea nada, así
 * que se puede llamar en cada cambio del carrito. El importe que devuelve es
 * informativo; el definitivo lo fija el servidor al crear el pedido.
 *
 * Sin sesión, como el resto de la tienda: la organización se resuelve por el
 * slug de la URL y del cuerpo solo se leen el código y los `productId` con su
 * cantidad. El subtotal se recalcula contra el catálogo publicado —jamás llega
 * del navegador—, de modo que un `localStorage` editado a mano no alcanza
 * mínimos de compra que no cumple.
 */

/** Tope del cuerpo: 50 líneas de `{productId, quantity}` caben de sobra. */
const MAX_BODY_BYTES = 8 * 1024;

/**
 * El esquema vive aquí y no en `schemas.ts` porque describe el contrato de esta
 * ruta pública, que nada más consume el checkout de la tienda.
 */
const couponPreviewSchema = z.object({
  code: z
    .string({ error: 'Escribe un código.' })
    .trim()
    .min(1, 'Escribe un código.')
    .max(24, 'El código es demasiado largo.'),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1, 'Identificador inválido.').max(128),
        quantity: z.coerce
          .number({ error: 'La cantidad debe ser un número.' })
          .int('La cantidad debe ser un número entero.')
          .positive('La cantidad debe ser mayor que cero.')
          .max(500, 'La cantidad es demasiado grande.'),
      }),
    )
    .min(1, 'Tu carrito está vacío.')
    .max(50, 'El carrito tiene demasiadas líneas.'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    // Se lee como texto para poder cortar por tamaño antes de parsear: un
    // endpoint público sin sesión no debería gastar CPU en cuerpos absurdos.
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'La petición es demasiado grande.' }, { status: 413 });
    }

    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }

    const data = parseOrThrow(couponPreviewSchema, body);
    const result = await previewStorefrontDiscount(slug, data.code, data.items);

    return NextResponse.json(result);
  } catch (error) {
    const app = logError('storefront.previewDiscount', error);
    return NextResponse.json({ error: app.message }, { status: toAppError(error).httpStatus });
  }
}

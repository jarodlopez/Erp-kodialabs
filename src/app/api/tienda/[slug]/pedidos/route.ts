import { NextResponse, type NextRequest } from 'next/server';

import { logError, toAppError } from '@/lib/errors';
import { storeOrderService } from '@/lib/services/store-orders';
import { parseOrThrow } from '@/lib/validation/parse';
import { storefrontOrderSchema } from '@/lib/validation/schemas';
import type { CreateStoreOrderInput } from '@/types/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Recepción de pedidos de la tienda pública.
 *
 * Es la única escritura del ERP que se acepta sin sesión. La organización se
 * deduce del slug de la URL —nunca la manda el navegador— y del cuerpo solo se
 * respetan identificadores y cantidades: precios, envío, cupón y total los
 * recalcula el servidor contra el catálogo publicado.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await request.json().catch(() => null);
    const data = parseOrThrow(storefrontOrderSchema, body);

    const result = await storeOrderService.createFromStorefront(
      slug,
      data as unknown as CreateStoreOrderInput,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const app = logError('storefront.createOrder', error);
    return NextResponse.json(
      { error: app.message, fieldErrors: app.fieldErrors ?? undefined },
      { status: toAppError(error).httpStatus },
    );
  }
}

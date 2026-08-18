import { NextResponse, type NextRequest } from 'next/server';

import { logError, toAppError } from '@/lib/errors';
import { uploadImageToImgbb } from '@/lib/imgbb';
import { storeOrderService } from '@/lib/services/store-orders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Comprobante de pago del comprador.
 *
 * La subida es pública porque quien paga no tiene cuenta en el ERP, pero está
 * acotada por partida doble: el archivo se valida antes de salir hacia ImgBB y
 * solo se acepta contra un pedido de ESA tienda que siga pendiente de
 * revisión, así que no sirve como almacenamiento gratuito de terceros.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const formData = await request.formData();

    const orderId = String(formData.get('orderId') ?? '').trim();
    const reference = String(formData.get('reference') ?? '').trim() || null;
    const file = formData.get('file');

    if (!orderId) {
      return NextResponse.json({ error: 'Falta el pedido.' }, { status: 400 });
    }

    // Primero el pedido, después la imagen: no se sube nada por una petición
    // que de todos modos iba a ser rechazada.
    await storeOrderService.requireReceivableOrder(slug, orderId);

    const upload = await uploadImageToImgbb(file as File, `comprobante-${orderId}`);
    await storeOrderService.attachReceipt(slug, orderId, upload.url, reference);

    return NextResponse.json({ ok: true, url: upload.url });
  } catch (error) {
    const app = logError('storefront.uploadReceipt', error);
    return NextResponse.json({ error: app.message }, { status: toAppError(error).httpStatus });
  }
}

import { NextResponse, type NextRequest } from 'next/server';

import { logError, toAppError } from '@/lib/errors';
import { uploadImageToImgbb } from '@/lib/imgbb';
import { PERMISSIONS } from '@/lib/rbac';
import { getActorContext } from '@/lib/server-context';
import { audit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Subida de imágenes públicas de la tienda (fichas, logo, hero, pop-ups).
 *
 * La API key de ImgBB vive solo en el servidor: el navegador manda el archivo
 * aquí y recibe de vuelta la URL ya publicada. El permiso exigido es el mismo
 * que hace falta para editar la tienda, de modo que nadie con acceso de solo
 * lectura puede gastar la cuota de la cuenta de imágenes.
 */
export async function POST(request: NextRequest) {
  try {
    const { session, actor } = await getActorContext(PERMISSIONS.STORE_MANAGE);

    const formData = await request.formData();
    const file = formData.get('file');

    const result = await uploadImageToImgbb(
      file as File,
      `${session.organizationId}-${Date.now()}`,
    );

    await audit(actor, {
      action: 'CREATE',
      module: 'STORE',
      entityType: 'image',
      entityId: result.url,
      entityLabel: file instanceof File ? file.name : 'imagen',
      metadata: { width: result.width, height: result.height },
    });

    return NextResponse.json({ ok: true, url: result.url });
  } catch (error) {
    const app = logError('store.imgbbUpload', error);
    return NextResponse.json({ error: app.message }, { status: toAppError(error).httpStatus });
  }
}

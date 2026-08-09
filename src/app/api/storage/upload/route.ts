import { NextResponse, type NextRequest } from 'next/server';

import { logError, toAppError } from '@/lib/errors';
import { getStorageBucket } from '@/lib/firebase/admin';
import { PERMISSIONS } from '@/lib/rbac';
import { getActorContext } from '@/lib/server-context';
import { audit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

type UploadKind = 'product' | 'receipt' | 'logo';

/**
 * Subida de archivos a Firebase Storage a través del servidor.
 *
 * La validación (tipo MIME, tamaño, permisos y organización) ocurre aquí, no
 * en el navegador. Las rutas siempre incluyen `organizationId`, de modo que las
 * Storage Rules pueden garantizar el aislamiento entre organizaciones.
 */
export async function POST(request: NextRequest) {
  try {
    const { session, actor } = await getActorContext(PERMISSIONS.PRODUCTS_UPDATE);

    const formData = await request.formData();
    const file = formData.get('file');
    const kind = (String(formData.get('kind') ?? 'product') as UploadKind) ?? 'product';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'El archivo supera el tamaño máximo de 5 MB.' },
        { status: 413 },
      );
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Formato no permitido. Usa JPG, PNG, WEBP, GIF o PDF.' },
        { status: 415 },
      );
    }

    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const path = `organizations/${session.organizationId}/${kind}/${safeName}`;

    const bucket = getStorageBucket();
    const blob = bucket.file(path);
    const buffer = Buffer.from(await file.arrayBuffer());

    await blob.save(buffer, {
      contentType: file.type,
      metadata: {
        metadata: {
          organizationId: session.organizationId,
          uploadedBy: session.uid,
          originalName: file.name,
        },
      },
    });

    // Las imágenes de catálogo se sirven públicamente; los comprobantes
    // permanecen privados y se acceden mediante URL firmada temporal.
    let url: string;
    if (kind === 'receipt') {
      const [signed] = await blob.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      url = signed;
    } else {
      await blob.makePublic();
      url = `https://storage.googleapis.com/${bucket.name}/${encodeURI(path)}`;
    }

    await audit(actor, {
      action: 'CREATE',
      module: 'SYSTEM',
      entityType: 'file',
      entityId: path,
      entityLabel: file.name,
      metadata: { kind, size: file.size, contentType: file.type },
    });

    return NextResponse.json({ ok: true, url, path });
  } catch (error) {
    const app = logError('storage.upload', error);
    return NextResponse.json(
      { error: app.message },
      { status: toAppError(error).httpStatus },
    );
  }
}

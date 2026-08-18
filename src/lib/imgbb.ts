import 'server-only';

/**
 * Subida de imágenes a ImgBB.
 *
 * DECISIÓN — POR QUÉ ImgBB Y NO FIREBASE STORAGE
 * ----------------------------------------------
 * Las imágenes de la tienda son públicas por definición y se piden desde
 * cualquier navegador sin sesión. ImgBB las sirve gratis desde su CDN y
 * `optimizeImg` las pasa por `wsrv.nl` para entregarlas en WebP al ancho
 * exacto de cada vista. Los archivos privados del ERP (comprobantes de
 * compra, logos internos) siguen yendo a Firebase Storage, donde las Storage
 * Rules imponen el aislamiento por organización.
 *
 * La API key JAMÁS llega al navegador: toda subida pasa por el servidor, que
 * valida tipo, tamaño y permisos antes de reenviar el archivo.
 */
import { AppError, errors } from '@/lib/errors';

const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';

export const IMGBB_MAX_BYTES = 8 * 1024 * 1024;

export const IMGBB_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function imgbbConfigured(): boolean {
  return Boolean(process.env.IMGBB_API_KEY);
}

function apiKey(): string {
  const key = process.env.IMGBB_API_KEY;
  if (!key) {
    throw errors.configuration(
      'Falta la variable IMGBB_API_KEY. Configúrala para subir imágenes de la tienda.',
    );
  }
  return key;
}

/** Valida un archivo recibido por formulario antes de gastarlo en una subida. */
export function assertUploadableImage(file: unknown): asserts file is File {
  if (!(file instanceof File)) {
    throw errors.validation('No se recibió ninguna imagen.');
  }
  if (file.size === 0) {
    throw errors.validation('La imagen está vacía.');
  }
  if (file.size > IMGBB_MAX_BYTES) {
    throw errors.validation(
      `La imagen supera el tamaño máximo de ${Math.round(IMGBB_MAX_BYTES / (1024 * 1024))} MB.`,
    );
  }
  if (!IMGBB_ALLOWED_TYPES.has(file.type)) {
    throw errors.validation('Formato no permitido. Usa JPG, PNG, WEBP o GIF.');
  }
}

export interface ImgbbResult {
  url: string;
  /** URL de borrado que devuelve ImgBB; se guarda por si hay que limpiar. */
  deleteUrl: string | null;
  width: number | null;
  height: number | null;
}

interface ImgbbResponse {
  success?: boolean;
  error?: { message?: string };
  data?: {
    url?: string;
    display_url?: string;
    delete_url?: string;
    width?: number | string;
    height?: number | string;
  };
}

function toNumber(value: number | string | undefined): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Sube un archivo ya validado y devuelve su URL pública.
 * `name` es solo cosmético dentro de ImgBB.
 */
export async function uploadImageToImgbb(file: File, name?: string): Promise<ImgbbResult> {
  assertUploadableImage(file);

  const body = new FormData();
  body.append('image', file, file.name || 'imagen');
  if (name) body.append('name', name.slice(0, 80));

  let response: Response;
  try {
    response = await fetch(`${IMGBB_ENDPOINT}?key=${encodeURIComponent(apiKey())}`, {
      method: 'POST',
      body,
      // Sin caché: cada subida es un recurso nuevo.
      cache: 'no-store',
    });
  } catch (cause) {
    throw new AppError('INTERNAL', 'No se pudo contactar el servicio de imágenes. Intenta de nuevo.', {
      technical: String(cause),
      cause,
    });
  }

  const payload = (await response.json().catch(() => null)) as ImgbbResponse | null;

  if (!response.ok || !payload?.success || !payload.data) {
    throw new AppError('INTERNAL', 'El servicio de imágenes rechazó la subida.', {
      technical: payload?.error?.message ?? `HTTP ${response.status}`,
    });
  }

  const url = payload.data.display_url ?? payload.data.url;
  if (!url) {
    throw new AppError('INTERNAL', 'El servicio de imágenes no devolvió una URL válida.');
  }

  return {
    url,
    deleteUrl: payload.data.delete_url ?? null,
    width: toNumber(payload.data.width),
    height: toNumber(payload.data.height),
  };
}

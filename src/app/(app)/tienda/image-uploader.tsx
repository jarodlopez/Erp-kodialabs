'use client';

import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

import { Button } from '@/components/ui/primitives';
import { optimizeImg } from '@/lib/images';

/**
 * Subida de imágenes a ImgBB desde el panel.
 *
 * El archivo se comprime en el navegador antes de salir —una foto de varios
 * megas suele quedar en 150-250 KB— y luego viaja al servidor, que es quien
 * tiene la API key. El navegador nunca la ve.
 */

const MAX_DIMENSION = 1400;
const WEBP_QUALITY = 0.82;

/**
 * Redimensiona y convierte a WebP en el navegador. Ante cualquier problema
 * devuelve el archivo original: subir una imagen pesada es mejor que no subir
 * nada. Los GIF (posible animación) y los SVG (vectoriales) se dejan intactos.
 */
async function compressImage(file: File): Promise<File> {
  try {
    if (!file.type.startsWith('image/')) return file;
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = dataUrl;
    });

    let { width, height } = image;
    if (!width || !height) return file;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagen';
    return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
  } catch {
    return file;
  }
}

export async function uploadImage(file: File): Promise<string> {
  const optimized = await compressImage(file);
  const body = new FormData();
  body.append('file', optimized);

  const response = await fetch('/api/storage/imgbb', { method: 'POST', body });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'No se pudo subir la imagen.');
  return String(payload.url);
}

/** Galería editable: sube a ImgBB y devuelve las URLs al formulario. */
export function ImageUploader({
  images,
  onChange,
  max = 8,
  label = 'Imágenes',
  hint,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      const room = Math.max(0, max - images.length);
      const uploaded: string[] = [];
      for (const file of files.slice(0, room)) {
        uploaded.push(await uploadImage(file));
      }
      onChange([...images, ...uploaded]);
      if (files.length > room) {
        setError(`Solo se admiten ${max} imágenes; se ignoraron las demás.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo subir la imagen.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--color-ink-muted)]">{label}</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => inputRef.current?.click()}
          disabled={images.length >= max}
        >
          <ImagePlus className="h-3.5 w-3.5" /> Subir
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple={max > 1}
        className="hidden"
        onChange={onPick}
      />

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={image} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizeImg(image, 400)}
                alt={`Imagen ${index + 1}`}
                className="h-20 w-16 rounded-md border border-[var(--color-border)] object-cover"
              />
              {index === 0 && (
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center text-[10px] text-white">
                  Portada
                </span>
              )}
              <button
                type="button"
                onClick={() => onChange(images.filter((item) => item !== image))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--color-danger-500)] p-0.5 text-white"
                aria-label={`Quitar imagen ${index + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {hint && <p className="text-xs text-[var(--color-ink-subtle)]">{hint}</p>}
      {error && <p className="text-xs text-[var(--color-danger-700)]">{error}</p>}
    </div>
  );
}

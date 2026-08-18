'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/primitives';

/**
 * Enlace público de la tienda, listo para pegar en redes sociales.
 *
 * Es la pieza que el comercio usa más seguido del módulo, así que se muestra
 * completa y con un botón de copiar en lugar de un texto que haya que
 * seleccionar a mano.
 */
export function StoreLink({
  url,
  path,
  shareable,
}: {
  /** URL absoluta. Vacía si el despliegue todavía no tiene dominio estable. */
  url: string;
  /** Ruta relativa, siempre válida dentro del propio despliegue. */
  path: string;
  /** `false` cuando la URL viene del despliegue y cambia en cada push. */
  shareable: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const display = url || path;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url || `${window.location.origin}${path}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles el usuario todavía puede seleccionar el
      // texto, que por eso se muestra completo y no truncado.
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] hover:border-[var(--color-brand-500)]"
          title={display}
        >
          {display}
        </a>
        <Button variant="secondary" size="sm" onClick={onCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
        <a href={path} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm">
            <ExternalLink className="h-3.5 w-3.5" /> Abrir
          </Button>
        </a>
      </div>

      {!shareable && (
        <p className="text-xs text-[var(--color-warning-700)]">
          Esta dirección corresponde a este despliegue y cambia con cada
          actualización: no sirve para redes sociales. Configura{' '}
          <code>NEXT_PUBLIC_SITE_URL</code> con tu dominio para obtener el enlace definitivo.
        </p>
      )}
    </div>
  );
}

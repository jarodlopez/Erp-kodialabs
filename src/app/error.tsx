'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AlertOctagon } from 'lucide-react';

import { Button, Card } from '@/components/ui/primitives';

/**
 * Pantalla de error global. Nunca se muestra el mensaje técnico original:
 * el detalle queda en los logs del servidor y aquí solo se ofrece una acción
 * de recuperación.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[ERP:ui]', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="max-w-md p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-50)] text-[var(--color-danger-700)]">
          <AlertOctagon className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">No pudimos completar la operación</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-subtle)]">
          Ocurrió un problema al procesar esta pantalla. Puedes reintentar; si el error persiste,
          comparte este código con el administrador del sistema.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-[var(--color-ink-subtle)]">
            Código: {error.digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Reintentar</Button>
          <Button variant="secondary" onClick={() => router.push('/')}>
            Ir al inicio
          </Button>
        </div>
      </Card>
    </div>
  );
}

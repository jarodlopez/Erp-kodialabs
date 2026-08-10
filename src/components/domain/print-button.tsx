'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/primitives';

/**
 * Botón que dispara el diálogo de impresión del navegador. En móvil (Android
 * Chrome) permite imprimir a una impresora o guardar como PDF.
 */
export function PrintButton({ label = 'Imprimir' }: { label?: string }) {
  return (
    <Button className="no-print" onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> {label}
    </Button>
  );
}

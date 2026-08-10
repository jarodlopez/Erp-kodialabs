'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine } from 'lucide-react';

import { findProductByBarcodeAction } from '@/app/actions/catalog';
import { BarcodeScanner } from '@/components/domain/barcode-scanner';
import { Button } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

/**
 * Botón de inventario que escanea un código de barras con la cámara y abre la
 * ficha del producto correspondiente. Si el código no existe, ofrece crearlo.
 */
export function ScanProductButton({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onDetect(code: string) {
    if (busy) return;
    setBusy(true);
    const result = await findProductByBarcodeAction(code);
    setBusy(false);
    setOpen(false);

    if (result.ok && result.data) {
      router.push(`/inventario/${result.data.id}`);
      return;
    }

    if (canCreate) {
      toast.info('Producto no encontrado', `El código ${code} no está registrado. Créalo desde "Nuevo producto".`);
      router.push('/inventario/nuevo');
    } else {
      toast.error('Producto no encontrado', `Ningún producto tiene el código ${code}.`);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <ScanLine className="h-4 w-4" /> Escanear
      </Button>
      <BarcodeScanner
        open={open}
        onClose={() => setOpen(false)}
        onDetect={onDetect}
        title="Escanear producto"
      />
    </>
  );
}

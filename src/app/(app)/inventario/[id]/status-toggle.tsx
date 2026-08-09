'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ban, CheckCircle2 } from 'lucide-react';

import { setProductStatusAction } from '@/app/actions/catalog';
import { Button } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

/**
 * Activa o desactiva un producto. Nunca se elimina físicamente para conservar
 * el historial de ventas, compras y movimientos.
 */
export function ProductStatusToggle({
  productId,
  status,
}: {
  productId: string;
  status: 'ACTIVE' | 'INACTIVE';
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const next = status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

  async function confirm() {
    setLoading(true);
    const result = await setProductStatusAction(productId, next);
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo cambiar el estado', result.error.message);
      return;
    }

    toast.success(next === 'ACTIVE' ? 'Producto activado' : 'Producto desactivado');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {status === 'ACTIVE' ? (
          <>
            <Ban className="h-4 w-4" /> Desactivar
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" /> Activar
          </>
        )}
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => !loading && setOpen(false)}
        onConfirm={confirm}
        loading={loading}
        tone={status === 'ACTIVE' ? 'danger' : 'primary'}
        title={status === 'ACTIVE' ? 'Desactivar producto' : 'Activar producto'}
        confirmLabel={status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
        message={
          status === 'ACTIVE'
            ? 'El producto dejará de aparecer en ventas y compras nuevas, pero se conservará todo su historial. Podrás reactivarlo cuando quieras.'
            : 'El producto volverá a estar disponible para ventas y compras.'
        }
      />
    </>
  );
}

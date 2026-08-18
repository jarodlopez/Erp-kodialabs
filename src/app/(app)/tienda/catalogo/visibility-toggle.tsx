'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { setStoreListingVisibilityAction } from '@/app/actions/store';
import { Button } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

/** Muestra u oculta una ficha sin perder su configuración. */
export function ListingVisibilityToggle({
  productId,
  visible,
}: {
  productId: string;
  visible: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function onToggle() {
    setLoading(true);
    const result = await setStoreListingVisibilityAction(productId, !visible);
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo cambiar la visibilidad', result.error.message);
      return;
    }
    toast.success(visible ? 'Producto oculto en la tienda' : 'Producto visible en la tienda');
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      loading={loading}
      aria-label={visible ? 'Ocultar de la tienda' : 'Mostrar en la tienda'}
    >
      {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </Button>
  );
}

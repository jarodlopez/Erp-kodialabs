'use client';

import { useState } from 'react';
import { PackagePlus } from 'lucide-react';

import { createPosProductAction } from '@/app/actions/catalog';
import { Button, Field, Input } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import type { Product } from '@/types/catalog';

/**
 * Alta rápida de producto SIN salir del POS. Pensado para vender al instante
 * artículos que no están precargados (p. ej. un pulguero): basta el nombre y el
 * precio; el producto queda creado y agregado al carrito.
 */
export function QuickProductDialog({
  open,
  onClose,
  onCreated,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (product: Product) => void;
  currency: string;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [tracks, setTracks] = useState(false);
  const [stock, setStock] = useState('');
  const [loading, setLoading] = useState(false);

  function reset() {
    setName('');
    setPrice('');
    setCost('');
    setTracks(false);
    setStock('');
  }

  async function submit() {
    if (loading) return;
    if (!name.trim()) {
      toast.error('Falta el nombre', 'Escribe cómo se llama el artículo.');
      return;
    }
    const priceNum = Number(price);
    if (!price || Number.isNaN(priceNum) || priceNum <= 0) {
      toast.error('Falta el precio', 'Indica un precio de venta mayor que cero.');
      return;
    }

    setLoading(true);
    const result = await createPosProductAction({
      name: name.trim(),
      salePrice: priceNum,
      cost: cost ? Number(cost) : 0,
      tracksInventory: tracks,
      initialStock: tracks && stock ? Number(stock) : 0,
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo crear', result.error.message);
      return;
    }

    toast.success('Producto creado', `${result.data.name} se agregó a la venta.`);
    onCreated(result.data);
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Nuevo producto"
      description="Créalo al instante y se agrega a la venta."
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={submit} loading={loading}>
            <PackagePlus className="h-4 w-4" /> Crear y agregar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre del artículo" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej. Lámpara vintage"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Precio de venta (${currency})`} required>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Costo (opcional)" hint="Para calcular tu ganancia.">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={tracks}
              onChange={(event) => setTracks(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border-strong)]"
            />
            Controlar inventario de este artículo
          </label>
          <p className="mt-1 text-xs text-[var(--color-ink-subtle)]">
            Déjalo apagado para artículos únicos (no descuenta existencias).
          </p>
          {tracks && (
            <div className="mt-3">
              <Field label="Existencia inicial">
                <Input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  value={stock}
                  onChange={(event) => setStock(event.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

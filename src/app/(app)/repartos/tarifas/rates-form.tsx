'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Save } from 'lucide-react';

import { saveDeliverySettingsAction } from '@/app/actions/delivery';
import { DeliveryMap, type MapMarker } from '@/components/domain/map';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { customerFee, deliveryCost, formatDistance } from '@/lib/geo';
import { formatMoney, toMajorUnits, toMinorUnits } from '@/lib/money';
import type { DeliverySettings, GeoPoint } from '@/types/delivery';

/**
 * Tarifas del reparto.
 *
 * Los importes se editan en unidades mayores (córdobas) y viajan así al
 * servidor, que los convierte a centavos. La previsualización de abajo existe
 * porque "C$15 por kilómetro" no dice nada hasta ver cuánto sale un reparto de
 * 5 km: sin ese número, cualquier tarifa se configura a ciegas.
 */

/** Distancia de referencia para la previsualización, en metros. */
const PREVIEW_METERS = 5000;

export function RatesForm({
  settings,
  categories,
  currency,
}: {
  settings: DeliverySettings;
  categories: { id: string; name: string }[];
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [origin, setOrigin] = useState<GeoPoint | null>(settings.origin);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [autoExpense, setAutoExpense] = useState(settings.autoRegisterExpense);

  // La previsualización se recalcula con lo que hay escrito en los campos, no
  // con lo guardado: sirve justamente para ver el efecto antes de guardar.
  const [preview, setPreview] = useState(() => ({
    costPerKm: toMajorUnits(settings.costPerKm),
    riderPayPerDelivery: toMajorUnits(settings.riderPayPerDelivery),
    riderPayPerKm: toMajorUnits(settings.riderPayPerKm),
    customerBaseFee: toMajorUnits(settings.customerBaseFee),
    customerFeePerKm: toMajorUnits(settings.customerFeePerKm),
    customerFreeKm: settings.customerFreeKm,
  }));

  function onPreviewChange(key: keyof typeof preview) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      setPreview((current) => ({ ...current, [key]: Number.isFinite(value) ? value : 0 }));
    };
  }

  const previewFee = customerFee(PREVIEW_METERS, {
    baseFee: toMinorUnits(preview.customerBaseFee),
    feePerKm: toMinorUnits(preview.customerFeePerKm),
    freeKm: preview.customerFreeKm,
  });
  const previewCost = deliveryCost(PREVIEW_METERS, {
    costPerKm: toMinorUnits(preview.costPerKm),
    riderPayPerDelivery: toMinorUnits(preview.riderPayPerDelivery),
    riderPayPerKm: toMinorUnits(preview.riderPayPerKm),
  });
  const previewMargin = previewFee - previewCost.total;

  const markers: MapMarker[] = [];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    setLoading(true);
    setFieldErrors({});

    const result = await saveDeliverySettingsAction({
      origin,
      costPerKm: Number(form.get('costPerKm') ?? 0),
      riderPayPerDelivery: Number(form.get('riderPayPerDelivery') ?? 0),
      riderPayPerKm: Number(form.get('riderPayPerKm') ?? 0),
      customerBaseFee: Number(form.get('customerBaseFee') ?? 0),
      customerFeePerKm: Number(form.get('customerFeePerKm') ?? 0),
      customerFreeKm: Number(form.get('customerFreeKm') ?? 0),
      roadFactor: Number(form.get('roadFactor') ?? 1.4),
      pingSeconds: Number(form.get('pingSeconds') ?? 30),
      maxAccuracyMeters: Number(form.get('maxAccuracyMeters') ?? 100),
      expenseCategoryId: String(form.get('expenseCategoryId') ?? ''),
      autoRegisterExpense: autoExpense,
    });

    setLoading(false);

    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar', result.error.message);
      return;
    }

    toast.success('Tarifas guardadas');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 p-4 sm:p-5">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Punto de partida</h3>
          <p className="text-xs text-[var(--color-ink-subtle)]">
            Desde acá se miden todas las distancias estimadas. Tocá el mapa para fijarlo.
          </p>
        </div>
        <DeliveryMap
          markers={markers}
          picked={origin}
          onPick={setOrigin}
          center={origin}
          height={320}
        />
        {origin ? (
          <p className="text-xs text-[var(--color-ink-subtle)]">
            Marcado en {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)}.
          </p>
        ) : (
          <p className="text-xs font-medium text-[var(--color-warning-700)]">
            Sin punto de partida no se puede despachar ningún reparto.
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <h3 className="text-sm font-semibold">Lo que le cobrás al cliente</h3>
          <p className="text-xs text-[var(--color-ink-subtle)]">
            Se calcula sobre la distancia ESTIMADA, antes de salir: el cliente acepta un precio y no
            se le cambia porque el rider tomó un desvío.
          </p>
        </div>
        <Field label={`Tarifa base (${currency})`} htmlFor="customerBaseFee" error={fieldErrors.customerBaseFee}>
          <Input
            id="customerBaseFee"
            name="customerBaseFee"
            type="number"
            step="0.01"
            min="0"
            defaultValue={toMajorUnits(settings.customerBaseFee)}
            onChange={onPreviewChange('customerBaseFee')}
          />
        </Field>
        <Field label="Kilómetros incluidos" htmlFor="customerFreeKm" error={fieldErrors.customerFreeKm}>
          <Input
            id="customerFreeKm"
            name="customerFreeKm"
            type="number"
            step="0.1"
            min="0"
            defaultValue={settings.customerFreeKm}
            onChange={onPreviewChange('customerFreeKm')}
          />
        </Field>
        <Field
          label={`Por km extra (${currency})`}
          htmlFor="customerFeePerKm"
          error={fieldErrors.customerFeePerKm}
        >
          <Input
            id="customerFeePerKm"
            name="customerFeePerKm"
            type="number"
            step="0.01"
            min="0"
            defaultValue={toMajorUnits(settings.customerFeePerKm)}
            onChange={onPreviewChange('customerFeePerKm')}
          />
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <h3 className="text-sm font-semibold">Lo que te cuesta a vos</h3>
          <p className="text-xs text-[var(--color-ink-subtle)]">
            Se calcula sobre el recorrido REAL que registró el teléfono del rider. Dejá los pagos al
            rider en cero si es empleado y su sueldo ya está en la nómina.
          </p>
        </div>
        <Field label={`Costo por km (${currency})`} htmlFor="costPerKm" error={fieldErrors.costPerKm}>
          <Input
            id="costPerKm"
            name="costPerKm"
            type="number"
            step="0.01"
            min="0"
            defaultValue={toMajorUnits(settings.costPerKm)}
            onChange={onPreviewChange('costPerKm')}
          />
        </Field>
        <Field
          label={`Pago al rider por entrega (${currency})`}
          htmlFor="riderPayPerDelivery"
          error={fieldErrors.riderPayPerDelivery}
        >
          <Input
            id="riderPayPerDelivery"
            name="riderPayPerDelivery"
            type="number"
            step="0.01"
            min="0"
            defaultValue={toMajorUnits(settings.riderPayPerDelivery)}
            onChange={onPreviewChange('riderPayPerDelivery')}
          />
        </Field>
        <Field
          label={`Pago al rider por km (${currency})`}
          htmlFor="riderPayPerKm"
          error={fieldErrors.riderPayPerKm}
        >
          <Input
            id="riderPayPerKm"
            name="riderPayPerKm"
            type="number"
            step="0.01"
            min="0"
            defaultValue={toMajorUnits(settings.riderPayPerKm)}
            onChange={onPreviewChange('riderPayPerKm')}
          />
        </Field>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-subtle)]">
          Con estas tarifas, un reparto de {formatDistance(PREVIEW_METERS)}
        </p>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[var(--color-ink-muted)]">Le cobrás</dt>
            <dd className="tabular text-lg font-semibold">{formatMoney(previewFee, currency)}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-muted)]">Te cuesta</dt>
            <dd className="tabular text-lg font-semibold">
              {formatMoney(previewCost.total, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-muted)]">Margen</dt>
            <dd
              className={`tabular text-lg font-semibold ${
                previewMargin < 0
                  ? 'text-[var(--color-danger-700)]'
                  : 'text-[var(--color-positive-700)]'
              }`}
            >
              {formatMoney(previewMargin, currency)}
            </dd>
          </div>
        </dl>
        {previewMargin < 0 && (
          <p className="mt-2 text-xs font-medium text-[var(--color-danger-700)]">
            Con esta configuración cada reparto de esa distancia te deja pérdida.
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <h3 className="text-sm font-semibold">Seguimiento y contabilidad</h3>
        </div>
        <Field
          label="Segundos entre marcas"
          htmlFor="pingSeconds"
          error={fieldErrors.pingSeconds}
          hint="30 s es el equilibrio entre precisión y batería."
        >
          <Input
            id="pingSeconds"
            name="pingSeconds"
            type="number"
            step="1"
            min="10"
            max="300"
            defaultValue={settings.pingSeconds}
          />
        </Field>
        <Field
          label="Precisión mínima (m)"
          htmlFor="maxAccuracyMeters"
          error={fieldErrors.maxAccuracyMeters}
          hint="Lecturas con más error que esto se descartan."
        >
          <Input
            id="maxAccuracyMeters"
            name="maxAccuracyMeters"
            type="number"
            step="1"
            min="20"
            max="1000"
            defaultValue={settings.maxAccuracyMeters}
          />
        </Field>
        <Field
          label="Factor de carretera"
          htmlFor="roadFactor"
          error={fieldErrors.roadFactor}
          hint="Cuánto multiplicar la línea recta para aproximar la ruta. 1.4 en trama urbana."
        >
          <Input
            id="roadFactor"
            name="roadFactor"
            type="number"
            step="0.05"
            min="1"
            max="3"
            defaultValue={settings.roadFactor}
          />
        </Field>

        <Field
          label="Categoría de gasto"
          htmlFor="expenseCategoryId"
          error={fieldErrors.expenseCategoryId}
          className="sm:col-span-2"
          hint={
            categories.length === 0
              ? 'No hay categorías de gasto activas. Creá una en Gastos para poder registrar el costo.'
              : 'Donde se registra el costo operativo al cerrar un reparto entregado.'
          }
        >
          <Select
            id="expenseCategoryId"
            name="expenseCategoryId"
            defaultValue={settings.expenseCategoryId ?? ''}
            disabled={categories.length === 0}
          >
            <option value="">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Registro automático" hint="Solo al entregar; un reparto fallido se revisa a mano.">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoExpense}
              onChange={(event) => setAutoExpense(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border-strong)]"
            />
            Registrar el gasto al cerrar
          </label>
        </Field>
      </section>

      <div className="flex justify-end">
        <Button type="submit" loading={loading}>
          <Save className="mr-1.5 h-4 w-4" /> Guardar tarifas
        </Button>
      </div>
    </form>
  );
}

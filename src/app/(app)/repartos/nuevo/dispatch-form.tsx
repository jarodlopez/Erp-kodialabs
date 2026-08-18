'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Bike, MapPin } from 'lucide-react';

import { createDeliveryAction } from '@/app/actions/delivery';
import { DeliveryMap, type MapMarker } from '@/components/domain/map';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { customerFee, estimateMinutes, estimateRoadMeters, formatDistance, formatDuration } from '@/lib/geo';
import { formatMoney } from '@/lib/money';
import { DELIVERY_SOURCE_LABELS, type DeliveryCandidate, type GeoPoint, type RiderSummary } from '@/types/delivery';

/**
 * Despacho de un reparto.
 *
 * La estimación de distancia, tiempo y tarifa se recalcula acá EN VIVO mientras
 * se mueve el pin, con las mismas funciones puras que usa el servidor
 * (`lib/geo.ts`). Es una previsualización: al guardar, el servidor vuelve a
 * calcular con la configuración real, así que nada de lo que se ve en pantalla
 * puede alterar lo que se cobra.
 */
export function DispatchForm({
  candidates,
  riders,
  origin,
  currency,
  roadFactor,
  customerBaseFee,
  customerFeePerKm,
  customerFreeKm,
  preselectedId,
}: {
  candidates: DeliveryCandidate[];
  riders: RiderSummary[];
  origin: GeoPoint | null;
  currency: string;
  roadFactor: number;
  customerBaseFee: number;
  customerFeePerKm: number;
  customerFreeKm: number;
  preselectedId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const [sourceId, setSourceId] = useState(preselectedId ?? candidates[0]?.sourceId ?? '');
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [riderId, setRiderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selected = candidates.find((item) => item.sourceId === sourceId) ?? null;

  const estimate = useMemo(() => {
    if (!origin || !point) return null;
    const meters = estimateRoadMeters(origin, point, roadFactor);
    return {
      meters,
      minutes: estimateMinutes(meters),
      // Si el documento ya trae envío cobrado, ese manda: es el precio que el
      // comprador aceptó y no se recalcula por mover un pin.
      fee:
        selected && selected.charged > 0
          ? selected.charged
          : customerFee(meters, {
              baseFee: customerBaseFee,
              feePerKm: customerFeePerKm,
              freeKm: customerFreeKm,
            }),
      inherited: Boolean(selected && selected.charged > 0),
    };
  }, [origin, point, roadFactor, selected, customerBaseFee, customerFeePerKm, customerFreeKm]);

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (origin) list.push({ id: 'origin', point: origin, kind: 'origin', label: 'Punto de partida' });
    return list;
  }, [origin]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    if (!point) {
      toast.error('Falta el destino', 'Tocá el mapa para marcar dónde hay que entregar.');
      return;
    }

    const form = new FormData(event.currentTarget);
    setLoading(true);
    setFieldErrors({});

    const result = await createDeliveryAction({
      source: selected?.source ?? 'SALE',
      sourceId,
      point,
      landmark: String(form.get('landmark') ?? ''),
      riderId: riderId || null,
      notes: String(form.get('notes') ?? ''),
    });

    setLoading(false);

    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo despachar', result.error.message);
      return;
    }

    toast.success(`Reparto ${result.data.number} creado`);
    router.push(`/repartos/${result.data.deliveryId}`);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px] sm:p-5">
      <div className="space-y-3">
        <DeliveryMap
          markers={markers}
          picked={point}
          onPick={setPoint}
          straightLine={origin && point ? [origin, point] : null}
          center={origin}
          height={440}
        />
        <p className="text-xs text-[var(--color-ink-subtle)]">
          La línea punteada es la referencia en línea recta. El costo definitivo sale del recorrido
          real que registre el teléfono del rider, no de esta estimación.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="Documento a repartir" htmlFor="sourceId" required error={fieldErrors.sourceId}>
          <Select
            id="sourceId"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            required
          >
            {candidates.map((item) => (
              <option key={item.sourceId} value={item.sourceId}>
                {DELIVERY_SOURCE_LABELS[item.source]} {item.number} · {item.customerName}
              </option>
            ))}
          </Select>
        </Field>

        {selected && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm">
            <p className="font-medium">{selected.customerName}</p>
            <p className="mt-1 text-[var(--color-ink-muted)]">{selected.address}</p>
            {selected.phone && (
              <p className="mt-1 text-[var(--color-ink-subtle)]">Tel. {selected.phone}</p>
            )}
          </div>
        )}

        <Field
          label="Referencia visual"
          htmlFor="landmark"
          error={fieldErrors['destination.landmark']}
          hint="Lo que el rider ve al llegar: “portón negro”, “frente a la pulpería”."
        >
          <Input id="landmark" name="landmark" maxLength={160} placeholder="Portón negro, casa esquinera" />
        </Field>

        <Field
          label="Rider"
          htmlFor="riderId"
          error={fieldErrors.riderId}
          hint={
            riders.length === 0
              ? 'No hay usuarios con rol Repartidor. Creá uno en Usuarios para poder asignar.'
              : 'Se ordenan por carga: primero quien tiene menos repartos encima.'
          }
        >
          <Select
            id="riderId"
            value={riderId}
            onChange={(event) => setRiderId(event.target.value)}
            disabled={riders.length === 0}
          >
            <option value="">Dejar por asignar</option>
            {riders.map((rider) => (
              <option key={rider.userId} value={rider.userId}>
                {rider.name} · {rider.activeCount} activo(s)
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notas para el rider" htmlFor="notes" error={fieldErrors.notes}>
          <Textarea id="notes" name="notes" rows={2} maxLength={500} />
        </Field>

        <div className="rounded-2xl border border-[var(--color-border)] p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-subtle)]">
            <MapPin className="h-3.5 w-3.5" /> Estimación
          </p>
          {!origin ? (
            <p className="mt-2 text-sm text-[var(--color-warning-700)]">
              Fijá el punto de partida en Tarifas de reparto para poder estimar.
            </p>
          ) : !estimate ? (
            <p className="mt-2 text-sm text-[var(--color-ink-subtle)]">
              Tocá el mapa para marcar el destino.
            </p>
          ) : (
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-ink-muted)]">Distancia</dt>
                <dd className="tabular">{formatDistance(estimate.meters)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-ink-muted)]">Tiempo</dt>
                <dd className="tabular">{formatDuration(estimate.minutes)}</dd>
              </div>
              <div className="flex justify-between border-t border-[var(--color-border)] pt-1">
                <dt className="text-[var(--color-ink-muted)]">
                  {estimate.inherited ? 'Envío ya cobrado' : 'Tarifa al cliente'}
                </dt>
                <dd className="tabular font-medium">{formatMoney(estimate.fee, currency)}</dd>
              </div>
            </dl>
          )}
        </div>

        <Button type="submit" loading={loading} disabled={!point || !sourceId} className="w-full">
          <Bike className="mr-1.5 h-4 w-4" /> Despachar reparto
        </Button>
      </div>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bike, RefreshCw } from 'lucide-react';

import { DeliveryMap, type MapMarker } from '@/components/domain/map';
import { Badge, Card, EmptyState } from '@/components/ui/primitives';
import { formatDistance } from '@/lib/geo';
import { DELIVERY_STATUS_LABELS, type DeliveryStatus, type GeoPoint, type TrackPoint } from '@/types/delivery';

export interface LiveDelivery {
  id: string;
  number: string;
  status: DeliveryStatus;
  customerName: string;
  address: string;
  riderName: string | null;
  origin: GeoPoint;
  destination: GeoPoint;
  lastPoint: TrackPoint | null;
  traveled: number;
  estimated: number;
}

/**
 * Cuántos minutos sin marcas convierten a un rider en "sin señal".
 *
 * Con una marca cada 30 s, tres minutos de silencio no son un bache de red:
 * es un teléfono apagado, sin datos o con la app cerrada. Distinguirlo importa
 * porque un pin quieto y un pin viejo se ven igual, y no significan lo mismo.
 */
const STALE_MINUTES = 3;

function isStale(point: TrackPoint | null): boolean {
  if (!point) return false;
  return Date.now() - new Date(point.at).getTime() > STALE_MINUTES * 60_000;
}

export function LiveMap({
  initial,
  origin,
  refreshSeconds,
}: {
  initial: LiveDelivery[];
  origin: GeoPoint | null;
  refreshSeconds: number;
}) {
  const [deliveries, setDeliveries] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/repartos/activos', { cache: 'no-store' });
      if (!response.ok) throw new Error('bad status');
      const data = (await response.json()) as { at: string; deliveries: LiveDelivery[] };
      setDeliveries(data.deliveries);
      setUpdatedAt(data.at);
      setFailed(false);
    } catch {
      // Un fallo puntual de red no debe vaciar el mapa: se conserva lo último
      // conocido y se avisa que está viejo.
      setFailed(true);
    }
  }, []);

  // Se reencadena tras cada respuesta en lugar de usar `setInterval`: con
  // intervalo fijo, una consulta lenta se solapa con la siguiente y el navegador
  // acumula peticiones que ya no interesan.
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      await refresh();
      if (cancelled) return;
      timerRef.current = setTimeout(tick, refreshSeconds * 1000);
    }

    timerRef.current = setTimeout(tick, refreshSeconds * 1000);

    // Al volver a la pestaña se consulta de inmediato: mirar un mapa con datos
    // de hace veinte minutos es peor que no mirarlo.
    function onVisible() {
      if (document.visibilityState === 'visible') void refresh();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, refreshSeconds]);

  const visible = focused ? deliveries.filter((item) => item.id === focused) : deliveries;

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (origin) list.push({ id: 'origin', point: origin, kind: 'origin', label: 'Punto de partida' });

    for (const delivery of visible) {
      list.push({
        id: `dest-${delivery.id}`,
        point: delivery.destination,
        kind: 'destination',
        label: `${delivery.number} · ${delivery.address}`,
      });
      if (delivery.lastPoint) {
        list.push({
          id: `rider-${delivery.id}`,
          point: delivery.lastPoint,
          kind: 'rider',
          stale: isStale(delivery.lastPoint),
          label: `${delivery.riderName ?? 'Rider'} · ${delivery.number}`,
        });
      }
    }
    return list;
  }, [origin, visible]);

  if (deliveries.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Bike className="h-5 w-5" />}
          title="Nadie en la calle"
          description="Cuando haya un reparto por asignar o en camino, aparecerá acá con la posición de su rider."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-2">
        <DeliveryMap
          markers={markers}
          center={origin}
          // Sin reencuadre automático: quien mira el mapa suele estar sobre una
          // zona y que la vista salte con cada actualización es insoportable.
          autoFit={focused !== null}
          height={520}
        />
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-ink-subtle)]">
          <RefreshCw className="h-3 w-3" />
          {failed
            ? 'No se pudo actualizar; se muestra la última posición conocida.'
            : updatedAt
              ? `Actualizado a las ${new Date(updatedAt).toLocaleTimeString('es-NI')} · cada ${refreshSeconds} s`
              : `Actualizando cada ${refreshSeconds} s`}
        </p>
      </div>

      <Card className="divide-y divide-[var(--color-border)] p-0">
        {deliveries.map((delivery) => {
          const stale = isStale(delivery.lastPoint);
          const active = focused === delivery.id;
          return (
            <button
              key={delivery.id}
              type="button"
              onClick={() => setFocused(active ? null : delivery.id)}
              className={`w-full text-left p-3 transition-colors ${
                active ? 'bg-[var(--color-brand-50)]' : 'hover:bg-[var(--color-canvas)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{delivery.number}</span>
                <Badge tone={delivery.status === 'IN_TRANSIT' ? 'brand' : 'warning'}>
                  {DELIVERY_STATUS_LABELS[delivery.status]}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-sm text-[var(--color-ink-muted)]">
                {delivery.customerName}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-ink-subtle)]">
                {delivery.riderName ?? 'Sin rider'} ·{' '}
                {delivery.traveled > 0
                  ? formatDistance(delivery.traveled)
                  : `≈ ${formatDistance(delivery.estimated)}`}
              </p>
              {stale && (
                <p className="mt-1 text-xs font-medium text-[var(--color-warning-700)]">
                  Sin señal desde hace más de {STALE_MINUTES} min
                </p>
              )}
              <span className="mt-1 inline-block text-xs text-[var(--color-brand-600)]">
                {active ? 'Ver todos' : 'Centrar en el mapa'}
              </span>
            </button>
          );
        })}
        <div className="p-3">
          <Link href="/repartos" className="text-sm text-[var(--color-brand-600)] hover:underline">
            Ver el historial completo →
          </Link>
        </div>
      </Card>
    </div>
  );
}

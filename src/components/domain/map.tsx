'use client';

/**
 * Mapa del módulo de reparto, sobre Leaflet y teselas de OpenStreetMap.
 *
 * POR QUÉ LEAFLET Y NO UN SDK DE MAPAS
 * ------------------------------------
 * Google Maps y Mapbox cobran por carga de mapa, y un módulo de reparto abre
 * mapas todo el día: el panel, el detalle, la vista del rider. Leaflet es una
 * biblioteca sin servicio detrás y las teselas de OSM son gratuitas, así que el
 * costo del módulo no crece con el uso.
 *
 * SOBRE LAS TESELAS
 * -----------------
 * El servidor público de OSM se usa por cortesía y su política prohíbe el uso
 * comercial intensivo. Por eso la dirección de las teselas es configurable
 * (`NEXT_PUBLIC_MAP_TILE_URL`): cuando el volumen crezca, se cambia por un
 * proveedor propio o de pago sin tocar una línea de este archivo. La
 * atribución se muestra siempre, que es lo que la licencia exige.
 *
 * NOTA DE CARGA: Leaflet toca `window` al importarse, así que entra por
 * `import()` dentro de un efecto y nunca durante el renderizado del servidor.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { Map as LeafletMapInstance, LayerGroup, Marker, Polyline } from 'leaflet';

// La hoja de estilos se importa de forma estática para que el bundler la
// extraiga en el build. Solo el CÓDIGO de Leaflet entra por `import()`
// dinámico, porque es el que toca `window`; el CSS no tiene ese problema.
import 'leaflet/dist/leaflet.css';

import { cn } from '@/lib/utils';
import type { GeoPoint } from '@/types/delivery';

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ATTRIBUTION =
  '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Managua: solo se usa cuando no hay ningún punto que encuadrar. */
const FALLBACK_CENTER: GeoPoint = { lat: 12.1364, lng: -86.2514 };

export type MapMarkerKind = 'origin' | 'destination' | 'rider' | 'pick';

export interface MapMarker {
  id: string;
  point: GeoPoint;
  kind: MapMarkerKind;
  /** Texto del globo al tocar la marca. Acepta solo texto, no HTML. */
  label?: string;
  /** Marca al rider como detenido hace rato, para que se note en el mapa. */
  stale?: boolean;
}

const MARKER_STYLE: Record<MapMarkerKind, { color: string; glyph: string; ring: string }> = {
  origin: { color: '#0f172a', glyph: '■', ring: 'rgba(15,23,42,.25)' },
  destination: { color: '#b91c1c', glyph: '▼', ring: 'rgba(185,28,28,.25)' },
  rider: { color: '#15803d', glyph: '●', ring: 'rgba(21,128,61,.30)' },
  pick: { color: '#c2410c', glyph: '✚', ring: 'rgba(194,65,12,.30)' },
};

/**
 * Icono dibujado con HTML en lugar de las imágenes que trae Leaflet.
 *
 * Los iconos por defecto se piden por una URL relativa que el bundler no
 * reescribe, así que en producción salen roto. Un `divIcon` no depende de
 * ningún archivo y además permite distinguir los tipos de marca por color.
 */
function markerHtml(kind: MapMarkerKind, stale: boolean): string {
  const style = MARKER_STYLE[kind];
  const background = stale ? '#78716c' : style.color;
  const ring = stale ? 'rgba(120,113,108,.25)' : style.ring;
  return `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:${background};color:#fff;font-size:13px;line-height:1;box-shadow:0 0 0 6px ${ring},0 2px 6px rgba(0,0,0,.35)">${style.glyph}</span>`;
}

export interface DeliveryMapProps {
  markers?: MapMarker[];
  /** Ruta recorrida. Se dibuja como línea continua sobre las teselas. */
  track?: GeoPoint[];
  /** Línea recta entre origen y destino: la referencia, no la ruta real. */
  straightLine?: [GeoPoint, GeoPoint] | null;
  /** Con esto el mapa pasa a modo selección: un clic devuelve el punto. */
  onPick?: (point: GeoPoint) => void;
  /** Punto elegido en modo selección. */
  picked?: GeoPoint | null;
  center?: GeoPoint | null;
  zoom?: number;
  /**
   * Reencuadrar cuando cambien los puntos. Se apaga en el mapa en vivo para no
   * arrastrarle la vista a quien está mirando una zona concreta.
   */
  autoFit?: boolean;
  className?: string;
  height?: number;
}

export function DeliveryMap({
  markers = [],
  track = [],
  straightLine = null,
  onPick,
  picked = null,
  center = null,
  zoom = 14,
  autoFit = true,
  className,
  height = 380,
}: DeliveryMapProps) {
  const containerId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // El callback vive en una ref para que cambiarlo no obligue a reconstruir el
  // mapa: recrearlo perdería el encuadre que el usuario ya eligió. Se sincroniza
  // en un efecto porque escribir una ref durante el renderizado rompe con el
  // renderizado concurrente de React.
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const L = (await import('leaflet')).default;
        if (cancelled || !containerRef.current || mapRef.current) return;

        const map = L.map(containerRef.current, {
          center: [center?.lat ?? FALLBACK_CENTER.lat, center?.lng ?? FALLBACK_CENTER.lng],
          zoom,
          // El zoom con rueda molesta al desplazar la página con el mapa en
          // medio; se mantienen los botones y el gesto de pinza.
          scrollWheelZoom: false,
          attributionControl: true,
        });

        L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || DEFAULT_TILE_URL, {
          maxZoom: 19,
          attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || DEFAULT_ATTRIBUTION,
        }).addTo(map);

        map.on('click', (event) => {
          const handler = pickRef.current;
          if (!handler) return;
          handler({ lat: event.latlng.lat, lng: event.latlng.lng });
        });

        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
        setReady(true);
      } catch {
        // Sin mapa el módulo tiene que seguir siendo usable: se avisa y se
        // deja que el resto del formulario funcione con coordenadas a mano.
        if (!cancelled) setFailed(true);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Se monta una sola vez a propósito: `center` y `zoom` son el encuadre
    // INICIAL, y los cambios posteriores los maneja el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcas, rastro y encuadre. Se redibuja el grupo completo porque son pocas
  // capas y comparar diferencias costaría más código que rehacerlas.
  useEffect(() => {
    if (!ready) return;
    if (!mapRef.current || !layerRef.current) return;

    let cancelled = false;

    async function draw() {
      const L = (await import('leaflet')).default;
      // Se releen las refs DESPUÉS del await: entre la importación y este
      // punto el componente pudo desmontarse y el mapa ya no existiría.
      const map = mapRef.current;
      const layer = layerRef.current;
      if (cancelled || !map || !layer) return;
      layer.clearLayers();

      const all: MapMarker[] = picked
        ? [...markers, { id: '__picked', point: picked, kind: 'pick', label: 'Punto elegido' }]
        : markers;

      const bounds: [number, number][] = [];

      for (const marker of all) {
        const icon = L.divIcon({
          html: markerHtml(marker.kind, marker.stale ?? false),
          className: 'delivery-map-pin',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const pin: Marker = L.marker([marker.point.lat, marker.point.lng], { icon });
        if (marker.label) {
          // El texto se asigna con `textContent` y no como HTML: el label
          // arrastra nombres y direcciones que escribió un cliente, y pasarlos
          // por el intérprete de HTML sería una inyección servida en bandeja.
          const balloon = document.createElement('div');
          balloon.textContent = marker.label;
          pin.bindPopup(balloon);
        }
        pin.addTo(layer);
        bounds.push([marker.point.lat, marker.point.lng]);
      }

      if (straightLine) {
        const reference: Polyline = L.polyline(
          straightLine.map((p) => [p.lat, p.lng] as [number, number]),
          { color: '#64748b', weight: 2, dashArray: '6 6', opacity: 0.8 },
        );
        reference.addTo(layer);
      }

      if (track.length > 1) {
        const line: Polyline = L.polyline(
          track.map((p) => [p.lat, p.lng] as [number, number]),
          { color: '#15803d', weight: 4, opacity: 0.9 },
        );
        line.addTo(layer);
        for (const p of track) bounds.push([p.lat, p.lng]);
      }

      if (autoFit && bounds.length > 0) {
        if (bounds.length === 1) map.setView(bounds[0], Math.max(zoom, 15));
        else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      }
    }

    void draw();
    return () => {
      cancelled = true;
    };
  }, [ready, markers, track, straightLine, picked, autoFit, zoom]);

  if (failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-6 text-center text-sm text-[var(--color-ink-subtle)]',
          className,
        )}
        style={{ height }}
      >
        No se pudo cargar el mapa. Revisá la conexión; podés seguir escribiendo las coordenadas a
        mano.
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-[var(--color-border)]', className)}>
      <div id={containerId} ref={containerRef} style={{ height }} className="w-full" />
      {onPick && (
        <p className="pointer-events-none absolute left-1/2 top-3 z-[400] -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs font-medium text-white shadow">
          Tocá el mapa para fijar el punto
        </p>
      )}
      {!ready && (
        <div className="absolute inset-0 z-[401] flex items-center justify-center bg-[var(--color-surface-muted)] text-sm text-[var(--color-ink-subtle)]">
          Cargando mapa…
        </div>
      )}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleSlash, Navigation, Play, Satellite } from 'lucide-react';

import { finishDeliveryAction, pingDeliveryAction, startDeliveryAction } from '@/app/actions/delivery';
import { DeliveryMap, type MapMarker } from '@/components/domain/map';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDistance } from '@/lib/geo';
import type { DeliveryStatus, GeoPoint } from '@/types/delivery';

/**
 * Vista de trabajo del rider: arranca el viaje, informa su posición y cierra.
 *
 * CÓMO SE INFORMA LA POSICIÓN
 * ---------------------------
 * Se usan las dos mitades de la API de geolocalización por separado, y esa
 * separación es el punto:
 *
 *  - `watchPosition` queda escuchando y deja la lectura más fresca en una ref.
 *    Mantiene el GPS "caliente", que es lo que da precisión: pedir una posición
 *    desde frío devuelve una primera lectura mala de 100 m o más.
 *  - un temporizador manda al servidor UNA lectura cada `pingSeconds`. Escuchar
 *    y escribir son cosas distintas: `watchPosition` puede dispararse varias
 *    veces por segundo en movimiento, y eso serían miles de escrituras por
 *    viaje.
 *
 * El servidor decide si la lectura cuenta; acá no se calcula distancia ni se
 * descarta nada por criterio propio. Lo que la pantalla muestra es lo que el
 * servidor respondió.
 */
export function RiderTracker({
  deliveryId,
  status,
  destination,
  origin,
  traveled,
  pingSeconds,
  maxAccuracyMeters,
}: {
  deliveryId: string;
  status: DeliveryStatus;
  destination: GeoPoint;
  origin: GeoPoint;
  traveled: number;
  pingSeconds: number;
  maxAccuracyMeters: number;
}) {
  const router = useRouter();
  const toast = useToast();

  const [starting, setStarting] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [failedMode, setFailedMode] = useState(false);
  const [note, setNote] = useState('');

  const [here, setHere] = useState<GeoPoint | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [distance, setDistance] = useState(traveled);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const tracking = status === 'IN_TRANSIT';

  /** Última lectura del GPS, con el instante en que llegó. */
  const readingRef = useRef<{ position: GeolocationPosition; at: number } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // ---------------------------------------------------------------------
  // Escucha del GPS
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!tracking) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      // El aviso se agenda en lugar de fijarse acá mismo: cambiar el estado
      // dentro del cuerpo del efecto encadena un renderizado extra, y este caso
      // (navegador viejo, o servido sin HTTPS) no tiene ninguna urgencia.
      const timer = setTimeout(
        () => setGeoError('Este teléfono no permite compartir la ubicación.'),
        0,
      );
      return () => clearTimeout(timer);
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        readingRef.current = { position, at: Date.now() };
        setHere({ lat: position.coords.latitude, lng: position.coords.longitude });
        setAccuracy(position.coords.accuracy);
        setGeoError(null);
      },
      (error) => {
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? 'Diste "no permitir" a la ubicación. Habilitala para este sitio en los ajustes del navegador.'
            : 'No se puede leer el GPS ahora mismo. Salí a un lugar abierto.',
        );
      },
      // `enableHighAccuracy` gasta más batería y es exactamente lo que hace
      // falta: con la lectura de red en lugar del GPS, el error de 500 m haría
      // que el servidor descarte todo el viaje.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [tracking]);

  // ---------------------------------------------------------------------
  // Envío al servidor
  // ---------------------------------------------------------------------
  const send = useCallback(async () => {
    const reading = readingRef.current;
    if (!reading) return;

    // Una lectura vieja no se manda: la hora la pone el servidor al recibirla,
    // así que enviar algo de hace cinco minutos lo ubicaría en el rastro como
    // si fuera de ahora y dibujaría un salto que nunca ocurrió.
    if (Date.now() - reading.at > pingSeconds * 2000) return;

    setSending(true);
    const result = await pingDeliveryAction(deliveryId, {
      lat: reading.position.coords.latitude,
      lng: reading.position.coords.longitude,
      accuracy: reading.position.coords.accuracy,
      speed: reading.position.coords.speed,
    });
    setSending(false);

    if (!result.ok) {
      // No se molesta al rider con un aviso por cada fallo de red: el próximo
      // ciclo reintenta con una lectura nueva, que es mejor que reintentar esta.
      return;
    }

    setDistance(result.data.traveled);
    setLastSent(new Date());
  }, [deliveryId, pingSeconds]);

  useEffect(() => {
    if (!tracking) return;

    // Un primer envío inmediato para que el panel vea al rider en el mapa sin
    // esperar el ciclo completo.
    void send();
    const timer = setInterval(() => void send(), pingSeconds * 1000);
    return () => clearInterval(timer);
  }, [tracking, send, pingSeconds]);

  // ---------------------------------------------------------------------
  // Pantalla encendida
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!tracking) return;

    /**
     * Con la pantalla apagada el navegador suspende los temporizadores y el
     * rastro queda con un agujero del tamaño del viaje. El Wake Lock lo evita
     * donde existe; donde no (Safari en iOS, sobre todo), el rider tiene que
     * dejar la pantalla encendida y por eso se le avisa en pantalla.
     */
    async function acquire() {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // Se ignora: es una mejora, no un requisito.
      }
    }

    void acquire();

    // El sistema libera el bloqueo al ocultar la pestaña, así que hay que
    // volver a pedirlo cada vez que la pantalla vuelve.
    function onVisible() {
      if (document.visibilityState === 'visible') void acquire();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, [tracking]);

  // ---------------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------------
  async function onStart() {
    if (starting) return;
    setStarting(true);
    const result = await startDeliveryAction(deliveryId);
    setStarting(false);

    if (!result.ok) {
      toast.error('No se pudo arrancar', result.error.message);
      return;
    }
    toast.success('En camino', 'Dejá esta pantalla abierta para que se registre tu ruta.');
    router.refresh();
  }

  async function onFinish() {
    if (finishing) return;
    setFinishing(true);
    const result = await finishDeliveryAction({
      deliveryId,
      status: failedMode ? 'FAILED' : 'DELIVERED',
      note,
    });
    setFinishing(false);

    if (!result.ok) {
      toast.error('No se pudo cerrar', result.error.message);
      return;
    }

    toast.success(failedMode ? 'Reparto marcado sin entregar' : 'Entrega registrada');
    setFinishOpen(false);
    router.push('/reparto');
  }

  const markers: MapMarker[] = [
    { id: 'destination', point: destination, kind: 'destination', label: 'Destino' },
  ];
  if (here) markers.push({ id: 'here', point: here, kind: 'rider', label: 'Vos' });
  else markers.push({ id: 'origin', point: origin, kind: 'origin', label: 'Salida' });

  const weakSignal = accuracy !== null && accuracy > maxAccuracyMeters;

  return (
    <>
      <DeliveryMap markers={markers} center={here ?? destination} height={280} />

      {!tracking ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Al arrancar, el teléfono empieza a marcar tu posición cada {pingSeconds} segundos. Dejá
            esta pantalla abierta durante el viaje: con la pantalla apagada el navegador corta el
            seguimiento y el recorrido queda incompleto.
          </p>
          <Button onClick={onStart} loading={starting} className="mt-3 w-full" size="lg">
            <Play className="mr-1.5 h-4 w-4" /> Salir con este reparto
          </Button>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-subtle)]">
                  Recorrido registrado
                </p>
                <p className="tabular text-2xl font-semibold">{formatDistance(distance)}</p>
              </div>
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  geoError || weakSignal
                    ? 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)]'
                    : 'bg-[var(--color-positive-50)] text-[var(--color-positive-700)]'
                }`}
              >
                {sending ? (
                  <Navigation className="h-5 w-5 animate-pulse" />
                ) : (
                  <Satellite className="h-5 w-5" />
                )}
              </span>
            </div>

            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
              {geoError
                ? geoError
                : accuracy === null
                  ? 'Buscando señal…'
                  : weakSignal
                    ? `Precisión ${Math.round(accuracy)} m: el servidor descarta lecturas con más de ${maxAccuracyMeters} m de error. Salí a un lugar abierto.`
                    : `Precisión ${Math.round(accuracy)} m${
                        lastSent ? ` · última marca ${lastSent.toLocaleTimeString('es-NI')}` : ''
                      }`}
            </p>

            {/*
              Los metros que se muestran son los que el servidor aceptó, no los
              que el teléfono creyó recorrer: si el rider está parado, el número
              no se mueve, y eso es correcto aunque el GPS oscile.
            */}
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              setFailedMode(false);
              setNote('');
              setFinishOpen(true);
            }}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Entregué el pedido
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setFailedMode(true);
              setNote('');
              setFinishOpen(true);
            }}
          >
            <CircleSlash className="mr-1.5 h-4 w-4" /> No pude entregar
          </Button>
        </section>
      )}

      <Modal
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        title={failedMode ? 'No se pudo entregar' : 'Confirmar entrega'}
        description={
          failedMode
            ? 'Contá qué pasó: el reparto queda registrado como no entregado y alguien lo va a revisar.'
            : 'Se cierra el reparto y el costo del recorrido queda calculado.'
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFinishOpen(false)} disabled={finishing}>
              Volver
            </Button>
            <Button
              variant={failedMode ? 'danger' : 'primary'}
              onClick={onFinish}
              loading={finishing}
              disabled={failedMode && !note.trim()}
            >
              {failedMode ? 'Marcar sin entregar' : 'Confirmar entrega'}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
          Recorrido registrado: <strong className="tabular">{formatDistance(distance)}</strong>
        </p>
        <Field
          label={failedMode ? 'Qué pasó' : 'Nota (opcional)'}
          htmlFor="note"
          required={failedMode}
        >
          <Textarea
            id="note"
            rows={3}
            maxLength={300}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              failedMode ? 'Nadie en la casa; el teléfono da apagado.' : 'Recibió la vecina.'
            }
          />
        </Field>
      </Modal>
    </>
  );
}

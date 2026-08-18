/**
 * Geografía y aritmética del reparto.
 *
 * Módulo PURO: sin Firebase, sin Next, sin red. Todo el cálculo de distancias,
 * tiempos y costos del módulo de reparto pasa por aquí, lo que permite
 * probarlo a fondo — y hace falta, porque de estos números salen un gasto real
 * en la contabilidad y una tarifa que se le cobra a un cliente.
 *
 * EL PROBLEMA CENTRAL: LA DERIVA DEL GPS
 * --------------------------------------
 * Un teléfono detenido no informa siempre la misma coordenada: oscila unos
 * metros en cada lectura. Con una marca cada 30 segundos, un rider parado una
 * hora esperando en un portón genera 120 lecturas que, sumadas sin criterio,
 * "recorren" un par de kilómetros que nadie hizo. Si ese número alimenta el
 * costo por kilómetro, el ERP registra un gasto inventado.
 *
 * Por eso un tramo solo cuenta si su longitud supera el error que el propio
 * GPS declara: es la única forma de distinguir movimiento de ruido usando lo
 * que el dispositivo ya nos dice.
 */
import { roundHalfUp } from './money';
import type { GeoPoint, Money, TrackPoint } from '@/types';

/** Radio medio de la Tierra en metros (esfera de referencia IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Velocidad por encima de la cual un tramo se considera un salto del GPS y no
 * un desplazamiento. 150 km/h deja pasar cualquier moto o auto en ciudad y
 * corta los saltos de varios kilómetros que ocurren al recuperar señal.
 */
export const MAX_PLAUSIBLE_KMH = 150;

/** Piso de desplazamiento en metros: por debajo, se asume que no se movió. */
export const MIN_SEGMENT_M = 10;

/** Velocidad urbana de referencia para estimar tiempos sin motor de rutas. */
export const DEFAULT_URBAN_KMH = 22;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** `true` si el par de coordenadas es geográficamente posible. */
export function isValidPoint(point: { lat: number; lng: number }): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180 &&
    // El (0,0) está en el golfo de Guinea: en la práctica es el valor que
    // manda un dispositivo sin señal, no un destino real.
    !(point.lat === 0 && point.lng === 0)
  );
}

/**
 * Distancia sobre la superficie entre dos puntos, en metros.
 *
 * Fórmula del haversine: trata la Tierra como esfera. El error frente a un
 * cálculo elipsoidal es de ~0.5 %, irrelevante para un reparto urbano y mucho
 * más barato de calcular en cada ping.
 */
export function haversineMeters(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type SegmentVerdict =
  | { counts: true; meters: number }
  | { counts: false; meters: 0; reason: 'noise' | 'jump' };

/**
 * Decide si el tramo entre dos marcas cuenta como recorrido.
 *
 * Tres respuestas posibles:
 *  - `jump`: implica una velocidad imposible. Es un salto del GPS al recuperar
 *    señal y sumarlo dispararía el costo.
 *  - `noise`: el desplazamiento no supera el error declarado por el
 *    dispositivo, así que no se puede afirmar que haya habido movimiento.
 *  - cuenta: hay desplazamiento real y se suma.
 */
export function evaluateSegment(previous: TrackPoint, next: TrackPoint): SegmentVerdict {
  const meters = haversineMeters(previous, next);
  const seconds = (new Date(next.at).getTime() - new Date(previous.at).getTime()) / 1000;

  // Dos marcas con el mismo instante (o desordenadas) no describen un tramo.
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { counts: false, meters: 0, reason: 'noise' };
  }

  const kmh = (meters / seconds) * 3.6;
  if (kmh > MAX_PLAUSIBLE_KMH) {
    return { counts: false, meters: 0, reason: 'jump' };
  }

  // El umbral suma los dos errores, no los promedia: cada lectura puede estar
  // desviada su propio radio, así que dos fijaciones de 15 m pueden aparecer a
  // 30 m una de otra sin que nadie se haya movido. Promediar dejaba pasar
  // justamente ese caso, que es el que inventa kilómetros en una espera larga.
  //
  // Es un criterio conservador a propósito: perder unos metros de caminata
  // lenta es mucho menos grave que cargarle al negocio un gasto que no existió.
  const threshold = Math.max(MIN_SEGMENT_M, previous.accuracy + next.accuracy);
  if (meters < threshold) {
    return { counts: false, meters: 0, reason: 'noise' };
  }

  return { counts: true, meters };
}

/**
 * Recorrido total de un rastro, en metros. Aplica el mismo criterio que
 * `evaluateSegment` tramo a tramo, así que reconstruir la distancia desde el
 * rastro completo da el mismo número que sumarla ping a ping.
 */
export function trackDistanceMeters(points: TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const verdict = evaluateSegment(points[i - 1], points[i]);
    if (verdict.counts) total += verdict.meters;
  }
  return total;
}

/**
 * Distancia estimada por carretera, en metros.
 *
 * Sin motor de rutas, la línea recta se multiplica por un factor que aproxima
 * el rodeo de la trama urbana. Es una estimación declarada como tal: el costo
 * operativo se calcula después con el recorrido real, no con esto.
 */
export function estimateRoadMeters(from: GeoPoint, to: GeoPoint, roadFactor: number): number {
  const factor = Number.isFinite(roadFactor) && roadFactor >= 1 ? roadFactor : 1.4;
  return Math.round(haversineMeters(from, to) * factor);
}

/** Minutos estimados para recorrer una distancia a velocidad urbana. */
export function estimateMinutes(meters: number, kmh = DEFAULT_URBAN_KMH): number {
  if (meters <= 0) return 0;
  const speed = kmh > 0 ? kmh : DEFAULT_URBAN_KMH;
  return Math.max(1, Math.round((meters / 1000 / speed) * 60));
}

// ---------------------------------------------------------------------------
// Dinero
// ---------------------------------------------------------------------------

export interface CostRates {
  /** Costo operativo por kilómetro, en centavos. */
  costPerKm: Money;
  /** Pago fijo al rider por reparto entregado, en centavos. */
  riderPayPerDelivery: Money;
  /** Pago al rider por kilómetro, en centavos. */
  riderPayPerKm: Money;
}

export interface CostBreakdown {
  /** Costo de recorrido: kilómetros por la tarifa operativa (centavos). */
  travel: Money;
  /** Pago al rider (centavos). */
  riderPay: Money;
  /** Suma de los dos (centavos). */
  total: Money;
}

/**
 * Costo operativo del reparto a partir del recorrido real.
 *
 * El pago al rider se devuelve aparte porque no siempre es un costo del mismo
 * bolsillo: hay negocios donde el rider es empleado y su pago ya está en la
 * nómina, y otros donde se le liquida por entrega.
 */
export function deliveryCost(traveledMeters: number, rates: CostRates): CostBreakdown {
  const km = Math.max(0, traveledMeters) / 1000;

  const travel = roundHalfUp(km * Math.max(0, rates.costPerKm));
  const riderPay =
    traveledMeters > 0
      ? roundHalfUp(Math.max(0, rates.riderPayPerDelivery) + km * Math.max(0, rates.riderPayPerKm))
      : 0;

  return { travel, riderPay, total: travel + riderPay };
}

export interface CustomerFeeRates {
  /** Tarifa base, en centavos. */
  baseFee: Money;
  /** Tarifa por kilómetro más allá de los incluidos, en centavos. */
  feePerKm: Money;
  /** Kilómetros incluidos en la base. */
  freeKm: number;
}

/**
 * Tarifa de envío a cobrar al cliente según la distancia estimada.
 *
 * Se cobra sobre la ESTIMACIÓN, no sobre el recorrido real: el cliente acepta
 * un precio antes de comprar y no puede cambiarle porque el rider tomó un
 * desvío. Que el negocio absorba esa diferencia es justamente lo que el
 * margen de la entrega deja ver.
 */
export function customerFee(estimatedMeters: number, rates: CustomerFeeRates): Money {
  const km = Math.max(0, estimatedMeters) / 1000;
  const billableKm = Math.max(0, km - Math.max(0, rates.freeKm));
  return roundHalfUp(Math.max(0, rates.baseFee) + billableKm * Math.max(0, rates.feePerKm));
}

/** Formatea una distancia en metros como texto legible ("1,4 km", "320 m"). */
export function formatDistance(meters: number, locale = 'es-NI'): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(km)} km`;
}

/** Formatea una duración en minutos ("45 min", "1 h 20 min"). */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

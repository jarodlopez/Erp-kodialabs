import type { BaseEntity, Id, IsoDate, Money } from './common';
import type { DeliveryInfo } from './sales';

/**
 * Reparto a domicilio con seguimiento en vivo (módulo `delivery`).
 *
 * Un reparto no inventa el destino ni el dinero: nace de una venta del ERP o
 * de un pedido de la tienda, y hereda de ahí al cliente y la dirección. Lo que
 * agrega es el punto exacto en el mapa, el rider asignado, el rastro que deja
 * su teléfono y los dos importes que interesan al negocio: lo que se le cobró
 * al cliente por el envío y lo que le costó al negocio hacerlo.
 */

// ---------------------------------------------------------------------------
// Geografía
// ---------------------------------------------------------------------------

/**
 * Punto en el mapa. Latitud y longitud en grados decimales (WGS-84), que es
 * lo que hablan OpenStreetMap, el GPS del teléfono y cualquier motor de rutas.
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Marca del rastro: dónde estaba el rider y cuándo.
 *
 * `accuracy` es el radio de error en metros que informa el GPS y NO es
 * decorativo: con él se descartan las lecturas malas antes de que inflen la
 * distancia recorrida, que es la base del costo operativo.
 */
export interface TrackPoint extends GeoPoint {
  at: IsoDate;
  /** Radio de error en metros según el dispositivo. */
  accuracy: number;
  /** Velocidad instantánea en m/s si el dispositivo la reporta. */
  speed: number | null;
}

/** Destino del reparto: la dirección heredada más el punto fijado a mano. */
export interface DeliveryDestination extends DeliveryInfo {
  point: GeoPoint;
  /** Referencia visual que escribe quien despacha ("portón negro"). */
  landmark: string | null;
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export type DeliveryStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED';

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: 'Por asignar',
  ASSIGNED: 'Asignado',
  IN_TRANSIT: 'En camino',
  DELIVERED: 'Entregado',
  FAILED: 'No entregado',
  CANCELLED: 'Anulado',
};

/** Estados en los que el reparto sigue vivo y se muestra en el mapa. */
export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  'PENDING',
  'ASSIGNED',
  'IN_TRANSIT',
];

/** Origen del reparto. Siempre hay uno: no existe el reparto huérfano. */
export type DeliverySource = 'SALE' | 'STORE_ORDER';

export const DELIVERY_SOURCE_LABELS: Record<DeliverySource, string> = {
  SALE: 'Venta',
  STORE_ORDER: 'Pedido online',
};

// ---------------------------------------------------------------------------
// Reparto
// ---------------------------------------------------------------------------

/**
 * Importes del reparto.
 *
 * Se separan a propósito porque responden preguntas distintas: `charged` es
 * ingreso que ya viajó en la venta, y `cost` es lo que el negocio gastó en
 * llevarlo. La diferencia es el margen real de la entrega, que es el número
 * que nadie suele tener.
 */
export interface DeliveryAmounts {
  /** Envío cobrado al cliente, heredado del documento de origen (centavos). */
  charged: Money;
  /** Costo operativo calculado al cerrar el reparto (centavos). */
  cost: Money;
  /** Pago al rider incluido en `cost`, si la tarifa lo contempla (centavos). */
  riderPay: Money;
  /** Gasto del ERP generado al cerrar. `null` si no se registró. */
  expenseId: Id | null;
}

export interface DeliveryDistances {
  /**
   * Estimación previa al despacho, en metros. Sale del motor de rutas si hay
   * clave configurada, o de la distancia geodésica por el factor de carretera.
   */
  estimated: number;
  /**
   * Recorrido real acumulado, en metros. Se suma ping a ping en el servidor
   * descartando lecturas imprecisas; es la base del costo operativo.
   */
  traveled: number;
}

export interface DeliveryTimestamps {
  assignedAt: IsoDate | null;
  startedAt: IsoDate | null;
  finishedAt: IsoDate | null;
  /** Minutos estimados antes de salir. `null` si no se pudo estimar. */
  estimatedMinutes: number | null;
}

export interface Delivery extends BaseEntity {
  number: string;
  status: DeliveryStatus;

  source: DeliverySource;
  /** Venta del ERP o pedido de la tienda que originó el reparto. */
  sourceId: Id;
  /** Número legible del documento de origen, para no leerlo cada vez. */
  sourceNumber: string;

  customerId: Id | null;
  customerName: string;
  destination: DeliveryDestination;
  /** Punto de partida: la bodega o local desde donde sale la mercadería. */
  origin: GeoPoint;

  riderId: Id | null;
  riderName: string | null;

  amounts: DeliveryAmounts;
  distances: DeliveryDistances;
  times: DeliveryTimestamps;

  /**
   * Última posición conocida del rider. Vive en el reparto —y no en un
   * documento por rider— para que el mapa en vivo lea un solo documento por
   * reparto activo y cada ping siga costando una sola escritura.
   */
  lastPoint: TrackPoint | null;

  /** Motivo cuando el reparto termina en FAILED o CANCELLED. */
  resolutionNote: string | null;
  notes: string | null;
}

/**
 * Rastro del reparto (`deliveryTracks/{deliveryId}`).
 *
 * Un documento por reparto en lugar de uno por marca: con un ping cada 30
 * segundos, un turno de ocho horas serían casi mil documentos por rider. Aquí
 * el rastro entero de un viaje de dos horas ocupa unos 10 KB, muy por debajo
 * del límite de 1 MB por documento de Firestore.
 */
export interface DeliveryTrack {
  id: Id;
  organizationId: Id;
  deliveryId: Id;
  riderId: Id;
  points: TrackPoint[];
  /** Lecturas descartadas por imprecisas o por implicar un salto imposible. */
  rejectedCount: number;
  updatedAt: IsoDate;
}

// ---------------------------------------------------------------------------
// Configuración (`deliverySettings/{organizationId}`)
// ---------------------------------------------------------------------------

/**
 * Tarifas y parámetros del reparto. Todo configurable porque el combustible,
 * la moneda y lo que se le paga a un rider cambian por país y por mes.
 */
export interface DeliverySettings {
  id: Id;
  organizationId: Id;

  /** Punto de partida por defecto: el local o la bodega principal. */
  origin: GeoPoint | null;

  /** Costo operativo por kilómetro recorrido, en centavos. */
  costPerKm: Money;
  /** Pago fijo al rider por reparto entregado, en centavos. `0` = no aplica. */
  riderPayPerDelivery: Money;
  /** Pago al rider por kilómetro, en centavos. `0` = no aplica. */
  riderPayPerKm: Money;

  /** Tarifa base a cobrar al cliente, en centavos. */
  customerBaseFee: Money;
  /** Tarifa a cobrar al cliente por kilómetro, en centavos. */
  customerFeePerKm: Money;
  /** Kilómetros incluidos en la tarifa base antes de cobrar por distancia. */
  customerFreeKm: number;

  /**
   * Cuánto multiplicar la distancia en línea recta para aproximar la de
   * carretera cuando no hay motor de rutas. 1.4 es un valor conservador para
   * trama urbana; se ajusta con la experiencia de cada ciudad.
   */
  roadFactor: number;

  /** Segundos entre marcas de posición. El teléfono respeta esta cadencia. */
  pingSeconds: number;
  /** Precisión mínima aceptable en metros: por encima, la lectura se descarta. */
  maxAccuracyMeters: number;

  /** Categoría de gasto donde se registra el costo operativo al cerrar. */
  expenseCategoryId: Id | null;
  /** Registrar el gasto automáticamente al entregar. */
  autoRegisterExpense: boolean;

  updatedAt: IsoDate;
  updatedBy: Id;
}

export const DEFAULT_DELIVERY_SETTINGS: Omit<
  DeliverySettings,
  'id' | 'organizationId' | 'updatedAt' | 'updatedBy'
> = {
  origin: null,
  costPerKm: 1500,
  riderPayPerDelivery: 0,
  riderPayPerKm: 0,
  customerBaseFee: 5000,
  customerFeePerKm: 1000,
  customerFreeKm: 2,
  roadFactor: 1.4,
  pingSeconds: 30,
  maxAccuracyMeters: 100,
  expenseCategoryId: null,
  autoRegisterExpense: false,
};

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export interface CreateDeliveryInput {
  source: DeliverySource;
  sourceId: Id;
  /** Punto fijado a mano sobre el mapa por quien despacha. */
  point: GeoPoint;
  landmark?: string | null;
  /** Punto de partida. Si se omite se usa el de la configuración. */
  origin?: GeoPoint | null;
  riderId?: Id | null;
  notes?: string | null;
}

/** Marca de posición que envía el teléfono del rider. */
export interface TrackPingInput {
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number | null;
  /** Momento de la lectura según el dispositivo. */
  at?: string | null;
}

export interface PingResult {
  /** `true` si la marca se guardó; `false` si se descartó por imprecisa. */
  accepted: boolean;
  /** Motivo del descarte, para que el teléfono lo muestre si hace falta. */
  reason: string | null;
  /** Recorrido acumulado tras la marca, en metros. */
  traveled: number;
}

/** Resumen del rider para la vista de asignación. */
export interface RiderSummary {
  userId: Id;
  name: string;
  email: string;
  /** Repartos activos que ya tiene encima. */
  activeCount: number;
  lastPoint: TrackPoint | null;
}

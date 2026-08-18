import 'server-only';

/**
 * Servicio de reparto.
 *
 * Dos responsabilidades que conviene no mezclar:
 *
 *  1. RECIBIR POSICIONES. Es la operación más frecuente del ERP entero: un
 *     ping cada 30 segundos por rider activo. Está escrita para costar UNA
 *     escritura por ping y para no confiar en nada de lo que manda el
 *     teléfono: la validez de la lectura y la distancia que suma las decide
 *     el servidor con `lib/geo.ts`.
 *  2. CERRAR EL REPARTO. Ahí el recorrido real se convierte en costo y, si el
 *     comercio lo pidió, en un gasto del ERP. Ese número tiene que ser
 *     defendible, por eso nunca sale de lo que informó el dispositivo sino de
 *     los tramos que pasaron el filtro de ruido.
 */
import { FieldValue } from 'firebase-admin/firestore';

import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import {
  customerFee,
  deliveryCost,
  estimateMinutes,
  estimateRoadMeters,
  evaluateSegment,
  isValidPoint,
} from '@/lib/geo';
import { toMajorUnits, toMinorUnits } from '@/lib/money';
import { nowIso } from '@/lib/repositories/base';
import {
  deliveryRepository,
  deliverySettingsRepository,
} from '@/lib/repositories/delivery';
import { saleRepository } from '@/lib/repositories/documents';
import { userRepository, warehouseRepository } from '@/lib/repositories/organization';
import { newDoc, refs } from '@/lib/repositories/refs';
import { storeOrderRepository } from '@/lib/repositories/store';
import { PERMISSIONS, permissionsForRole } from '@/lib/rbac';
import { audit } from './audit';
import { expenseService, type ExpenseServiceContext } from './expenses';
import { guardIdempotency, reserveNumber, runTransaction } from './transaction';
import type { ActorContext, Id } from '@/types/common';
import type { Membership } from '@/types/organization';
import type {
  CreateDeliveryInput,
  Delivery,
  DeliverySettings,
  DeliveryCandidate,
  DeliverySettingsInput,
  DeliverySummary,
  DeliveryStatus,
  DeliveryTrack,
  GeoPoint,
  PingResult,
  RiderSummary,
  TrackPingInput,
  TrackPoint,
} from '@/types/delivery';
import { ACTIVE_DELIVERY_STATUSES } from '@/types/delivery';

export const DEFAULT_DELIVERY_PREFIX = 'DEL';

/**
 * Tope de marcas por rastro. A 30 segundos por ping son unas 16 horas de
 * viaje: cualquier reparto real cabe de sobra. El límite existe para que un
 * teléfono olvidado con la app abierta no infle el documento sin freno.
 */
const MAX_TRACK_POINTS = 2000;

/** Transiciones válidas del reparto. Fuera de esta tabla, no se mueve. */
const TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_TRANSIT', 'PENDING', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
  CANCELLED: [],
};

function assertTransition(from: DeliveryStatus, to: DeliveryStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw errors.invalidTransition(
      `Un reparto en "${from}" no puede pasar a "${to}".`,
    );
  }
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

interface SourceData {
  sourceNumber: string;
  customerId: Id | null;
  customerName: string;
  address: string;
  recipient: string | null;
  phone: string | null;
  notes: string | null;
  /** Envío ya cobrado en el documento de origen, en centavos. */
  charged: number;
}

/**
 * Lee el documento de origen. El reparto no inventa destino ni cliente: si la
 * venta no registró datos de entrega, es una venta de mostrador y no
 * corresponde repartirla.
 */
async function readSource(
  organizationId: Id,
  source: CreateDeliveryInput['source'],
  sourceId: Id,
): Promise<SourceData> {
  if (source === 'SALE') {
    const sale = await saleRepository.get(organizationId, sourceId);
    if (!sale) throw errors.notFound('Venta');
    if (!sale.delivery) {
      throw errors.validation(
        'Esa venta no tiene datos de entrega: se registró como venta en mostrador.',
      );
    }
    if (sale.status === 'CANCELLED') {
      throw errors.validation('No se puede repartir una venta anulada.');
    }
    return {
      sourceNumber: sale.number,
      customerId: sale.customerId,
      customerName: sale.customerName,
      address: sale.delivery.address,
      recipient: sale.delivery.recipient,
      phone: sale.delivery.phone,
      notes: sale.delivery.notes,
      // El envío de una venta viaja como una línea más, así que aquí no se
      // puede aislar sin adivinar. Se deja en cero y el panel lo puede fijar.
      charged: 0,
    };
  }

  const order = await storeOrderRepository.get(organizationId, sourceId);
  if (!order) throw errors.notFound('Pedido');
  if (order.status === 'REJECTED' || order.status === 'CANCELLED') {
    throw errors.validation('Ese pedido fue rechazado o anulado.');
  }
  return {
    sourceNumber: order.number,
    customerId: null,
    customerName: order.customer.name,
    address: order.delivery.address,
    recipient: order.delivery.recipient,
    phone: order.delivery.phone,
    notes: order.delivery.notes,
    charged: order.shippingCost,
  };
}

/** Punto de partida: el configurado, o el que venga en la petición. */
async function resolveOrigin(
  organizationId: Id,
  settings: DeliverySettings,
  requested: GeoPoint | null | undefined,
): Promise<GeoPoint> {
  const candidate = requested ?? settings.origin;
  if (candidate && isValidPoint(candidate)) return candidate;

  // Sin origen configurado no se puede estimar distancia ni tarifa, y adivinar
  // uno daría números falsos con apariencia de ciertos. Se nombra la bodega
  // principal solo para orientar: si tampoco existe, el mensaje genérico sirve
  // igual y no vale la pena tapar el problema real con otro error.
  const warehouse = await warehouseRepository.getDefault(organizationId).catch(() => null);
  throw errors.validation(
    warehouse
      ? `Fija el punto de partida en Reparto → Tarifas (normalmente la bodega "${warehouse.name}") antes de despachar.`
      : 'Fija el punto de partida en Reparto → Tarifas antes de despachar.',
  );
}

/**
 * Valida que el usuario pueda repartir en esta organización.
 *
 * Se lee la MEMBRESÍA y no el perfil porque el rol por organización vive ahí,
 * y es el mismo dato del que se derivan los permisos en cada petición: así el
 * "puede repartir" del despacho no puede divergir del que aplica el servidor
 * cuando el teléfono manda una posición. La comprobación es por permiso y no
 * por rol para que el dueño de un negocio chico, que reparte él mismo, no
 * quede fuera.
 */
async function requireRider(organizationId: Id, riderId: Id): Promise<Membership> {
  const membership = await userRepository.getMembership(organizationId, riderId);
  if (!membership || membership.status !== 'ACTIVE') throw errors.notFound('Repartidor');
  if (!permissionsForRole(membership.role).includes(PERMISSIONS.DELIVERY_RIDE)) {
    throw errors.validation(`${membership.displayName} no tiene permiso para repartir.`);
  }
  return membership;
}

export const deliveryService = {
  /**
   * Crea el reparto a partir de una venta o un pedido, con el punto de destino
   * ya fijado a mano sobre el mapa.
   */
  async create(
    actor: ActorContext,
    input: CreateDeliveryInput,
  ): Promise<{ deliveryId: Id; number: string }> {
    if (!isValidPoint(input.point)) {
      throw errors.validation('Marca el destino en el mapa antes de despachar.');
    }

    const existing = await deliveryRepository.findBySource(actor.organizationId, input.sourceId);
    if (existing) {
      throw errors.conflict(
        `Ese documento ya tiene el reparto ${existing.number}.`,
      );
    }

    const [source, settings] = await Promise.all([
      readSource(actor.organizationId, input.source, input.sourceId),
      deliverySettingsRepository.get(actor.organizationId),
    ]);

    const origin = await resolveOrigin(actor.organizationId, settings, input.origin);

    const estimated = estimateRoadMeters(origin, input.point, settings.roadFactor);
    const estimatedMinutes = estimateMinutes(estimated);

    // La tarifa al cliente se calcula sobre la ESTIMACIÓN, no sobre lo que
    // termine recorriendo el rider: el cliente aceptó un precio y no se le
    // puede cambiar por un desvío. Si el pedido ya traía envío cobrado, ese
    // manda: fue lo que el comprador aceptó.
    const charged =
      source.charged > 0
        ? source.charged
        : customerFee(estimated, {
            baseFee: settings.customerBaseFee,
            feePerKm: settings.customerFeePerKm,
            freeKm: settings.customerFreeKm,
          });

    const rider = input.riderId
      ? await requireRider(actor.organizationId, input.riderId)
      : null;

    const ref = newDoc(COLLECTIONS.DELIVERIES);
    const prefix = DEFAULT_DELIVERY_PREFIX;

    const created = await runTransaction(async (tx) => {
      /*
       * El chequeo de duplicado de arriba da el mensaje amable, pero se hace
       * fuera de la transacción y por lo tanto no cierra la carrera: dos clics
       * simultáneos pueden pasarlo los dos. La clave de idempotencia —derivada
       * del documento de origen— sí es transaccional, así que el segundo intento
       * recibe el reparto del primero en lugar de crear otro. Importa porque un
       * reparto duplicado significa dos números correlativos y, al cerrar, dos
       * gastos por el mismo viaje.
       */
      const guard = await guardIdempotency(
        tx,
        actor.organizationId,
        `delivery_source_${input.sourceId}`,
        'delivery.create',
      );
      if (guard.existing) {
        // `duplicate` se agrega acá y no se lee del documento guardado: la
        // bandera describe ESTA ejecución, no lo que se almacenó.
        const previous = guard.existing as unknown as { deliveryId: Id; number: string };
        return { ...previous, duplicate: true as const };
      }

      const numbering = await reserveNumber(tx, actor.organizationId, 'delivery', prefix);

      const document: Delivery = {
        id: ref.id,
        organizationId: actor.organizationId,
        number: numbering.number,
        status: input.riderId ? 'ASSIGNED' : 'PENDING',
        source: input.source,
        sourceId: input.sourceId,
        sourceNumber: source.sourceNumber,
        customerId: source.customerId,
        customerName: source.customerName,
        destination: {
          recipient: source.recipient,
          address: source.address,
          phone: source.phone,
          notes: source.notes,
          point: { lat: input.point.lat, lng: input.point.lng },
          landmark: input.landmark?.trim() || null,
        },
        origin,
        riderId: input.riderId ?? null,
        riderName: rider?.displayName ?? null,
        amounts: { charged, cost: 0, riderPay: 0, expenseId: null },
        distances: { estimated, traveled: 0 },
        times: {
          assignedAt: input.riderId ? nowIso() : null,
          startedAt: null,
          finishedAt: null,
          estimatedMinutes,
        },
        lastPoint: null,
        resolutionNote: null,
        notes: input.notes?.trim() || null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      };

      numbering.commit();
      tx.create(ref, document);
      guard.commit({ deliveryId: ref.id, number: document.number });
      return { deliveryId: ref.id, number: document.number, duplicate: false as const };
    });

    // Un reintento no vuelve a auditar: registraría una creación que no ocurrió.
    if (created.duplicate) return { deliveryId: created.deliveryId, number: created.number };

    await audit(actor, {
      action: 'CREATE',
      module: 'DELIVERY',
      entityType: 'delivery',
      entityId: created.deliveryId,
      entityLabel: created.number,
      after: { source: input.source, sourceNumber: source.sourceNumber, estimated, charged },
    });

    return { deliveryId: created.deliveryId, number: created.number };
  },

  /** Asigna o reasigna el rider. Reasignar conserva el rastro ya recorrido. */
  async assign(actor: ActorContext, deliveryId: Id, riderId: Id): Promise<void> {
    const delivery = await deliveryRepository.require(actor.organizationId, deliveryId);
    if (delivery.status === 'PENDING') assertTransition(delivery.status, 'ASSIGNED');
    else if (delivery.status !== 'ASSIGNED' && delivery.status !== 'IN_TRANSIT') {
      throw errors.invalidTransition('El reparto ya está cerrado.');
    }

    const rider = await requireRider(actor.organizationId, riderId);

    await refs.delivery(deliveryId).set(
      {
        riderId,
        riderName: rider.displayName,
        status: delivery.status === 'PENDING' ? 'ASSIGNED' : delivery.status,
        times: { ...delivery.times, assignedAt: delivery.times.assignedAt ?? nowIso() },
        updatedAt: nowIso(),
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await audit(actor, {
      action: 'UPDATE',
      module: 'DELIVERY',
      entityType: 'delivery',
      entityId: deliveryId,
      entityLabel: delivery.number,
      before: { riderId: delivery.riderId },
      after: { riderId, riderName: rider.displayName },
    });
  },

  /**
   * El rider arranca el viaje. Solo puede hacerlo el rider asignado: es lo que
   * impide que un repartidor mueva el reparto de otro.
   */
  async start(actor: ActorContext, deliveryId: Id): Promise<void> {
    const delivery = await deliveryRepository.require(actor.organizationId, deliveryId);
    assertTransition(delivery.status, 'IN_TRANSIT');

    if (delivery.riderId !== actor.userId) {
      throw errors.forbidden('Ese reparto está asignado a otro repartidor.');
    }

    await refs.delivery(deliveryId).set(
      {
        status: 'IN_TRANSIT',
        times: { ...delivery.times, startedAt: nowIso() },
        updatedAt: nowIso(),
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await audit(actor, {
      action: 'UPDATE',
      module: 'DELIVERY',
      entityType: 'delivery',
      entityId: deliveryId,
      entityLabel: delivery.number,
      after: { status: 'IN_TRANSIT' },
    });
  },

  /**
   * Registra una marca de posición del rider.
   *
   * Todo lo que decide si la lectura cuenta pasa por el servidor: el teléfono
   * solo informa. Una lectura imprecisa o un salto imposible se guardan como
   * descarte en lugar de sumar metros que inflarían el costo.
   *
   * Cuesta UNA escritura: el reparto y el rastro se actualizan en una
   * transacción, con la última posición dentro del propio reparto para que el
   * mapa en vivo no necesite otra colección.
   */
  async recordPing(
    actor: ActorContext,
    deliveryId: Id,
    ping: TrackPingInput,
  ): Promise<PingResult> {
    if (!isValidPoint(ping)) {
      return { accepted: false, reason: 'Coordenada inválida.', traveled: 0 };
    }

    const settings = await deliverySettingsRepository.get(actor.organizationId);

    if (
      !Number.isFinite(ping.accuracy) ||
      ping.accuracy <= 0 ||
      ping.accuracy > settings.maxAccuracyMeters
    ) {
      // No es un error del sistema: el GPS todavía no fija bien. El teléfono
      // sigue intentando en el próximo ciclo.
      return {
        accepted: false,
        reason: `Precisión insuficiente (${Math.round(ping.accuracy)} m).`,
        traveled: 0,
      };
    }

    return runTransaction(async (tx) => {
      const deliverySnap = await tx.get(refs.delivery(deliveryId));
      if (!deliverySnap.exists) throw errors.notFound('Reparto');
      const delivery = { ...(deliverySnap.data() as Delivery), id: deliverySnap.id };

      if (delivery.organizationId !== actor.organizationId) throw errors.orgMismatch();
      if (delivery.riderId !== actor.userId) {
        throw errors.forbidden('Ese reparto está asignado a otro repartidor.');
      }
      if (delivery.status !== 'IN_TRANSIT') {
        throw errors.invalidTransition('El reparto no está en camino.');
      }

      const trackRef = refs.deliveryTrack(deliveryId);
      const trackSnap = await tx.get(trackRef);
      const existingCount = trackSnap.exists
        ? ((trackSnap.data() as DeliveryTrack).points ?? []).length
        : 0;

      const point: TrackPoint = {
        lat: ping.lat,
        lng: ping.lng,
        accuracy: ping.accuracy,
        speed: Number.isFinite(ping.speed ?? Number.NaN) ? (ping.speed as number) : null,
        // La hora la pone el SERVIDOR, no el dispositivo: un reloj mal puesto
        // desordenaría el rastro y falsearía las velocidades con las que se
        // descartan los saltos.
        at: nowIso(),
      };

      let traveled = delivery.distances.traveled;
      let rejected = false;
      let reason: string | null = null;

      if (delivery.lastPoint) {
        const verdict = evaluateSegment(delivery.lastPoint, point);
        if (verdict.counts) {
          traveled += verdict.meters;
        } else {
          rejected = true;
          reason =
            verdict.reason === 'jump'
              ? 'Salto imposible entre lecturas: se ignoró.'
              : 'Sin desplazamiento medible: se ignoró.';
        }
      }

      // Aun cuando el tramo no sume distancia, la posición se actualiza: el
      // mapa tiene que mostrar dónde está el rider aunque esté detenido.
      tx.set(
        refs.delivery(deliveryId),
        {
          lastPoint: point,
          distances: { ...delivery.distances, traveled },
          updatedAt: nowIso(),
        },
        { merge: true },
      );

      // El rastro solo guarda las marcas que describen movimiento real, más la
      // primera. Guardar el ruido engordaría el documento sin dibujar nada.
      const shouldStore = !rejected && existingCount < MAX_TRACK_POINTS;

      if (trackSnap.exists) {
        // El documento se arma con solo los campos que cambian: `arrayUnion`
        // sin argumentos no es una operación válida, así que una marca
        // descartada actualiza el contador y la fecha, y nada más.
        const patch: Record<string, unknown> = { updatedAt: nowIso() };
        if (shouldStore) patch.points = FieldValue.arrayUnion(point);
        if (rejected) patch.rejectedCount = FieldValue.increment(1);
        tx.set(trackRef, patch, { merge: true });
      } else {
        const track: DeliveryTrack = {
          id: deliveryId,
          organizationId: actor.organizationId,
          deliveryId,
          riderId: actor.userId,
          points: [point],
          rejectedCount: rejected ? 1 : 0,
          updatedAt: nowIso(),
        };
        tx.create(trackRef, track);
      }

      return { accepted: !rejected, reason, traveled };
    });
  },

  /**
   * Cierra el reparto: entregado o fallido.
   *
   * Acá el recorrido real se vuelve dinero. Si la configuración lo pide, el
   * costo se registra como gasto del ERP con clave de idempotencia derivada
   * del reparto, de modo que un doble clic no duplique el asiento.
   */
  async finish(
    ctx: ExpenseServiceContext,
    deliveryId: Id,
    outcome: { status: 'DELIVERED' | 'FAILED'; note?: string | null },
  ): Promise<{ cost: number; riderPay: number; expenseId: Id | null }> {
    const actor = ctx.actor;
    const delivery = await deliveryRepository.require(actor.organizationId, deliveryId);
    assertTransition(delivery.status, outcome.status);

    if (delivery.riderId !== actor.userId && !actor.permissions.includes(PERMISSIONS.DELIVERY_MANAGE)) {
      throw errors.forbidden('Solo el repartidor asignado o un supervisor pueden cerrarlo.');
    }
    if (outcome.status === 'FAILED' && !outcome.note?.trim()) {
      throw errors.validation('Explica por qué no se pudo entregar.');
    }

    const settings = await deliverySettingsRepository.get(actor.organizationId);
    const breakdown = deliveryCost(delivery.distances.traveled, {
      costPerKm: settings.costPerKm,
      riderPayPerDelivery: settings.riderPayPerDelivery,
      riderPayPerKm: settings.riderPayPerKm,
    });

    // El gasto solo se registra en una entrega efectiva: un reparto fallido
    // consumió combustible, pero registrarlo automáticamente sin que nadie lo
    // revise ensuciaría la contabilidad con casos que hay que mirar a mano.
    let expenseId: Id | null = null;
    if (
      outcome.status === 'DELIVERED' &&
      settings.autoRegisterExpense &&
      settings.expenseCategoryId &&
      breakdown.total > 0
    ) {
      const result = await expenseService.createExpense(
        ctx,
        {
          categoryId: settings.expenseCategoryId,
          description: `Reparto ${delivery.number} · ${delivery.sourceNumber}`,
          amount: toMajorUnits(breakdown.total),
          date: nowIso(),
          payNow: false,
          notes: `Recorrido ${(delivery.distances.traveled / 1000).toFixed(2)} km`,
        },
        `delivery_${deliveryId}_expense`,
      );
      expenseId = result.expenseId;
    }

    await refs.delivery(deliveryId).set(
      {
        status: outcome.status,
        amounts: {
          ...delivery.amounts,
          cost: breakdown.total,
          riderPay: breakdown.riderPay,
          expenseId,
        },
        times: { ...delivery.times, finishedAt: nowIso() },
        resolutionNote: outcome.note?.trim() || null,
        updatedAt: nowIso(),
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await audit(actor, {
      action: outcome.status === 'DELIVERED' ? 'CONFIRM' : 'CANCEL',
      module: 'DELIVERY',
      entityType: 'delivery',
      entityId: deliveryId,
      entityLabel: delivery.number,
      before: { status: delivery.status },
      after: {
        status: outcome.status,
        traveled: delivery.distances.traveled,
        cost: breakdown.total,
        expenseId,
      },
    });

    return { cost: breakdown.total, riderPay: breakdown.riderPay, expenseId };
  },

  async cancel(actor: ActorContext, deliveryId: Id, note: string): Promise<void> {
    const delivery = await deliveryRepository.require(actor.organizationId, deliveryId);
    assertTransition(delivery.status, 'CANCELLED');
    if (!note.trim()) throw errors.validation('Explica por qué se anula el reparto.');

    await refs.delivery(deliveryId).set(
      {
        status: 'CANCELLED',
        resolutionNote: note.trim(),
        times: { ...delivery.times, finishedAt: nowIso() },
        updatedAt: nowIso(),
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await audit(actor, {
      action: 'CANCEL',
      module: 'DELIVERY',
      entityType: 'delivery',
      entityId: deliveryId,
      entityLabel: delivery.number,
      before: { status: delivery.status },
      after: { status: 'CANCELLED', note: note.trim() },
    });
  },

/**
   * Documentos que se pueden repartir y todavía no tienen reparto.
   *
   * Se limita a una ventana de días porque el caso real es despachar lo de hoy:
   * traer el histórico completo costaría lecturas para ofrecer ventas que nadie
   * va a repartir un mes después. El filtro de "tiene datos de entrega" se hace
   * en memoria a propósito — indexar un campo anidado que casi siempre es nulo
   * agrega un índice compuesto para no ganar nada.
   */
  async listCandidates(organizationId: Id, days = 15): Promise<DeliveryCandidate[]> {
    const from = new Date(Date.now() - days * 86_400_000).toISOString();

    const [sales, orders, taken] = await Promise.all([
      saleRepository.list(organizationId, { from }, { limit: 100 }),
      storeOrderRepository.list(organizationId, { status: 'APPROVED' }, { limit: 100 }),
      deliveryRepository.sourceIdsSince(organizationId, from),
    ]);

    const candidates: DeliveryCandidate[] = [];

    for (const sale of sales.items) {
      if (!sale.delivery || sale.status === 'CANCELLED' || taken.has(sale.id)) continue;
      candidates.push({
        source: 'SALE',
        sourceId: sale.id,
        number: sale.number,
        customerName: sale.customerName,
        address: sale.delivery.address,
        phone: sale.delivery.phone,
        createdAt: sale.createdAt,
        charged: 0,
      });
    }

    for (const order of orders.items) {
      if (taken.has(order.id)) continue;
      candidates.push({
        source: 'STORE_ORDER',
        sourceId: order.id,
        number: order.number,
        customerName: order.customer.name,
        address: order.delivery.address,
        phone: order.delivery.phone,
        createdAt: order.createdAt,
        charged: order.shippingCost,
      });
    }

    return candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** Riders de la organización con su carga actual, para despachar. */
  async listRiders(organizationId: Id): Promise<RiderSummary[]> {
    const [memberships, counts, active] = await Promise.all([
      userRepository.listMemberships(organizationId),
      deliveryRepository.activeCountByRider(organizationId, ACTIVE_DELIVERY_STATUSES),
      deliveryRepository.active(organizationId, ['IN_TRANSIT']),
    ]);

    // La última posición conocida sale del reparto en curso: no hace falta una
    // colección aparte para saber dónde está cada rider.
    const lastPoints = new Map<Id, TrackPoint>();
    for (const delivery of active) {
      if (delivery.riderId && delivery.lastPoint) {
        lastPoints.set(delivery.riderId, delivery.lastPoint);
      }
    }

    return memberships
      .filter(
        (member) =>
          member.status === 'ACTIVE' &&
          permissionsForRole(member.role).includes(PERMISSIONS.DELIVERY_RIDE),
      )
      .map((member) => ({
        userId: member.userId,
        name: member.displayName,
        email: member.email,
        activeCount: counts.get(member.userId) ?? 0,
        lastPoint: lastPoints.get(member.userId) ?? null,
      }))
      .sort((a, b) => a.activeCount - b.activeCount || a.name.localeCompare(b.name));
  },
  /**
   * Guarda las tarifas del reparto.
   *
   * Los importes llegan del formulario en unidades mayores (córdobas) y se
   * almacenan en centavos, como todo el dinero del ERP. El punto de partida se
   * valida acá porque un origen inválido no rompe nada al guardarse pero
   * arruina en silencio toda estimación posterior.
   */
  async updateSettings(actor: ActorContext, input: DeliverySettingsInput): Promise<void> {
    if (input.origin && !isValidPoint(input.origin)) {
      throw errors.validation('El punto de partida marcado en el mapa no es válido.');
    }

    const patch: Partial<DeliverySettings> = {
      origin: input.origin ? { lat: input.origin.lat, lng: input.origin.lng } : null,
      costPerKm: toMinorUnits(input.costPerKm),
      riderPayPerDelivery: toMinorUnits(input.riderPayPerDelivery),
      riderPayPerKm: toMinorUnits(input.riderPayPerKm),
      customerBaseFee: toMinorUnits(input.customerBaseFee),
      customerFeePerKm: toMinorUnits(input.customerFeePerKm),
      customerFreeKm: input.customerFreeKm,
      roadFactor: input.roadFactor,
      pingSeconds: input.pingSeconds,
      maxAccuracyMeters: input.maxAccuracyMeters,
      expenseCategoryId: input.expenseCategoryId,
      autoRegisterExpense: input.autoRegisterExpense,
    };

    // Registrar el gasto automáticamente sin categoría no tiene a dónde ir: se
    // avisa en lugar de guardar una configuración que fallaría al cerrar el
    // primer reparto.
    if (patch.autoRegisterExpense && !patch.expenseCategoryId) {
      throw errors.validation(
        'Elige la categoría de gasto donde registrar el costo, o desactiva el registro automático.',
      );
    }

    await deliverySettingsRepository.save(actor.organizationId, patch, actor.userId);

    await audit(actor, {
      action: 'UPDATE',
      module: 'DELIVERY',
      entityType: 'deliverySettings',
      entityId: actor.organizationId,
      entityLabel: 'Tarifas de reparto',
      after: patch as Record<string, unknown>,
    });
  },

  /**
   * Totales del módulo para la cabecera del panel: cuántos repartos hay en cada
   * estado y qué dejó el reparto en el período.
   *
   * `margin` es el número que casi nadie tiene a mano: lo cobrado por envíos
   * menos lo que costó hacerlos. Puede ser negativo, y verlo así es justamente
   * el punto.
   */
  async summary(organizationId: Id, from: string): Promise<DeliverySummary> {
    const [pending, assigned, inTransit, delivered] = await Promise.all([
      deliveryRepository.countByStatus(organizationId, 'PENDING'),
      deliveryRepository.countByStatus(organizationId, 'ASSIGNED'),
      deliveryRepository.countByStatus(organizationId, 'IN_TRANSIT'),
      deliveryRepository.deliveredSince(organizationId, from),
    ]);

    let charged = 0;
    let cost = 0;
    let meters = 0;
    let minutes = 0;
    let timed = 0;

    for (const item of delivered) {
      charged += item.amounts.charged;
      cost += item.amounts.cost;
      meters += item.distances.traveled;

      if (item.times.startedAt && item.times.finishedAt) {
        const span =
          new Date(item.times.finishedAt).getTime() - new Date(item.times.startedAt).getTime();
        if (span > 0) {
          minutes += span / 60000;
          timed += 1;
        }
      }
    }

    return {
      pending,
      assigned,
      inTransit,
      deliveredCount: delivered.length,
      charged,
      cost,
      margin: charged - cost,
      traveledMeters: Math.round(meters),
      averageMinutes: timed > 0 ? Math.round(minutes / timed) : null,
    };
  },
};

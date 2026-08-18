import { beforeEach, describe, expect, it } from 'vitest';

import { fakeDb } from '../helpers/fake-firestore';
import {
  DESTINATION_POINT,
  ORG_ID,
  ORIGIN_POINT,
  RIDER_ID,
  ctx,
  riderCtx,
  seedDeliverableSale,
  seedDeliverySetup,
  seedOrganization,
  seedStore,
} from './fixtures';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppError } from '@/lib/errors';
import { deliveryService } from '@/lib/services/delivery';
import { storeOrderService } from '@/lib/services/store-orders';
import type { Delivery, DeliveryTrack } from '@/types/delivery';
import type { Expense } from '@/types/expenses';

/**
 * Reparto con seguimiento en vivo.
 *
 * Lo que se prueba acá no es que el mapa dibuje: es que los DOS números que
 * salen del módulo sean defendibles. Uno se le cobra a un cliente y el otro se
 * asienta como gasto en la contabilidad, así que las pruebas se concentran en
 * quién puede mover un reparto, qué lecturas del GPS cuentan y de dónde sale
 * exactamente el costo.
 */

/** Marca de posición tal como la manda el teléfono. */
function ping(lat: number, lng: number, accuracy = 8) {
  return { lat, lng, accuracy, speed: null };
}

/**
 * Fija la última posición del reparto y su instante.
 *
 * `recordPing` sella la hora en el servidor, así que para probar un tramo con
 * una duración concreta hay que retrasar la marca previa a mano: es el
 * equivalente a que hayan pasado esos segundos de verdad.
 */
function backdateLastPoint(deliveryId: string, secondsAgo: number) {
  const current = fakeDb.read(COLLECTIONS.DELIVERIES, deliveryId) as unknown as Delivery;
  fakeDb.write(
    COLLECTIONS.DELIVERIES,
    deliveryId,
    {
      lastPoint: {
        ...current.lastPoint,
        at: new Date(Date.now() - secondsAgo * 1000).toISOString(),
      },
    } as unknown as Record<string, unknown>,
    true,
  );
}

/** Despacha un reparto y lo pone en camino con el rider de las fixtures. */
async function dispatchAndStart(): Promise<string> {
  seedDeliverableSale(fakeDb);
  const { deliveryId } = await deliveryService.create(ctx.actor, {
    source: 'SALE',
    sourceId: 'sale-delivery',
    point: DESTINATION_POINT,
    riderId: RIDER_ID,
  });
  await deliveryService.start(riderCtx.actor, deliveryId);
  return deliveryId;
}

beforeEach(() => {
  fakeDb.reset();
  seedOrganization(fakeDb, { productCost: 100, productPrice: 200, initialStock: 50 });
  seedDeliverySetup(fakeDb);
});

describe('despacho', () => {
  it('hereda cliente y dirección de la venta y estima distancia, tiempo y tarifa', async () => {
    seedDeliverableSale(fakeDb);

    const result = await deliveryService.create(ctx.actor, {
      source: 'SALE',
      sourceId: 'sale-delivery',
      point: DESTINATION_POINT,
      landmark: 'Portón negro',
    });

    expect(result.number).toMatch(/^DEL-\d{6}$/);

    const delivery = fakeDb.read(COLLECTIONS.DELIVERIES, result.deliveryId) as unknown as Delivery;
    expect(delivery.status).toBe('PENDING');
    expect(delivery.customerName).toBe('Cliente de prueba');
    expect(delivery.destination.address).toContain('rotonda Jean Paul');
    expect(delivery.destination.recipient).toBe('Doña Marta');
    expect(delivery.destination.landmark).toBe('Portón negro');
    expect(delivery.origin).toEqual(ORIGIN_POINT);

    // 1,7 km en línea recta por el factor 1.4 ≈ 2,4 km de ruta.
    expect(delivery.distances.estimated).toBeGreaterThan(2200);
    expect(delivery.distances.estimated).toBeLessThan(2600);
    expect(delivery.distances.traveled).toBe(0);
    expect(delivery.times.estimatedMinutes).toBeGreaterThan(0);

    // Base C$50 + los ~0,4 km que exceden los 2 incluidos, a C$10.
    expect(delivery.amounts.charged).toBeGreaterThanOrEqual(5000);
    expect(delivery.amounts.charged).toBeLessThan(6000);
    expect(delivery.amounts.cost).toBe(0);
  });

  it('queda ASSIGNED cuando se despacha con rider', async () => {
    seedDeliverableSale(fakeDb);

    const { deliveryId } = await deliveryService.create(ctx.actor, {
      source: 'SALE',
      sourceId: 'sale-delivery',
      point: DESTINATION_POINT,
      riderId: RIDER_ID,
    });

    const delivery = fakeDb.read(COLLECTIONS.DELIVERIES, deliveryId) as unknown as Delivery;
    expect(delivery.status).toBe('ASSIGNED');
    expect(delivery.riderId).toBe(RIDER_ID);
    expect(delivery.riderName).toBe('Marlon Rider');
    expect(delivery.times.assignedAt).not.toBeNull();
  });

  it('rechaza repartir una venta de mostrador', async () => {
    // Venta sin datos de entrega: es una venta en el local.
    fakeDb.write(
      COLLECTIONS.SALES,
      'sale-counter',
      { id: 'sale-counter', organizationId: ORG_ID, number: 'FAC-000002', status: 'PAID', delivery: null },
      false,
    );

    await expect(
      deliveryService.create(ctx.actor, {
        source: 'SALE',
        sourceId: 'sale-counter',
        point: DESTINATION_POINT,
      }),
    ).rejects.toThrow(AppError);
  });

  it('no permite dos repartos para el mismo documento', async () => {
    seedDeliverableSale(fakeDb);
    await deliveryService.create(ctx.actor, {
      source: 'SALE',
      sourceId: 'sale-delivery',
      point: DESTINATION_POINT,
    });

    await expect(
      deliveryService.create(ctx.actor, {
        source: 'SALE',
        sourceId: 'sale-delivery',
        point: DESTINATION_POINT,
      }),
    ).rejects.toThrow(/ya tiene el reparto/);
  });

  it('un reintento devuelve el reparto original en lugar de crear otro', async () => {
    seedDeliverableSale(fakeDb);

    const first = await deliveryService.create(ctx.actor, {
      source: 'SALE',
      sourceId: 'sale-delivery',
      point: DESTINATION_POINT,
    });

    /*
     * El chequeo que da el mensaje amable ("ese documento ya tiene el reparto
     * X") corre FUERA de la transacción, así que no cierra la carrera de dos
     * clics simultáneos. Lo que la cierra es la clave de idempotencia, y es lo
     * que se prueba acá: se borra el reparto para que el pre-chequeo no lo vea
     * —igual que le pasaría al segundo clic, que leyó antes de que el primero
     * escribiera— y se repite el despacho. Sin la clave habría dos números
     * correlativos y, al cerrar, dos gastos por el mismo viaje.
     */
    fakeDb.collectionData(COLLECTIONS.DELIVERIES).delete(first.deliveryId);

    const retry = await deliveryService.create(ctx.actor, {
      source: 'SALE',
      sourceId: 'sale-delivery',
      point: DESTINATION_POINT,
    });

    expect(retry.deliveryId).toBe(first.deliveryId);
    expect(retry.number).toBe(first.number);
    expect(fakeDb.all(COLLECTIONS.DELIVERIES)).toHaveLength(0);
  });

  it('exige punto de partida configurado antes de despachar', async () => {
    seedDeliverySetup(fakeDb, { origin: null });
    seedDeliverableSale(fakeDb);

    await expect(
      deliveryService.create(ctx.actor, {
        source: 'SALE',
        sourceId: 'sale-delivery',
        point: DESTINATION_POINT,
      }),
    ).rejects.toThrow(/punto de partida/);
  });

  it('rechaza un destino en el (0,0), que es lo que manda un GPS sin señal', async () => {
    seedDeliverableSale(fakeDb);

    await expect(
      deliveryService.create(ctx.actor, {
        source: 'SALE',
        sourceId: 'sale-delivery',
        point: { lat: 0, lng: 0 },
      }),
    ).rejects.toThrow(/Marca el destino/);
  });

  it('no asigna a un usuario que no puede repartir', async () => {
    seedDeliverableSale(fakeDb);
    // Un vendedor tiene delivery.manage pero NO delivery.ride.
    fakeDb.write(
      COLLECTIONS.MEMBERSHIPS,
      `${ORG_ID}_user-seller`,
      {
        id: `${ORG_ID}_user-seller`,
        organizationId: ORG_ID,
        userId: 'user-seller',
        email: 'vende@test.local',
        displayName: 'Vendedor',
        role: 'SALES',
        status: 'ACTIVE',
      },
      false,
    );

    await expect(
      deliveryService.create(ctx.actor, {
        source: 'SALE',
        sourceId: 'sale-delivery',
        point: DESTINATION_POINT,
        riderId: 'user-seller',
      }),
    ).rejects.toThrow(/no tiene permiso para repartir/);
  });
});

describe('reparto desde un pedido de la tienda', () => {
  it('respeta el envío que el comprador ya aceptó en lugar de recalcularlo', async () => {
    seedStore(fakeDb, { shippingCost: 120 });
    const order = await storeOrderService.createFromStorefront('tienda-test', {
      customer: { name: 'Ana Pérez', phone: '88881234', email: null, document: null },
      address: 'Reparto Schick, casa 12',
      items: [{ productId: 'prod-1', quantity: 1 }],
    });
    // El reparto solo se ofrece con el pedido aprobado.
    fakeDb.write(COLLECTIONS.STORE_ORDERS, order.orderId, { status: 'APPROVED' }, true);

    const { deliveryId } = await deliveryService.create(ctx.actor, {
      source: 'STORE_ORDER',
      sourceId: order.orderId,
      point: DESTINATION_POINT,
    });

    const delivery = fakeDb.read(COLLECTIONS.DELIVERIES, deliveryId) as unknown as Delivery;
    expect(delivery.source).toBe('STORE_ORDER');
    // C$120 de envío del pedido, no la tarifa por distancia (que daría ~C$54).
    expect(delivery.amounts.charged).toBe(12000);
    expect(delivery.destination.address).toBe('Reparto Schick, casa 12');
  });
});

describe('permisos sobre el reparto en curso', () => {
  it('solo el rider asignado puede arrancar el viaje', async () => {
    seedDeliverableSale(fakeDb);
    const { deliveryId } = await deliveryService.create(ctx.actor, {
      source: 'SALE',
      sourceId: 'sale-delivery',
      point: DESTINATION_POINT,
      riderId: RIDER_ID,
    });

    // El administrador que despachó NO puede salir con el reparto de otro.
    await expect(deliveryService.start(ctx.actor, deliveryId)).rejects.toThrow(
      /otro repartidor/,
    );

    await deliveryService.start(riderCtx.actor, deliveryId);
    const delivery = fakeDb.read(COLLECTIONS.DELIVERIES, deliveryId) as unknown as Delivery;
    expect(delivery.status).toBe('IN_TRANSIT');
    expect(delivery.times.startedAt).not.toBeNull();
  });

  it('un rider ajeno no puede informar posición en un reparto que no es suyo', async () => {
    const deliveryId = await dispatchAndStart();
    const intruder = { ...riderCtx.actor, userId: 'user-otro-rider' };

    await expect(
      deliveryService.recordPing(intruder, deliveryId, ping(12.127, -86.269)),
    ).rejects.toThrow(/otro repartidor/);
  });

  it('no acepta posiciones antes de salir', async () => {
    seedDeliverableSale(fakeDb);
    const { deliveryId } = await deliveryService.create(ctx.actor, {
      source: 'SALE',
      sourceId: 'sale-delivery',
      point: DESTINATION_POINT,
      riderId: RIDER_ID,
    });

    await expect(
      deliveryService.recordPing(riderCtx.actor, deliveryId, ping(12.127, -86.269)),
    ).rejects.toThrow(/no está en camino/);
  });
});

describe('registro de posiciones', () => {
  it('guarda la primera marca y arranca el rastro', async () => {
    const deliveryId = await dispatchAndStart();

    const result = await deliveryService.recordPing(
      riderCtx.actor,
      deliveryId,
      ping(ORIGIN_POINT.lat, ORIGIN_POINT.lng),
    );

    expect(result.accepted).toBe(true);
    expect(result.traveled).toBe(0);

    const track = fakeDb.read(COLLECTIONS.DELIVERY_TRACKS, deliveryId) as unknown as DeliveryTrack;
    expect(track.points).toHaveLength(1);
    expect(track.rejectedCount).toBe(0);

    const delivery = fakeDb.read(COLLECTIONS.DELIVERIES, deliveryId) as unknown as Delivery;
    expect(delivery.lastPoint).not.toBeNull();
  });

  it('suma el tramo cuando hubo desplazamiento real', async () => {
    const deliveryId = await dispatchAndStart();
    await deliveryService.recordPing(riderCtx.actor, deliveryId, ping(12.1281, -86.2685));
    // Cinco minutos después, 1,7 km más allá: 20 km/h, una moto en ciudad.
    backdateLastPoint(deliveryId, 300);

    const result = await deliveryService.recordPing(
      riderCtx.actor,
      deliveryId,
      ping(DESTINATION_POINT.lat, DESTINATION_POINT.lng),
    );

    expect(result.accepted).toBe(true);
    expect(result.traveled).toBeGreaterThan(1600);
    expect(result.traveled).toBeLessThan(1800);

    const track = fakeDb.read(COLLECTIONS.DELIVERY_TRACKS, deliveryId) as unknown as DeliveryTrack;
    expect(track.points).toHaveLength(2);
  });

  it('un teléfono quieto no inventa un solo metro', async () => {
    const deliveryId = await dispatchAndStart();
    await deliveryService.recordPing(riderCtx.actor, deliveryId, ping(12.1281, -86.2685, 15));

    // Media hora esperando en el portón, con la oscilación normal del GPS.
    for (let i = 0; i < 60; i += 1) {
      backdateLastPoint(deliveryId, 30);
      const wobble = (i % 2 === 0 ? 1 : -1) * 0.00009;
      await deliveryService.recordPing(
        riderCtx.actor,
        deliveryId,
        ping(12.1281 + wobble, -86.2685, 15),
      );
    }

    const delivery = fakeDb.read(COLLECTIONS.DELIVERIES, deliveryId) as unknown as Delivery;
    expect(delivery.distances.traveled).toBe(0);

    // El rastro no engorda con ruido, pero la última posición sí se actualiza:
    // el mapa tiene que mostrar al rider aunque esté detenido.
    const track = fakeDb.read(COLLECTIONS.DELIVERY_TRACKS, deliveryId) as unknown as DeliveryTrack;
    expect(track.points).toHaveLength(1);
    expect(track.rejectedCount).toBe(60);
    expect(delivery.lastPoint).not.toBeNull();
  });

  it('descarta el salto que aparece al recuperar señal', async () => {
    const deliveryId = await dispatchAndStart();
    await deliveryService.recordPing(riderCtx.actor, deliveryId, ping(12.1281, -86.2685));
    // 1,7 km en 30 s son más de 200 km/h.
    backdateLastPoint(deliveryId, 30);

    const result = await deliveryService.recordPing(
      riderCtx.actor,
      deliveryId,
      ping(DESTINATION_POINT.lat, DESTINATION_POINT.lng),
    );

    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/Salto imposible/);
    expect(result.traveled).toBe(0);
  });

  it('descarta la lectura imprecisa sin tratarla como error', async () => {
    const deliveryId = await dispatchAndStart();

    const result = await deliveryService.recordPing(
      riderCtx.actor,
      deliveryId,
      ping(12.1281, -86.2685, 500),
    );

    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/Precisión insuficiente/);
    // Ni rastro ni posición: una lectura de 500 m de error no dice nada.
    expect(fakeDb.read(COLLECTIONS.DELIVERY_TRACKS, deliveryId)).toBeUndefined();
  });

  it('sella la hora en el servidor e ignora la que manda el dispositivo', async () => {
    const deliveryId = await dispatchAndStart();

    await deliveryService.recordPing(riderCtx.actor, deliveryId, {
      ...ping(12.1281, -86.2685),
      // Un reloj mal puesto: el año que viene.
      at: '2027-06-01T00:00:00.000Z',
    });

    const track = fakeDb.read(COLLECTIONS.DELIVERY_TRACKS, deliveryId) as unknown as DeliveryTrack;
    expect(track.points[0].at.startsWith('2027')).toBe(false);
  });
});

describe('cierre y costo', () => {
  it('convierte el recorrido real en costo, no la estimación', async () => {
    seedDeliverySetup(fakeDb, { costPerKm: 15 });
    const deliveryId = await dispatchAndStart();

    await deliveryService.recordPing(riderCtx.actor, deliveryId, ping(12.1281, -86.2685));
    backdateLastPoint(deliveryId, 300);
    await deliveryService.recordPing(
      riderCtx.actor,
      deliveryId,
      ping(DESTINATION_POINT.lat, DESTINATION_POINT.lng),
    );

    const result = await deliveryService.finish(riderCtx, deliveryId, { status: 'DELIVERED' });

    const delivery = fakeDb.read(COLLECTIONS.DELIVERIES, deliveryId) as unknown as Delivery;
    // ~1,7 km a C$15/km ≈ C$26. Lo importante: sale del recorrido (1,7 km) y
    // no de la estimación (2,4 km), que habría dado unos C$36.
    expect(result.cost).toBeGreaterThan(2400);
    expect(result.cost).toBeLessThan(2700);
    expect(delivery.status).toBe('DELIVERED');
    expect(delivery.amounts.cost).toBe(result.cost);
    expect(delivery.times.finishedAt).not.toBeNull();
  });

  it('no le paga al rider un reparto sin un metro recorrido', async () => {
    seedDeliverySetup(fakeDb, { riderPayPerDelivery: 20, riderPayPerKm: 5 });
    const deliveryId = await dispatchAndStart();

    const result = await deliveryService.finish(riderCtx, deliveryId, { status: 'DELIVERED' });

    expect(result.riderPay).toBe(0);
    expect(result.cost).toBe(0);
  });

  it('registra el gasto una sola vez cuando la configuración lo pide', async () => {
    seedDeliverySetup(fakeDb, {
      costPerKm: 15,
      autoRegisterExpense: true,
      expenseCategoryId: 'expcat-1',
    });
    const deliveryId = await dispatchAndStart();

    await deliveryService.recordPing(riderCtx.actor, deliveryId, ping(12.1281, -86.2685));
    backdateLastPoint(deliveryId, 300);
    await deliveryService.recordPing(
      riderCtx.actor,
      deliveryId,
      ping(DESTINATION_POINT.lat, DESTINATION_POINT.lng),
    );

    const result = await deliveryService.finish(riderCtx, deliveryId, { status: 'DELIVERED' });

    expect(result.expenseId).not.toBeNull();
    const expenses = fakeDb.all<Expense>(COLLECTIONS.EXPENSES);
    expect(expenses).toHaveLength(1);
    expect(expenses[0].description).toContain('Reparto DEL-000001');
    expect(expenses[0].total).toBe(result.cost);
  });

  it('no registra gasto en un reparto que no se pudo entregar', async () => {
    seedDeliverySetup(fakeDb, {
      costPerKm: 15,
      autoRegisterExpense: true,
      expenseCategoryId: 'expcat-1',
    });
    const deliveryId = await dispatchAndStart();
    await deliveryService.recordPing(riderCtx.actor, deliveryId, ping(12.1281, -86.2685));
    backdateLastPoint(deliveryId, 300);
    await deliveryService.recordPing(
      riderCtx.actor,
      deliveryId,
      ping(DESTINATION_POINT.lat, DESTINATION_POINT.lng),
    );

    const result = await deliveryService.finish(riderCtx, deliveryId, {
      status: 'FAILED',
      note: 'Nadie en la casa',
    });

    // El costo se calcula igual —el combustible se gastó— pero el asiento
    // queda para que alguien lo mire, no automático.
    expect(result.cost).toBeGreaterThan(0);
    expect(result.expenseId).toBeNull();
    expect(fakeDb.all(COLLECTIONS.EXPENSES)).toHaveLength(0);

    const delivery = fakeDb.read(COLLECTIONS.DELIVERIES, deliveryId) as unknown as Delivery;
    expect(delivery.status).toBe('FAILED');
    expect(delivery.resolutionNote).toBe('Nadie en la casa');
  });

  it('exige explicación para marcar un reparto como no entregado', async () => {
    const deliveryId = await dispatchAndStart();

    await expect(
      deliveryService.finish(riderCtx, deliveryId, { status: 'FAILED', note: '   ' }),
    ).rejects.toThrow(/por qué no se pudo entregar/);
  });

  it('no se puede reabrir un reparto cerrado', async () => {
    const deliveryId = await dispatchAndStart();
    await deliveryService.finish(riderCtx, deliveryId, { status: 'DELIVERED' });

    await expect(
      deliveryService.finish(riderCtx, deliveryId, { status: 'DELIVERED' }),
    ).rejects.toThrow(AppError);
    await expect(
      deliveryService.recordPing(riderCtx.actor, deliveryId, ping(12.128, -86.268)),
    ).rejects.toThrow(/no está en camino/);
  });
});

describe('resumen del módulo', () => {
  it('calcula el margen de los envíos entregados', async () => {
    seedDeliverySetup(fakeDb, { costPerKm: 15, customerBaseFee: 50, customerFeePerKm: 10 });
    const deliveryId = await dispatchAndStart();

    await deliveryService.recordPing(riderCtx.actor, deliveryId, ping(12.1281, -86.2685));
    backdateLastPoint(deliveryId, 300);
    await deliveryService.recordPing(
      riderCtx.actor,
      deliveryId,
      ping(DESTINATION_POINT.lat, DESTINATION_POINT.lng),
    );
    await deliveryService.finish(riderCtx, deliveryId, { status: 'DELIVERED' });

    const summary = await deliveryService.summary(ORG_ID, '2020-01-01T00:00:00.000Z');

    expect(summary.deliveredCount).toBe(1);
    expect(summary.margin).toBe(summary.charged - summary.cost);
    // Cobró ~C$54 y le costó ~C$26: el envío deja ganancia con estas tarifas.
    expect(summary.margin).toBeGreaterThan(0);
    expect(summary.traveledMeters).toBeGreaterThan(1600);
  });
});

describe('anulación', () => {
  it('anula con motivo y deja el reparto cerrado', async () => {
    seedDeliverableSale(fakeDb);
    const { deliveryId } = await deliveryService.create(ctx.actor, {
      source: 'SALE',
      sourceId: 'sale-delivery',
      point: DESTINATION_POINT,
    });

    await deliveryService.cancel(ctx.actor, deliveryId, 'El cliente reprogramó');

    const delivery = fakeDb.read(COLLECTIONS.DELIVERIES, deliveryId) as unknown as Delivery;
    expect(delivery.status).toBe('CANCELLED');
    expect(delivery.resolutionNote).toBe('El cliente reprogramó');

    // La venta no se toca: anular el reparto no anula el documento de origen.
    const sale = fakeDb.read(COLLECTIONS.SALES, 'sale-delivery') as unknown as { status: string };
    expect(sale.status).toBe('PAID');
  });

  it('no anula un reparto en camino sin pasar por el cierre', async () => {
    const deliveryId = await dispatchAndStart();

    await expect(
      deliveryService.cancel(ctx.actor, deliveryId, 'Ya no'),
    ).rejects.toThrow(AppError);
  });
});

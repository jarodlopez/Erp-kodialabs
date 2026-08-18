import { describe, expect, it } from 'vitest';

import {
  customerFee,
  deliveryCost,
  estimateMinutes,
  estimateRoadMeters,
  evaluateSegment,
  formatDistance,
  formatDuration,
  haversineMeters,
  isValidPoint,
  trackDistanceMeters,
} from '@/lib/geo';
import type { TrackPoint } from '@/types/delivery';

/**
 * Aritmética del reparto.
 *
 * Lo que se prueba aquí termina en dos lugares serios: un gasto registrado en
 * la contabilidad y una tarifa cobrada a un cliente. El caso más importante no
 * es la distancia bien medida, sino la NO medida: un teléfono quieto que
 * oscila no puede generar kilómetros.
 */

/** Puntos reales de Managua, a distancias conocidas entre sí. */
const ROTONDA_METROCENTRO = { lat: 12.1281, lng: -86.2685 };
const ROTONDA_JEAN_PAUL = { lat: 12.1128, lng: -86.2698 };

function point(lat: number, lng: number, seconds: number, accuracy = 8): TrackPoint {
  return {
    lat,
    lng,
    accuracy,
    speed: null,
    at: new Date(Date.UTC(2026, 0, 1, 12, 0, seconds)).toISOString(),
  };
}

describe('validación de coordenadas', () => {
  it('acepta un punto real y rechaza los imposibles', () => {
    expect(isValidPoint(ROTONDA_METROCENTRO)).toBe(true);
    expect(isValidPoint({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidPoint({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidPoint({ lat: Number.NaN, lng: 0 })).toBe(false);
  });

  it('rechaza el (0,0), que es lo que manda un dispositivo sin señal', () => {
    expect(isValidPoint({ lat: 0, lng: 0 })).toBe(false);
  });
});

describe('distancia entre dos puntos', () => {
  it('mide una distancia urbana conocida con precisión razonable', () => {
    // Las dos rotondas están a ~1,7 km en línea recta.
    const meters = haversineMeters(ROTONDA_METROCENTRO, ROTONDA_JEAN_PAUL);
    expect(meters).toBeGreaterThan(1600);
    expect(meters).toBeLessThan(1800);
  });

  it('da cero para el mismo punto y es simétrica', () => {
    expect(haversineMeters(ROTONDA_METROCENTRO, ROTONDA_METROCENTRO)).toBe(0);
    expect(haversineMeters(ROTONDA_METROCENTRO, ROTONDA_JEAN_PAUL)).toBeCloseTo(
      haversineMeters(ROTONDA_JEAN_PAUL, ROTONDA_METROCENTRO),
      6,
    );
  });
});

describe('deriva del GPS', () => {
  it('NO cuenta el temblor de un teléfono detenido', () => {
    // Mismo portón, dos lecturas separadas 30 s con 6 m de diferencia y 15 m
    // de error declarado: no se puede afirmar que se haya movido.
    const parked = point(12.1281, -86.2685, 0, 15);
    const jitter = point(12.12815, -86.26853, 30, 15);

    const verdict = evaluateSegment(parked, jitter);
    expect(verdict.counts).toBe(false);
    expect(verdict.counts === false && verdict.reason).toBe('noise');
  });

  it('una hora esperando en un portón no genera un solo metro', () => {
    // 120 lecturas oscilando dentro del error declarado. El desvío elegido
    // (±0.00009° ≈ 10 m) deja tramos consecutivos de unos 20 m, que es el peor
    // caso realista para un GPS que informa 15 m de precisión.
    const points: TrackPoint[] = [];
    for (let i = 0; i < 120; i += 1) {
      const wobble = (i % 2 === 0 ? 1 : -1) * 0.00009;
      points.push(point(12.1281 + wobble, -86.2685, i * 30, 15));
    }

    expect(trackDistanceMeters(points)).toBe(0);
  });

  it('descarta el salto que aparece al recuperar señal', () => {
    // 1,7 km en 30 s son más de 200 km/h: es un salto, no un viaje.
    const before = point(12.1281, -86.2685, 0);
    const after = point(12.1128, -86.2698, 30);

    const verdict = evaluateSegment(before, after);
    expect(verdict.counts).toBe(false);
    expect(verdict.counts === false && verdict.reason).toBe('jump');
  });

  it('acepta el mismo tramo cuando el tiempo lo hace plausible', () => {
    // Los mismos 1,7 km en 5 minutos son 20 km/h: una moto en ciudad.
    const before = point(12.1281, -86.2685, 0);
    const after = point(12.1128, -86.2698, 300);

    const verdict = evaluateSegment(before, after);
    expect(verdict.counts).toBe(true);
    expect(verdict.counts && verdict.meters).toBeGreaterThan(1600);
  });

  it('ignora marcas con el mismo instante o desordenadas', () => {
    const a = point(12.1281, -86.2685, 30);
    const b = point(12.1128, -86.2698, 30);
    expect(evaluateSegment(a, b).counts).toBe(false);
    expect(evaluateSegment(b, point(12.1128, -86.2698, 10)).counts).toBe(false);
  });

  it('exige más desplazamiento cuando el GPS declara más error', () => {
    // 40 m de movimiento: real con GPS bueno, indistinguible con GPS malo.
    const from = point(12.1281, -86.2685, 0, 5);
    const to = point(12.12846, -86.2685, 30, 5);
    expect(evaluateSegment(from, to).counts).toBe(true);

    const fuzzyFrom = point(12.1281, -86.2685, 0, 90);
    const fuzzyTo = point(12.12846, -86.2685, 30, 90);
    expect(evaluateSegment(fuzzyFrom, fuzzyTo).counts).toBe(false);
  });
});

describe('recorrido acumulado', () => {
  it('suma solo los tramos que cuentan', () => {
    const points = [
      point(12.1281, -86.2685, 0),
      // Parada: temblor dentro del error.
      point(12.12812, -86.26852, 30),
      // Avance real de ~560 m en 90 s (22 km/h).
      point(12.1231, -86.2685, 120),
      // Otro avance de ~560 m.
      point(12.1181, -86.2685, 210),
    ];

    const total = trackDistanceMeters(points);
    expect(total).toBeGreaterThan(1000);
    expect(total).toBeLessThan(1200);
  });

  it('un rastro de menos de dos marcas no tiene recorrido', () => {
    expect(trackDistanceMeters([])).toBe(0);
    expect(trackDistanceMeters([point(12.1281, -86.2685, 0)])).toBe(0);
  });
});

describe('estimaciones sin motor de rutas', () => {
  it('aplica el factor de carretera a la línea recta', () => {
    const straight = haversineMeters(ROTONDA_METROCENTRO, ROTONDA_JEAN_PAUL);
    expect(estimateRoadMeters(ROTONDA_METROCENTRO, ROTONDA_JEAN_PAUL, 1.4)).toBe(
      Math.round(straight * 1.4),
    );
  });

  it('cae a un factor sensato si el configurado no sirve', () => {
    const straight = haversineMeters(ROTONDA_METROCENTRO, ROTONDA_JEAN_PAUL);
    // Un factor menor que 1 acortaría la ruta por debajo de la línea recta.
    expect(estimateRoadMeters(ROTONDA_METROCENTRO, ROTONDA_JEAN_PAUL, 0.5)).toBe(
      Math.round(straight * 1.4),
    );
    expect(estimateRoadMeters(ROTONDA_METROCENTRO, ROTONDA_JEAN_PAUL, Number.NaN)).toBeGreaterThan(0);
  });

  it('estima minutos y nunca promete cero', () => {
    expect(estimateMinutes(0)).toBe(0);
    // 5 km a 22 km/h ≈ 14 min.
    expect(estimateMinutes(5000)).toBeGreaterThan(10);
    expect(estimateMinutes(5000)).toBeLessThan(18);
    // Cualquier distancia real cuesta al menos un minuto.
    expect(estimateMinutes(50)).toBe(1);
  });
});

describe('costo operativo', () => {
  const rates = { costPerKm: 1500, riderPayPerDelivery: 2000, riderPayPerKm: 500 };

  it('cobra el recorrido real por kilómetro', () => {
    // 4 km x C$15 = C$60 de recorrido; rider: C$20 + 4 x C$5 = C$40.
    const cost = deliveryCost(4000, rates);
    expect(cost.travel).toBe(6000);
    expect(cost.riderPay).toBe(4000);
    expect(cost.total).toBe(10000);
  });

  it('no paga al rider un reparto sin recorrido', () => {
    // Sin metros no hubo viaje: no corresponde el fijo por entrega.
    expect(deliveryCost(0, rates)).toMatchObject({ travel: 0, riderPay: 0, total: 0 });
  });

  it('trata las tarifas negativas como cero en lugar de restar', () => {
    const cost = deliveryCost(4000, { costPerKm: -1500, riderPayPerDelivery: -1, riderPayPerKm: 0 });
    expect(cost.total).toBe(0);
  });

  it('devuelve enteros: nunca fracciones de centavo', () => {
    const cost = deliveryCost(3333, rates);
    expect(Number.isInteger(cost.travel)).toBe(true);
    expect(Number.isInteger(cost.riderPay)).toBe(true);
    expect(Number.isInteger(cost.total)).toBe(true);
  });
});

describe('tarifa al cliente', () => {
  const rates = { baseFee: 5000, feePerKm: 1000, freeKm: 2 };

  it('cobra solo la base dentro de los kilómetros incluidos', () => {
    expect(customerFee(1500, rates)).toBe(5000);
    expect(customerFee(2000, rates)).toBe(5000);
  });

  it('cobra por kilómetro más allá de los incluidos', () => {
    // 5 km: base C$50 + 3 km x C$10 = C$80.
    expect(customerFee(5000, rates)).toBe(8000);
  });

  it('nunca devuelve menos que la base', () => {
    expect(customerFee(0, rates)).toBe(5000);
    expect(customerFee(-100, rates)).toBe(5000);
  });

  it('devuelve enteros', () => {
    expect(Number.isInteger(customerFee(3777, rates))).toBe(true);
  });
});

describe('formato', () => {
  it('usa metros por debajo del kilómetro y km por encima', () => {
    expect(formatDistance(320)).toBe('320 m');
    expect(formatDistance(1400)).toContain('km');
  });

  it('pasa a horas cuando corresponde', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(80)).toBe('1 h 20 min');
    expect(formatDuration(120)).toBe('2 h');
  });
});

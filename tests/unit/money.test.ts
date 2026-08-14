import { describe, expect, it } from 'vitest';

import {
  allocateProportionally,
  applyRate,
  basisPointsToPercent,
  formatMoney,
  fromScaledQty,
  multiplyByQty,
  percentToBasisPoints,
  roundHalfUp,
  toMajorUnits,
  toMinorUnits,
  toScaledQty,
  weightedAverageCost,
  reverseWeightedAverageCost,
  MoneyError,
} from '@/lib/money';

describe('conversión de unidades monetarias', () => {
  it('convierte a centavos sin errores de punto flotante', () => {
    expect(toMinorUnits(100)).toBe(10000);
    expect(toMinorUnits(0.1)).toBe(10);
    expect(toMinorUnits(19.99)).toBe(1999);
    // El caso clásico: 0.1 + 0.2 !== 0.3 en coma flotante.
    expect(toMinorUnits(0.1) + toMinorUnits(0.2)).toBe(toMinorUnits(0.3));
  });

  it('redondea de forma simétrica respecto al cero', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(2.4)).toBe(2);
  });

  it('vuelve a la unidad mayor solo para presentación', () => {
    expect(toMajorUnits(10050)).toBe(100.5);
    expect(fromScaledQty(1500)).toBe(1.5);
    expect(toScaledQty(2.345)).toBe(2345);
  });

  it('rechaza valores no finitos', () => {
    expect(() => toMinorUnits(Number.NaN)).toThrow(MoneyError);
    expect(() => toMajorUnits(1.5)).toThrow(MoneyError);
  });
});

describe('multiplicación por cantidad', () => {
  it('multiplica precio por cantidad escalada', () => {
    // 3 unidades a C$10.50 = C$31.50
    expect(multiplyByQty(1050, 3000)).toBe(3150);
  });

  it('soporta cantidades fraccionarias', () => {
    // 1.5 kg a C$80.00 = C$120.00
    expect(multiplyByQty(8000, 1500)).toBe(12000);
  });

  it('redondea el resultado a centavos enteros', () => {
    // 0.333 unidades a C$10.00 = C$3.33
    expect(multiplyByQty(1000, 333)).toBe(333);
  });
});

describe('impuestos y porcentajes', () => {
  it('aplica una tasa en puntos base', () => {
    expect(applyRate(10000, 1500)).toBe(1500); // 15 % de C$100.00
    expect(applyRate(3333, 1500)).toBe(500); // redondeo a centavo
  });

  it('convierte entre porcentaje y puntos base', () => {
    expect(percentToBasisPoints(15)).toBe(1500);
    expect(percentToBasisPoints(15.5)).toBe(1550);
    expect(basisPointsToPercent(1550)).toBe(15.5);
  });
});

describe('prorrateo proporcional', () => {
  it('reparte sin perder ni inventar centavos', () => {
    const parts = allocateProportionally(1000, [1, 1, 1]);
    expect(parts.reduce((acc, value) => acc + value, 0)).toBe(1000);
    expect(parts).toHaveLength(3);
  });

  it('respeta los pesos relativos', () => {
    const parts = allocateProportionally(1000, [3000, 1000]);
    expect(parts).toEqual([750, 250]);
  });

  it('asigna todo al primer elemento cuando no hay base', () => {
    expect(allocateProportionally(500, [0, 0])).toEqual([500, 0]);
  });

  it('reparte importes negativos correctamente', () => {
    const parts = allocateProportionally(-1000, [1, 1]);
    expect(parts.reduce((acc, value) => acc + value, 0)).toBe(-1000);
  });
});

describe('costo promedio ponderado', () => {
  it('calcula el promedio de dos lotes', () => {
    // 10 uds a C$100 + 10 uds a C$200 => C$150
    const result = weightedAverageCost(10000, 10000, 10000, 20000);
    expect(result).toBe(15000);
  });

  it('mantiene el costo cuando no entra mercadería', () => {
    expect(weightedAverageCost(10000, 12345, 0, 99999)).toBe(12345);
  });

  it('usa el costo entrante cuando no había existencias', () => {
    expect(weightedAverageCost(0, 0, 5000, 25000)).toBe(25000);
  });

  it('trata el stock negativo como cero', () => {
    expect(weightedAverageCost(-5000, 10000, 5000, 30000)).toBe(30000);
  });

  it('promedia proporcionalmente con lotes desiguales', () => {
    // 30 uds a C$10 + 10 uds a C$20 => C$12.50
    expect(weightedAverageCost(30000, 1000, 10000, 2000)).toBe(1250);
  });
});

describe('reversa del costo promedio ponderado', () => {
  it('deshace exactamente una compra que era el último movimiento', () => {
    // 10 uds a C$100, entra compra de 10 uds a C$200 => 20 uds a C$150.
    const blended = weightedAverageCost(10000, 10000, 10000, 20000);
    expect(blended).toBe(15000);
    // Al anular esa compra (quitar 10 uds al costo de compra C$200) vuelve a C$100.
    expect(reverseWeightedAverageCost(20000, blended, 10000, 20000)).toBe(10000);
  });

  it('des-mezcla usando el costo de compra, no el promedio vigente', () => {
    // 30 uds a C$10 + 10 uds a C$20 => C$12.50; al quitar las 10 uds a C$20
    // (su costo de compra) el promedio regresa a C$10, no a otro valor.
    const blended = weightedAverageCost(30000, 1000, 10000, 2000);
    expect(blended).toBe(1250);
    expect(reverseWeightedAverageCost(40000, blended, 10000, 2000)).toBe(1000);
  });

  it('mantiene el costo cuando no sale mercadería', () => {
    expect(reverseWeightedAverageCost(10000, 12345, 0, 99999)).toBe(12345);
  });

  it('reinicia a cero cuando no queda existencia', () => {
    expect(reverseWeightedAverageCost(10000, 15000, 10000, 20000)).toBe(0);
  });

  it('reinicia a cero si el valor restante fuese negativo por desfase', () => {
    // El costo de compra a retirar supera el valor total en libros.
    expect(reverseWeightedAverageCost(20000, 10000, 5000, 60000)).toBe(0);
  });
});

describe('formato', () => {
  it('formatea importes con la moneda de la organización', () => {
    const text = formatMoney(123456, 'NIO', 'es-NI');
    expect(text).toContain('1,234.56');
  });

  it('no falla con monedas desconocidas', () => {
    expect(formatMoney(1000, 'XYZ')).toContain('10.00');
  });
});

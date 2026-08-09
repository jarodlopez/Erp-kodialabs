import { describe, expect, it } from 'vitest';

import { AppError } from '@/lib/errors';
import { landedUnitCost, marginRate, priceDocument } from '@/lib/pricing';

const line = (overrides: Partial<Parameters<typeof priceDocument>[0][number]> = {}) => ({
  quantity: 1000,
  unitPrice: 10000,
  discount: 0,
  taxRate: 1500,
  unitCost: 6000,
  ...overrides,
});

describe('priceDocument — impuesto exclusivo', () => {
  it('suma el impuesto al subtotal', () => {
    const result = priceDocument([line()], { taxMode: 'EXCLUSIVE' });
    expect(result.totals.subtotal).toBe(10000);
    expect(result.totals.tax).toBe(1500);
    expect(result.totals.total).toBe(11500);
  });

  it('aplica descuentos de línea antes del impuesto', () => {
    const result = priceDocument([line({ discount: 2000 })], { taxMode: 'EXCLUSIVE' });
    expect(result.totals.subtotal).toBe(8000);
    expect(result.totals.tax).toBe(1200);
    expect(result.totals.total).toBe(9200);
  });

  it('prorratea el descuento global entre las líneas', () => {
    const result = priceDocument([line(), line({ unitPrice: 30000 })], {
      taxMode: 'EXCLUSIVE',
      globalDiscount: 4000,
    });

    // 10 000 y 30 000 => el descuento se reparte 25 % / 75 %.
    expect(result.lines[0].subtotal).toBe(9000);
    expect(result.lines[1].subtotal).toBe(27000);
    expect(result.totals.subtotal).toBe(36000);
    expect(result.totals.globalDiscount).toBe(4000);
  });

  it('la suma de impuestos de línea coincide con el impuesto total', () => {
    const result = priceDocument(
      [line({ unitPrice: 3333 }), line({ unitPrice: 6667 }), line({ unitPrice: 1 })],
      { taxMode: 'EXCLUSIVE' },
    );
    const sum = result.lines.reduce((acc, l) => acc + l.taxAmount, 0);
    expect(sum).toBe(result.totals.tax);
  });

  it('calcula el costo de venta y la utilidad bruta', () => {
    const result = priceDocument([line({ quantity: 2000 })], { taxMode: 'EXCLUSIVE' });
    expect(result.totals.costOfGoodsSold).toBe(12000);
    expect(result.totals.grossProfit).toBe(20000 - 12000);
  });
});

describe('priceDocument — impuesto inclusivo', () => {
  it('extrae el impuesto contenido en el precio', () => {
    const result = priceDocument([line({ unitPrice: 11500 })], { taxMode: 'INCLUSIVE' });
    expect(result.totals.subtotal).toBe(10000);
    expect(result.totals.tax).toBe(1500);
    expect(result.totals.total).toBe(11500);
  });

  it('mantiene el total exacto tras el desglose', () => {
    const result = priceDocument([line({ unitPrice: 999 })], { taxMode: 'INCLUSIVE' });
    expect(result.totals.subtotal + result.totals.tax).toBe(result.totals.total);
    expect(result.totals.total).toBe(999);
  });
});

describe('priceDocument — costos adicionales', () => {
  it('capitaliza flete y otros costos en el costo de los productos', () => {
    const result = priceDocument([line({ quantity: 2000 }), line({ quantity: 2000 })], {
      taxMode: 'EXCLUSIVE',
      additionalCosts: 2000,
    });

    // 2 líneas idénticas => 1 000 de costo adicional cada una.
    expect(result.lines[0].totalCost).toBe(12000 + 1000);
    expect(result.lines[1].totalCost).toBe(12000 + 1000);
    expect(result.totals.costOfGoodsSold).toBe(26000);
  });
});

describe('priceDocument — validaciones', () => {
  it('rechaza documentos sin líneas', () => {
    expect(() => priceDocument([], { taxMode: 'EXCLUSIVE' })).toThrow(AppError);
  });

  it('rechaza cantidades no positivas', () => {
    expect(() => priceDocument([line({ quantity: 0 })], { taxMode: 'EXCLUSIVE' })).toThrow(AppError);
  });

  it('rechaza descuentos mayores al importe de la línea', () => {
    expect(() => priceDocument([line({ discount: 20000 })], { taxMode: 'EXCLUSIVE' })).toThrow(
      AppError,
    );
  });

  it('rechaza un descuento global mayor al documento', () => {
    expect(() =>
      priceDocument([line()], { taxMode: 'EXCLUSIVE', globalDiscount: 999999 }),
    ).toThrow(AppError);
  });
});

describe('costo unitario final y margen', () => {
  it('calcula el costo unitario a partir del costo total', () => {
    // C$260.00 de costo total para 20 unidades => C$13.00 por unidad
    expect(landedUnitCost(26000, 20000)).toBe(1300);
  });

  it('devuelve cero si no hay cantidad', () => {
    expect(landedUnitCost(1000, 0)).toBe(0);
  });

  it('calcula el margen en puntos base', () => {
    expect(marginRate(10000, 6000)).toBe(4000); // 40 %
    expect(marginRate(0, 100)).toBe(0);
  });
});

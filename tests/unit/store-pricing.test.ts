import { describe, expect, it } from 'vitest';

import { buildSaleLines } from '@/lib/services/store-orders';
import { multiplyByQty, RATE_SCALE, toMinorUnits, toScaledQty } from '@/lib/money';
import { priceDocument } from '@/lib/pricing';
import type { TaxMode } from '@/types/organization';

/**
 * El invariante del módulo de tienda: la venta que genera un pedido aprobado
 * debe cerrar EXACTAMENTE en el importe que el comprador pagó.
 *
 * Es un punto delicado porque la tienda muestra precios finales y el ERP puede
 * facturar con el impuesto por fuera: hay que invertir la fórmula del impuesto
 * y absorber el redondeo. Con impuesto incluido la reconstrucción es exacta
 * siempre; con impuesto por fuera hay importes que ninguna base entera alcanza
 * (con 7 %, ninguna base da 69.93), y en esos huecos la venta queda a un
 * centavo por línea. Aquí se recorre una malla amplia de precios, cantidades y
 * tasas contra el motor de precios real para fijar ambos límites.
 */

interface Case {
  unitPrice: number;
  units: number;
  taxRate: number;
}

/** Reproduce lo que hace el servicio al aprobar: líneas → totales del ERP. */
function totalsFor(cases: Case[], discountAmount: number, taxMode: TaxMode) {
  const sources = cases.map((item, index) => ({
    productId: `p${index}`,
    scaledQty: toScaledQty(item.units),
    unitPrice: toMinorUnits(item.unitPrice),
    taxRate: item.taxRate,
  }));

  const lines = buildSaleLines(sources, discountAmount, taxMode);

  const priced = priceDocument(
    lines.map((line, index) => ({
      quantity: toScaledQty(line.quantity),
      unitPrice: toMinorUnits(line.unitPrice ?? 0),
      discount: toMinorUnits(line.discount ?? 0),
      taxRate: sources[index].taxRate,
      unitCost: 0,
    })),
    { taxMode },
  );

  const target =
    sources.reduce((acc, line) => acc + multiplyByQty(line.unitPrice, line.scaledQty), 0) -
    discountAmount;

  return { total: priced.totals.total, target, priced };
}

/**
 * `true` si existe una base entera cuyo importe con impuesto da exactamente
 * `target`. Con impuesto por fuera, la función `base -> base + round(base x
 * tasa)` salta enteros —con 7 %, ninguna base da 69.93— y esos huecos son
 * inevitables, no un defecto del cálculo.
 */
function isReachable(target: number, taxRate: number): boolean {
  if (taxRate <= 0) return true;
  const start = Math.round((target * RATE_SCALE) / (RATE_SCALE + taxRate));
  for (const base of [start - 2, start - 1, start, start + 1, start + 2]) {
    if (base <= 0) continue;
    if (base + Math.round((base * taxRate) / RATE_SCALE) === target) return true;
  }
  return false;
}

const TAX_RATES = [0, 700, 1500, 1800, 1900, 2100];
const QUANTITIES = [1, 2, 3, 7, 13];
const PRICES = [1, 9.99, 33.33, 150, 199.95, 1250];

describe('total de la venta generada por un pedido web', () => {
  it('con impuesto por fuera acierta siempre que el importe sea alcanzable', () => {
    let unreachable = 0;

    for (const taxRate of TAX_RATES) {
      for (const units of QUANTITIES) {
        for (const unitPrice of PRICES) {
          const { total, target } = totalsFor([{ unitPrice, units, taxRate }], 0, 'EXCLUSIVE');
          const label = `precio ${unitPrice} x ${units} al ${taxRate / 100} %`;

          if (isReachable(target, taxRate)) {
            // Si existe una base que reconstruye el importe, hay que dar con
            // ella: aquí no se admite ni un centavo de desvío.
            expect(total, label).toBe(target);
          } else {
            // Y si no existe, el desvío tiene que ser el mínimo posible.
            expect(Math.abs(total - target), label).toBe(1);
            unreachable += 1;
          }
        }
      }
    }

    // La malla incluye a propósito importes inalcanzables; si dejara de
    // haberlos, esta prueba estaría midiendo menos de lo que cree.
    expect(unreachable).toBeGreaterThan(0);
  });

  it('coincide al centavo con impuesto incluido en el precio', () => {
    for (const taxRate of TAX_RATES) {
      for (const units of QUANTITIES) {
        for (const unitPrice of PRICES) {
          const { total, target } = totalsFor([{ unitPrice, units, taxRate }], 0, 'INCLUSIVE');
          expect(total, `precio ${unitPrice} x ${units} al ${taxRate / 100} %`).toBe(target);
        }
      }
    }
  });

  it('el desvío no se acumula: sigue acotado por línea con varias líneas y cupón', () => {
    const cases: Case[] = [
      { unitPrice: 199.95, units: 3, taxRate: 1500 },
      { unitPrice: 33.33, units: 7, taxRate: 1500 },
      // El envío entra como línea de servicio sin impuesto.
      { unitPrice: 50, units: 1, taxRate: 0 },
    ];

    for (const discount of [0, 1, 550, 4237, 10000]) {
      const { total, target } = totalsFor(cases, discount, 'EXCLUSIVE');
      expect(Math.abs(total - target), `cupón de ${discount}`).toBeLessThanOrEqual(cases.length);
    }
  });

  it('deja el cupón visible como descuento en la venta, no escondido en el precio', () => {
    const { priced } = totalsFor(
      [{ unitPrice: 200, units: 2, taxRate: 1500 }],
      4000,
      'EXCLUSIVE',
    );

    // El descuento tiene que aparecer en el documento para que los reportes de
    // margen y de descuentos concedidos digan la verdad.
    expect(priced.totals.discount).toBeGreaterThan(0);
  });

  it('nunca produce descuentos negativos', () => {
    for (const taxRate of TAX_RATES) {
      for (const units of QUANTITIES) {
        const lines = buildSaleLines(
          [
            {
              productId: 'p0',
              scaledQty: toScaledQty(units),
              unitPrice: toMinorUnits(99.99),
              taxRate,
            },
          ],
          0,
          'EXCLUSIVE',
        );
        expect(lines[0].discount ?? 0).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

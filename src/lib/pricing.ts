/**
 * Cálculo de totales de documentos (ventas, compras y devoluciones).
 *
 * Módulo PURO: sin dependencias de Firebase ni de Next. Todo el cálculo
 * monetario del ERP pasa por aquí, lo que permite probarlo exhaustivamente y
 * garantizar que ventas, compras y reportes usen exactamente la misma
 * aritmética.
 *
 * Todos los importes están en centavos (enteros) y las cantidades escaladas
 * por `QTY_SCALE`.
 */
import {
  addMoney,
  allocateProportionally,
  applyRate,
  multiplyByQty,
  RATE_SCALE,
  roundHalfUp,
} from './money';
import { errors } from './errors';
import type { TaxMode } from '@/types/organization';

export interface PricedLineInput {
  /** Cantidad escalada por QTY_SCALE. */
  quantity: number;
  /** Precio o costo unitario en centavos. */
  unitPrice: number;
  /** Descuento de línea en centavos. */
  discount: number;
  /** Tasa de impuesto en puntos base. */
  taxRate: number;
  /** Costo unitario en centavos (solo ventas: congela el COGS). */
  unitCost?: number;
}

export interface PricedLine {
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  /** Base imponible de la línea tras descuentos (centavos). */
  subtotal: number;
  taxAmount: number;
  total: number;
  unitCost: number;
  totalCost: number;
}

export interface DocumentTotals {
  subtotal: number;
  lineDiscount: number;
  globalDiscount: number;
  discount: number;
  tax: number;
  total: number;
  costOfGoodsSold: number;
  grossProfit: number;
}

export interface PricingResult {
  lines: PricedLine[];
  totals: DocumentTotals;
}

export interface PricingOptions {
  /** `EXCLUSIVE`: el impuesto se suma. `INCLUSIVE`: ya está dentro del precio. */
  taxMode: TaxMode;
  /** Descuento global aplicado sobre el documento (centavos). */
  globalDiscount?: number;
  /** Costos adicionales a prorratear sobre las líneas (flete, otros). */
  additionalCosts?: number;
}

/**
 * Calcula las líneas y los totales de un documento.
 *
 * Orden de aplicación:
 *  1. Importe bruto de línea = precio unitario x cantidad.
 *  2. Descuento de línea.
 *  3. Descuento global, prorrateado proporcionalmente entre las líneas.
 *  4. Impuesto sobre la base ya descontada (o extraído del precio si el
 *     documento es `INCLUSIVE`).
 *
 * De esta forma la suma de los impuestos de línea coincide siempre con el
 * impuesto total del documento: no se pierden ni se inventan centavos.
 */
export function priceDocument(inputs: PricedLineInput[], options: PricingOptions): PricingResult {
  if (inputs.length === 0) {
    throw errors.validation('El documento debe tener al menos una línea.');
  }

  // 1 y 2: base de línea tras el descuento propio.
  const grossPerLine = inputs.map((line) => {
    if (line.quantity <= 0) {
      throw errors.validation('Todas las cantidades deben ser mayores que cero.');
    }
    if (line.unitPrice < 0) {
      throw errors.validation('Los precios no pueden ser negativos.');
    }
    const gross = multiplyByQty(line.unitPrice, line.quantity);
    if (line.discount < 0) {
      throw errors.validation('Los descuentos no pueden ser negativos.');
    }
    if (line.discount > gross) {
      throw errors.validation('El descuento de una línea no puede superar su importe.');
    }
    return gross - line.discount;
  });

  const baseSum = grossPerLine.reduce((acc, v) => acc + v, 0);
  const globalDiscount = Math.max(0, options.globalDiscount ?? 0);
  if (globalDiscount > baseSum) {
    throw errors.validation('El descuento global no puede superar el importe del documento.');
  }

  // 3: prorrateo del descuento global (y de los costos adicionales).
  const globalDiscountPerLine = allocateProportionally(globalDiscount, grossPerLine);
  const additionalCosts = Math.max(0, options.additionalCosts ?? 0);
  const additionalPerLine = allocateProportionally(additionalCosts, grossPerLine);

  const lines: PricedLine[] = inputs.map((line, index) => {
    const netBeforeTax = grossPerLine[index] - globalDiscountPerLine[index];

    let subtotal: number;
    let taxAmount: number;

    if (options.taxMode === 'INCLUSIVE' && line.taxRate > 0) {
      // El precio ya contiene el impuesto: se extrae la base imponible.
      subtotal = roundHalfUp((netBeforeTax * RATE_SCALE) / (RATE_SCALE + line.taxRate));
      taxAmount = netBeforeTax - subtotal;
    } else {
      subtotal = netBeforeTax;
      taxAmount = applyRate(netBeforeTax, line.taxRate);
    }

    const unitCost = line.unitCost ?? 0;
    // Los costos adicionales prorrateados se capitalizan en el costo unitario.
    const totalCost = multiplyByQty(unitCost, line.quantity) + additionalPerLine[index];

    return {
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount + globalDiscountPerLine[index],
      taxRate: line.taxRate,
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
      unitCost,
      totalCost,
    };
  });

  const subtotal = lines.reduce((acc, l) => acc + l.subtotal, 0);
  const tax = lines.reduce((acc, l) => acc + l.taxAmount, 0);
  const lineDiscount = inputs.reduce((acc, l) => acc + l.discount, 0);
  const costOfGoodsSold = lines.reduce((acc, l) => acc + l.totalCost, 0);
  const total = addMoney(subtotal, tax);

  return {
    lines,
    totals: {
      subtotal,
      lineDiscount,
      globalDiscount,
      discount: lineDiscount + globalDiscount,
      tax,
      total,
      costOfGoodsSold,
      grossProfit: subtotal - costOfGoodsSold,
    },
  };
}

/**
 * Costo unitario final tras prorratear flete y otros costos capitalizables.
 * Es el valor que alimenta el costo promedio ponderado del producto.
 */
export function landedUnitCost(totalCost: number, quantity: number): number {
  if (quantity <= 0) return 0;
  return roundHalfUp((totalCost * 1000) / quantity);
}

/** Margen bruto en puntos base sobre la venta neta. */
export function marginRate(revenue: number, cost: number): number {
  if (revenue <= 0) return 0;
  return roundHalfUp(((revenue - cost) * RATE_SCALE) / revenue);
}

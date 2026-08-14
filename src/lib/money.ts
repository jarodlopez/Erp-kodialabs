/**
 * Aritmética monetaria y de cantidades.
 *
 * REGLA FUNDAMENTAL DEL ERP
 * -------------------------
 * Nunca se usan `number` decimales para cálculos financieros. Todo importe
 * vive como ENTERO en la unidad mínima de la moneda (centavos):
 *
 *   C$ 100.00  ->  10000
 *   C$   0.05  ->      5
 *
 * Las cantidades de inventario se escalan por `QTY_SCALE` (3 decimales), de
 * modo que 1.5 unidades === 1500. Esto permite vender fracciones (kg, litros)
 * sin perder precisión.
 *
 * Todas las funciones de este módulo asumen y devuelven enteros. Cualquier
 * división redondea explícitamente con `bankersSafeRound` (half-up sobre el
 * valor absoluto, preservando el signo) para que el redondeo sea determinista
 * y simétrico.
 */

/** Número de decimales de la moneda (centavos). */
export const MONEY_DECIMALS = 2;
/** Factor de conversión entre unidad mayor y unidad mínima. */
export const MONEY_SCALE = 100;

/** Número de decimales soportados en cantidades de inventario. */
export const QTY_DECIMALS = 3;
/** Factor de escala para cantidades. */
export const QTY_SCALE = 1000;

/** Denominador usado para porcentajes (tasas). 1 punto base = 0.01 %. */
export const RATE_SCALE = 10000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} debe ser un entero seguro, se recibió: ${value}`);
  }
}

/**
 * Redondeo half-up simétrico respecto al cero.
 * round(2.5) === 3 y round(-2.5) === -3.
 */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Valor no finito en redondeo: ${value}`);
  }
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value));
}

/** Convierte una cantidad en unidad mayor (p. ej. 100.5) a centavos (10050). */
export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new MoneyError(`Importe no finito: ${amount}`);
  }
  return roundHalfUp(amount * MONEY_SCALE);
}

/** Convierte centavos (10050) a unidad mayor (100.5). Solo para presentación. */
export function toMajorUnits(minor: number): number {
  assertSafeInteger(minor, 'Importe');
  return minor / MONEY_SCALE;
}

/** Convierte una cantidad decimal (1.5) a cantidad escalada (1500). */
export function toScaledQty(qty: number): number {
  if (!Number.isFinite(qty)) {
    throw new MoneyError(`Cantidad no finita: ${qty}`);
  }
  return roundHalfUp(qty * QTY_SCALE);
}

/** Convierte una cantidad escalada (1500) a decimal (1.5). Solo presentación. */
export function fromScaledQty(qty: number): number {
  assertSafeInteger(qty, 'Cantidad');
  return qty / QTY_SCALE;
}

/** Suma de importes enteros. */
export function addMoney(...values: number[]): number {
  let total = 0;
  for (const v of values) {
    assertSafeInteger(v, 'Importe');
    total += v;
  }
  assertSafeInteger(total, 'Suma de importes');
  return total;
}

/** Resta `b` de `a`. */
export function subMoney(a: number, b: number): number {
  assertSafeInteger(a, 'Importe');
  assertSafeInteger(b, 'Importe');
  return a - b;
}

/**
 * Multiplica un precio unitario (centavos) por una cantidad escalada.
 * `unitPrice` está en centavos y `scaledQty` en milésimas de unidad, por lo
 * que el producto debe dividirse entre `QTY_SCALE` y redondearse.
 *
 *   multiplyByQty(1050, 3000) === 3150   // 3 uds. a C$10.50 => C$31.50
 */
export function multiplyByQty(unitPrice: number, scaledQty: number): number {
  assertSafeInteger(unitPrice, 'Precio unitario');
  assertSafeInteger(scaledQty, 'Cantidad');
  return roundHalfUp((unitPrice * scaledQty) / QTY_SCALE);
}

/**
 * Aplica una tasa expresada en puntos base (`RATE_SCALE`).
 * 15 % === 1500 puntos base.
 *
 *   applyRate(10000, 1500) === 1500   // IVA 15 % sobre C$100.00
 */
export function applyRate(amount: number, rateBasisPoints: number): number {
  assertSafeInteger(amount, 'Importe');
  assertSafeInteger(rateBasisPoints, 'Tasa');
  return roundHalfUp((amount * rateBasisPoints) / RATE_SCALE);
}

/** Convierte un porcentaje humano (15.5) a puntos base enteros (1550). */
export function percentToBasisPoints(percent: number): number {
  if (!Number.isFinite(percent)) {
    throw new MoneyError(`Porcentaje no finito: ${percent}`);
  }
  return roundHalfUp(percent * 100);
}

/** Convierte puntos base (1550) a porcentaje humano (15.5). */
export function basisPointsToPercent(bp: number): number {
  assertSafeInteger(bp, 'Puntos base');
  return bp / 100;
}

/**
 * Reparte proporcionalmente un importe entre varios pesos sin perder ni
 * inventar centavos: la suma del resultado es exactamente `amount`.
 * Se usa para prorratear descuentos globales, flete y otros costos.
 */
export function allocateProportionally(amount: number, weights: number[]): number[] {
  assertSafeInteger(amount, 'Importe a prorratear');
  if (weights.length === 0) return [];

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight <= 0) {
    // Sin base para prorratear: se asigna todo al primer elemento.
    return weights.map((_, i) => (i === 0 ? amount : 0));
  }

  const raw = weights.map((w) => (amount * w) / totalWeight);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = amount - floored.reduce((acc, v) => acc + v, 0);

  // Reparte el residuo a los elementos con mayor parte fraccionaria.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floored];
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    const target = order[cursor % order.length];
    result[target.i] += 1;
    remainder -= 1;
    cursor += 1;
  }
  while (remainder < 0 && order.length > 0) {
    const target = order[cursor % order.length];
    result[target.i] -= 1;
    remainder += 1;
    cursor += 1;
  }
  return result;
}

/**
 * Costo promedio ponderado (Weighted Average Cost).
 *
 *   nuevoCosto = (stockAnterior * costoAnterior + cantidad * costoCompra)
 *                / (stockAnterior + cantidad)
 *
 * `currentStock` y `incomingQty` son cantidades escaladas (QTY_SCALE);
 * `currentAvgCost` y `incomingUnitCost` son costos unitarios en centavos.
 * Devuelve el nuevo costo unitario promedio en centavos.
 */
export function weightedAverageCost(
  currentStock: number,
  currentAvgCost: number,
  incomingQty: number,
  incomingUnitCost: number,
): number {
  assertSafeInteger(currentStock, 'Stock actual');
  assertSafeInteger(currentAvgCost, 'Costo promedio actual');
  assertSafeInteger(incomingQty, 'Cantidad entrante');
  assertSafeInteger(incomingUnitCost, 'Costo unitario entrante');

  if (incomingQty <= 0) return currentAvgCost;

  // Stock negativo o cero: el costo promedio se reinicia al costo entrante.
  const effectiveStock = currentStock > 0 ? currentStock : 0;
  const totalQty = effectiveStock + incomingQty;
  if (totalQty <= 0) return incomingUnitCost;

  const currentValue = (effectiveStock * currentAvgCost) / QTY_SCALE;
  const incomingValue = (incomingQty * incomingUnitCost) / QTY_SCALE;
  const totalValue = currentValue + incomingValue;

  return roundHalfUp((totalValue * QTY_SCALE) / totalQty);
}

/**
 * Reversa del costo promedio ponderado: quita del inventario una entrada que
 * antes se promedió (una compra que se anula o se devuelve al proveedor),
 * devolviendo el costo promedio aproximado que había antes de esa entrada.
 *
 *   nuevoCosto = (stockActual * costoActual - cantidad * costoEntrada)
 *                / (stockActual - cantidad)
 *
 * A diferencia de una salida por venta —que no altera el promedio—, aquí se
 * retira el VALOR con el que la compra entró (su costo de compra), no al costo
 * promedio vigente; así el promedio se "des-mezcla" en vez de quedar
 * contaminado por una compra que ya no existe.
 *
 * Si los movimientos intercalados dejan el cálculo sin sentido (no queda
 * existencia, o el valor restante sería negativo) el promedio se reinicia a 0.
 * `currentStock` y `outgoingQty` son cantidades escaladas (QTY_SCALE);
 * los costos son unitarios en centavos.
 */
export function reverseWeightedAverageCost(
  currentStock: number,
  currentAvgCost: number,
  outgoingQty: number,
  outgoingUnitCost: number,
): number {
  assertSafeInteger(currentStock, 'Stock actual');
  assertSafeInteger(currentAvgCost, 'Costo promedio actual');
  assertSafeInteger(outgoingQty, 'Cantidad saliente');
  assertSafeInteger(outgoingUnitCost, 'Costo unitario saliente');

  if (outgoingQty <= 0) return currentAvgCost;

  const remainingQty = currentStock - outgoingQty;
  if (remainingQty <= 0) return 0;

  const currentValue = (currentStock * currentAvgCost) / QTY_SCALE;
  const outgoingValue = (outgoingQty * outgoingUnitCost) / QTY_SCALE;
  const remainingValue = currentValue - outgoingValue;
  if (remainingValue <= 0) return 0;

  return roundHalfUp((remainingValue * QTY_SCALE) / remainingQty);
}

/** Formatea un importe en centavos como texto legible. */
export function formatMoney(
  minor: number,
  currency = 'NIO',
  locale = 'es-NI',
): string {
  const major = toMajorUnits(minor);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: MONEY_DECIMALS,
      maximumFractionDigits: MONEY_DECIMALS,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(MONEY_DECIMALS)}`;
  }
}

/** Formatea una cantidad escalada eliminando decimales innecesarios. */
export function formatQty(scaled: number, locale = 'es-NI'): string {
  const value = fromScaledQty(scaled);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: QTY_DECIMALS,
  }).format(value);
}

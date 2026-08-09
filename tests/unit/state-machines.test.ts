import { describe, expect, it } from 'vitest';

import { AppError } from '@/lib/errors';
import {
  assertPurchaseTransition,
  assertSaleTransition,
  canTransitionSale,
  derivePaymentStatus,
  derivePurchaseStatus,
  deriveReceivableStatus,
  deriveSaleStatus,
} from '@/lib/state-machines';

describe('transiciones de venta', () => {
  it('permite confirmar un borrador', () => {
    expect(() => assertSaleTransition('DRAFT', 'CONFIRMED')).not.toThrow();
  });

  it('permite anular una venta confirmada', () => {
    expect(() => assertSaleTransition('CONFIRMED', 'CANCELLED')).not.toThrow();
  });

  it('impide reactivar una venta anulada', () => {
    expect(() => assertSaleTransition('CANCELLED', 'PAID')).toThrow(AppError);
    expect(canTransitionSale('CANCELLED', 'PAID')).toBe(false);
  });

  it('impide saltar de borrador a pagada', () => {
    expect(() => assertSaleTransition('DRAFT', 'PAID')).toThrow(AppError);
  });
});

describe('transiciones de compra', () => {
  it('permite recibir un borrador', () => {
    expect(() => assertPurchaseTransition('DRAFT', 'RECEIVED')).not.toThrow();
  });

  it('impide recibir dos veces la misma compra', () => {
    expect(() => assertPurchaseTransition('RECEIVED', 'RECEIVED')).toThrow(AppError);
  });

  it('impide operar sobre una compra anulada', () => {
    expect(() => assertPurchaseTransition('CANCELLED', 'PAID')).toThrow(AppError);
  });
});

describe('derivación del estado de pago', () => {
  it('marca pendiente cuando no hay cobros', () => {
    expect(derivePaymentStatus(10000, 0)).toBe('UNPAID');
  });

  it('marca parcial con cobro incompleto', () => {
    expect(derivePaymentStatus(10000, 4000)).toBe('PARTIAL');
  });

  it('marca pagado al cubrir el total', () => {
    expect(derivePaymentStatus(10000, 10000)).toBe('PAID');
    expect(derivePaymentStatus(10000, 12000)).toBe('PAID');
  });
});

describe('derivación del estado del documento', () => {
  it('conserva los estados terminales de una venta', () => {
    expect(deriveSaleStatus(10000, 10000, 'CANCELLED')).toBe('CANCELLED');
    expect(deriveSaleStatus(10000, 0, 'DRAFT')).toBe('DRAFT');
  });

  it('avanza de confirmada a parcial y a pagada', () => {
    expect(deriveSaleStatus(10000, 0, 'CONFIRMED')).toBe('CONFIRMED');
    expect(deriveSaleStatus(10000, 3000, 'CONFIRMED')).toBe('PARTIAL');
    expect(deriveSaleStatus(10000, 10000, 'CONFIRMED')).toBe('PAID');
  });

  it('hace lo propio con las compras', () => {
    expect(derivePurchaseStatus(5000, 0, 'RECEIVED')).toBe('RECEIVED');
    expect(derivePurchaseStatus(5000, 2000, 'RECEIVED')).toBe('PARTIAL');
    expect(derivePurchaseStatus(5000, 5000, 'RECEIVED')).toBe('PAID');
  });
});

describe('estado de cuentas por cobrar y pagar', () => {
  const reference = new Date('2026-06-15T00:00:00.000Z');

  it('marca pendiente si aún no vence', () => {
    expect(deriveReceivableStatus(10000, 0, '2026-07-01T00:00:00.000Z', reference)).toBe('PENDING');
  });

  it('marca vencida si pasó la fecha', () => {
    expect(deriveReceivableStatus(10000, 0, '2026-06-01T00:00:00.000Z', reference)).toBe('OVERDUE');
  });

  it('marca abonada si hay pagos parciales sin vencer', () => {
    expect(deriveReceivableStatus(10000, 4000, '2026-07-01T00:00:00.000Z', reference)).toBe(
      'PARTIAL',
    );
  });

  it('marca pagada aunque esté vencida', () => {
    expect(deriveReceivableStatus(10000, 10000, '2026-01-01T00:00:00.000Z', reference)).toBe('PAID');
  });
});

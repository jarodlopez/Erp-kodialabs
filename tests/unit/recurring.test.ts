import { describe, expect, it } from 'vitest';

import { nextRecurringDate } from '@/lib/services/expenses';

describe('nextRecurringDate — avance de fechas', () => {
  it('suma 7 días en frecuencia semanal', () => {
    expect(nextRecurringDate('2026-01-01T00:00:00.000Z', 'WEEKLY')).toBe(
      '2026-01-08T00:00:00.000Z',
    );
  });

  it('suma un mes calendario en frecuencia mensual', () => {
    expect(nextRecurringDate('2026-01-15T00:00:00.000Z', 'MONTHLY')).toBe(
      '2026-02-15T00:00:00.000Z',
    );
  });

  it('no desborda de mes: el 31 de enero mensual cae al 28 de febrero', () => {
    // Antes `setUTCMonth` producía el 3 de marzo (Feb 31 → Mar 3).
    expect(nextRecurringDate('2026-01-31T00:00:00.000Z', 'MONTHLY')).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('respeta el año bisiesto: el 31 de enero de 2028 cae al 29 de febrero', () => {
    expect(nextRecurringDate('2028-01-31T00:00:00.000Z', 'MONTHLY')).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });

  it('no desborda en frecuencia trimestral: 30 de noviembre + 3 meses = 28 de febrero', () => {
    expect(nextRecurringDate('2025-11-30T00:00:00.000Z', 'QUARTERLY')).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('suma un año en frecuencia anual', () => {
    expect(nextRecurringDate('2026-03-10T00:00:00.000Z', 'YEARLY')).toBe(
      '2027-03-10T00:00:00.000Z',
    );
  });
});

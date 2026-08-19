import { beforeEach, describe, expect, it } from 'vitest';

import { fakeDb } from '../helpers/fake-firestore';
import { ctx, ORG_ID, seedOrganization } from './fixtures';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppError } from '@/lib/errors';
import { saleService } from '@/lib/services/sales';
import type { AccountReceivable, FinancialAccount, Payment } from '@/types/finance';
import type { InventoryMovement } from '@/types/inventory';
import type { Product } from '@/types/catalog';
import type { Sale } from '@/types/sales';
import type { AuditLog } from '@/types/audit';

let ids: ReturnType<typeof seedOrganization>;

/** Fecha de hoy: las ventas a crédito calculan su vencimiento a partir de ella. */
const today = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  fakeDb.reset();
  ids = seedOrganization(fakeDb, { productCost: 100, productPrice: 200, initialStock: 50 });
});

describe('venta de contado confirmada', () => {
  it('descuenta inventario, cobra y deja auditoría en una sola operación', async () => {
    const result = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: '2026-02-01',
        type: 'CASH',
        items: [{ productId: ids.productId, quantity: 3 }],
        payment: { accountId: ids.accountId, amount: 690, method: 'CASH' },
      },
      { confirm: true },
    );

    // 3 x C$200 = C$600 + 15 % = C$690
    expect(result.total).toBe(69000);
    expect(result.status).toBe('PAID');
    expect(result.number).toMatch(/^SALE-\d{6}$/);

    const sale = fakeDb.all<Sale>(COLLECTIONS.SALES)[0];
    expect(sale.subtotal).toBe(60000);
    expect(sale.tax).toBe(9000);
    expect(sale.paidAmount).toBe(69000);
    expect(sale.dueAmount).toBe(0);
    expect(sale.costOfGoodsSold).toBe(30000); // 3 x C$100
    expect(sale.grossProfit).toBe(30000);

    // Inventario
    const product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.stock).toBe(47000); // 50 - 3, escalado

    const movements = fakeDb.all<InventoryMovement>(COLLECTIONS.INVENTORY_MOVEMENTS);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('SALE');
    expect(movements[0].previousStock).toBe(50000);
    expect(movements[0].newStock).toBe(47000);
    expect(movements[0].referenceNumber).toBe(sale.number);

    // Finanzas
    const account = fakeDb.all<FinancialAccount>(COLLECTIONS.FINANCIAL_ACCOUNTS)[0];
    expect(account.currentBalance).toBe(10000000 + 69000);

    const ledger = fakeDb.all(COLLECTIONS.FINANCIAL_TRANSACTIONS);
    expect(ledger).toHaveLength(1);

    const payments = fakeDb.all<Payment>(COLLECTIONS.PAYMENTS);
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(69000);

    // No hay cuenta por cobrar en una venta de contado.
    expect(fakeDb.all(COLLECTIONS.ACCOUNTS_RECEIVABLE)).toHaveLength(0);

    // Auditoría
    const logs = fakeDb.all<AuditLog>(COLLECTIONS.AUDIT_LOGS);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('CONFIRM');
    expect(logs[0].organizationId).toBe(ORG_ID);
  });

  it('rechaza una venta de contado sin cobro completo', async () => {
    await expect(
      saleService.createSale(
        ctx,
        {
          customerId: ids.customerId,
          date: '2026-02-01',
          type: 'CASH',
          items: [{ productId: ids.productId, quantity: 3 }],
          payment: { accountId: ids.accountId, amount: 100, method: 'CASH' },
        },
        { confirm: true },
      ),
    ).rejects.toThrow(AppError);
  });
});

describe('control de existencias', () => {
  it('impide vender más de lo disponible', async () => {
    await expect(
      saleService.createSale(
        ctx,
        {
          customerId: ids.customerId,
          date: '2026-02-01',
          type: 'CASH',
          items: [{ productId: ids.productId, quantity: 999 }],
          payment: { accountId: ids.accountId, amount: 1, method: 'CASH' },
        },
        { confirm: true },
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    // La transacción no debe dejar rastro alguno.
    expect(fakeDb.all(COLLECTIONS.SALES)).toHaveLength(0);
    expect(fakeDb.all(COLLECTIONS.INVENTORY_MOVEMENTS)).toHaveLength(0);
    const product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.stock).toBe(50000);
  });

  it('rechaza productos repetidos en la misma venta', async () => {
    await expect(
      saleService.createSale(
        ctx,
        {
          customerId: ids.customerId,
          date: '2026-02-01',
          type: 'CASH',
          items: [
            { productId: ids.productId, quantity: 1 },
            { productId: ids.productId, quantity: 2 },
          ],
        },
        { confirm: false },
      ),
    ).rejects.toThrow(AppError);
  });
});

describe('venta a crédito', () => {
  it('genera cuenta por cobrar y actualiza las métricas del cliente', async () => {
    const result = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 5 }],
      },
      { confirm: true },
    );

    expect(result.status).toBe('CONFIRMED');

    const receivables = fakeDb.all<AccountReceivable>(COLLECTIONS.ACCOUNTS_RECEIVABLE);
    expect(receivables).toHaveLength(1);
    expect(receivables[0].originalAmount).toBe(result.total);
    expect(receivables[0].remainingAmount).toBe(result.total);
    expect(receivables[0].status).toBe('PENDING');

    const customer = fakeDb.read(COLLECTIONS.CUSTOMERS, ids.customerId) as {
      stats: { outstandingBalance: number; documentCount: number; totalAmount: number };
    };
    expect(customer.stats.outstandingBalance).toBe(result.total);
    expect(customer.stats.documentCount).toBe(1);
  });

  it('exige cliente para vender a crédito', async () => {
    await expect(
      saleService.createSale(
        ctx,
        {
          customerId: null,
          date: '2026-02-01',
          type: 'CREDIT',
          items: [{ productId: ids.productId, quantity: 1 }],
        },
        { confirm: true },
      ),
    ).rejects.toThrow(AppError);
  });

  it('aplica abonos parciales y liquida la deuda', async () => {
    const sale = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 5 }],
      },
      { confirm: true },
    );

    // Primer abono parcial
    await saleService.registerPayment(
      ctx,
      sale.saleId,
      { accountId: ids.accountId, amount: 500, method: 'CASH', date: today },
      'pago-1',
    );

    let stored = fakeDb.read(COLLECTIONS.SALES, sale.saleId) as unknown as Sale;
    expect(stored.paidAmount).toBe(50000);
    expect(stored.paymentStatus).toBe('PARTIAL');
    expect(stored.status).toBe('PARTIAL');

    let receivable = fakeDb.all<AccountReceivable>(COLLECTIONS.ACCOUNTS_RECEIVABLE)[0];
    expect(receivable.paidAmount).toBe(50000);
    expect(receivable.status).toBe('PARTIAL');

    // Segundo abono: liquida el saldo
    const remaining = stored.dueAmount / 100;
    await saleService.registerPayment(
      ctx,
      sale.saleId,
      { accountId: ids.accountId, amount: remaining, method: 'CASH', date: today },
      'pago-2',
    );

    stored = fakeDb.read(COLLECTIONS.SALES, sale.saleId) as unknown as Sale;
    expect(stored.dueAmount).toBe(0);
    expect(stored.status).toBe('PAID');

    receivable = fakeDb.all<AccountReceivable>(COLLECTIONS.ACCOUNTS_RECEIVABLE)[0];
    expect(receivable.remainingAmount).toBe(0);
    expect(receivable.status).toBe('PAID');

    const customer = fakeDb.read(COLLECTIONS.CUSTOMERS, ids.customerId) as {
      stats: { outstandingBalance: number };
    };
    expect(customer.stats.outstandingBalance).toBe(0);
  });

  it('impide cobrar más que el saldo pendiente', async () => {
    const sale = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: '2026-02-01',
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 1 }],
      },
      { confirm: true },
    );

    await expect(
      saleService.registerPayment(
        ctx,
        sale.saleId,
        { accountId: ids.accountId, amount: 99999, method: 'CASH', date: '2026-02-05' },
        'pago-excesivo',
      ),
    ).rejects.toThrow(AppError);
  });
});

describe('idempotencia', () => {
  it('un doble envío con la misma clave no duplica la venta', async () => {
    const input = {
      customerId: ids.customerId,
      date: '2026-02-01',
      type: 'CASH' as const,
      items: [{ productId: ids.productId, quantity: 2 }],
      payment: { accountId: ids.accountId, amount: 460, method: 'CASH' },
    };

    const first = await saleService.createSale(ctx, input, {
      confirm: true,
      idempotencyKey: 'doble-click',
    });
    const second = await saleService.createSale(ctx, input, {
      confirm: true,
      idempotencyKey: 'doble-click',
    });

    expect(second.saleId).toBe(first.saleId);
    expect(fakeDb.all(COLLECTIONS.SALES)).toHaveLength(1);
    expect(fakeDb.all(COLLECTIONS.INVENTORY_MOVEMENTS)).toHaveLength(1);

    const product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.stock).toBe(48000);
  });

  it('claves distintas sí generan ventas distintas', async () => {
    const input = {
      customerId: ids.customerId,
      date: '2026-02-01',
      type: 'CASH' as const,
      items: [{ productId: ids.productId, quantity: 1 }],
      payment: { accountId: ids.accountId, amount: 230, method: 'CASH' },
    };

    await saleService.createSale(ctx, input, { confirm: true, idempotencyKey: 'a' });
    await saleService.createSale(ctx, input, { confirm: true, idempotencyKey: 'b' });

    expect(fakeDb.all(COLLECTIONS.SALES)).toHaveLength(2);
  });
});

describe('numeración correlativa', () => {
  it('genera números consecutivos sin repetirse', async () => {
    const numbers: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const sale = await saleService.createSale(
        ctx,
        {
          customerId: ids.customerId,
          date: '2026-02-01',
          type: 'CREDIT',
          items: [{ productId: ids.productId, quantity: 1 }],
        },
        { confirm: true, idempotencyKey: `venta-${i}` },
      );
      numbers.push(sale.number);
    }

    expect(numbers).toEqual(['SALE-000001', 'SALE-000002', 'SALE-000003', 'SALE-000004']);
    expect(new Set(numbers).size).toBe(4);
  });
});

describe('anulación de venta', () => {
  it('revierte inventario, cobros y cuenta por cobrar', async () => {
    const sale = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: '2026-02-01',
        type: 'CASH',
        items: [{ productId: ids.productId, quantity: 4 }],
        payment: { accountId: ids.accountId, amount: 920, method: 'CASH' },
      },
      { confirm: true },
    );

    const balanceAfterSale = fakeDb.all<FinancialAccount>(COLLECTIONS.FINANCIAL_ACCOUNTS)[0]
      .currentBalance;

    await saleService.cancelSale(ctx, sale.saleId, 'Error de digitación');

    const stored = fakeDb.read(COLLECTIONS.SALES, sale.saleId) as unknown as Sale;
    expect(stored.status).toBe('CANCELLED');
    expect(stored.cancelReason).toBe('Error de digitación');
    expect(stored.dueAmount).toBe(0);

    // El inventario vuelve a su nivel original.
    const product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.stock).toBe(50000);

    // El dinero cobrado se reversa.
    const account = fakeDb.all<FinancialAccount>(COLLECTIONS.FINANCIAL_ACCOUNTS)[0];
    expect(account.currentBalance).toBe(balanceAfterSale - 92000);

    // El pago original queda marcado como reversado.
    const payments = fakeDb.all<Payment>(COLLECTIONS.PAYMENTS);
    expect(payments[0].cancelledAt).not.toBeNull();

    // Se registra la auditoría de la anulación.
    const logs = fakeDb.all<AuditLog>(COLLECTIONS.AUDIT_LOGS);
    expect(logs.some((log) => log.action === 'CANCEL')).toBe(true);
  });

  it('no permite anular dos veces', async () => {
    const sale = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: '2026-02-01',
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 1 }],
      },
      { confirm: true },
    );

    await saleService.cancelSale(ctx, sale.saleId, 'Primera anulación');
    await expect(saleService.cancelSale(ctx, sale.saleId, 'Segunda')).rejects.toThrow(AppError);
  });
});

describe('aislamiento por organización', () => {
  it('no permite operar sobre datos de otra organización', async () => {
    const foreignCtx = { ...ctx, actor: { ...ctx.actor, organizationId: 'otra-org' } };

    await expect(
      saleService.createSale(
        foreignCtx,
        {
          customerId: ids.customerId,
          date: '2026-02-01',
          type: 'CREDIT',
          items: [{ productId: ids.productId, quantity: 1 }],
        },
        { confirm: true },
      ),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_MISMATCH' });
  });
});

describe('cobro del envío', () => {
  const delivery = {
    recipient: 'Doña Marta',
    address: 'De la rotonda 2c al sur, portón negro',
    phone: '88881234',
    notes: null,
  };

  /**
   * El envío no es un campo suelto del documento: entra como una LÍNEA de la
   * venta. Solo así el total coincide con lo que paga el cliente, el ingreso
   * por flete llega al estado de resultados y el impuesto se calcula sobre él
   * como sobre cualquier otra venta.
   */
  it('agrega el envío como una línea y lo suma al total', async () => {
    const result = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: '2026-02-01',
        type: 'CASH',
        items: [{ productId: ids.productId, quantity: 3 }],
        delivery,
        shippingCost: 50,
        payment: { accountId: ids.accountId, amount: 740, method: 'CASH' },
      },
      { confirm: true },
    );

    // 3 x C$200 = C$600 + 15 % = C$690, más C$50 de envío sin impuesto.
    expect(result.total).toBe(74000);

    const sale = fakeDb.all<Sale>(COLLECTIONS.SALES)[0];
    expect(sale.shippingCost).toBe(5000);
    expect(sale.subtotal).toBe(65000);
    // El impuesto NO cambia: el producto de envío nace exento a propósito,
    // porque el flete se grava distinto que la mercadería según el país.
    expect(sale.tax).toBe(9000);
    expect(sale.items).toHaveLength(2);

    const shippingLine = sale.items.find((item) => item.sku === 'ENVIO-WEB');
    expect(shippingLine).toBeDefined();
    expect(shippingLine?.unitPrice).toBe(5000);
  });

  it('crea el producto de envío una sola vez y lo reutiliza', async () => {
    for (const quantity of [1, 2]) {
      await saleService.createSale(
        ctx,
        {
          customerId: ids.customerId,
          date: '2026-02-01',
          type: 'CREDIT',
          items: [{ productId: ids.productId, quantity }],
          delivery,
          shippingCost: 30,
        },
        { confirm: true },
      );
    }

    const shippingProducts = fakeDb
      .all<Product>(COLLECTIONS.PRODUCTS)
      .filter((product) => product.sku === 'ENVIO-WEB');
    expect(shippingProducts).toHaveLength(1);

    // Es un servicio, no mercadería: si llevara inventario, cada envío
    // intentaría descontar existencias de algo que nunca se compra.
    expect(shippingProducts[0].tracksInventory).toBe(false);
    expect(shippingProducts[0].stock).toBe(0);
  });

  it('el envío no afecta el costo de venta ni inventa utilidad', async () => {
    await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: '2026-02-01',
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 1 }],
        delivery,
        shippingCost: 80,
      },
      { confirm: true },
    );

    const sale = fakeDb.all<Sale>(COLLECTIONS.SALES)[0];
    // Un solo producto vendido: el costo es el suyo, C$100. El envío no
    // agrega costo de mercadería porque no es mercadería.
    expect(sale.costOfGoodsSold).toBe(10000);

    // Solo se movió el producto real, no el servicio de envío.
    const movements = fakeDb.all<InventoryMovement>(COLLECTIONS.INVENTORY_MOVEMENTS);
    expect(movements).toHaveLength(1);
    expect(movements[0].productId).toBe(ids.productId);
  });

  it('rechaza cobrar un envío sin dirección a dónde llevarlo', async () => {
    await expect(
      saleService.createSale(
        ctx,
        {
          customerId: ids.customerId,
          date: '2026-02-01',
          type: 'CREDIT',
          items: [{ productId: ids.productId, quantity: 1 }],
          delivery: null,
          shippingCost: 50,
        },
        { confirm: true },
      ),
    ).rejects.toThrow(/dirección de entrega/);
  });

  it('una venta de mostrador no crea el producto de envío', async () => {
    await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: '2026-02-01',
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 1 }],
      },
      { confirm: true },
    );

    const sale = fakeDb.all<Sale>(COLLECTIONS.SALES)[0];
    expect(sale.shippingCost).toBe(0);
    expect(sale.items).toHaveLength(1);
    expect(
      fakeDb.all<Product>(COLLECTIONS.PRODUCTS).some((p) => p.sku === 'ENVIO-WEB'),
    ).toBe(false);
  });

  it('un envío en cero deja la entrega registrada sin cobrar nada', async () => {
    // Envío gratis: hay dirección, pero no hay línea ni cargo.
    const result = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: '2026-02-01',
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 1 }],
        delivery,
        shippingCost: 0,
      },
      { confirm: true },
    );

    expect(result.total).toBe(23000); // C$200 + 15 %
    const sale = fakeDb.all<Sale>(COLLECTIONS.SALES)[0];
    expect(sale.shippingCost).toBe(0);
    expect(sale.items).toHaveLength(1);
    expect(sale.delivery?.address).toBe(delivery.address);
  });
});

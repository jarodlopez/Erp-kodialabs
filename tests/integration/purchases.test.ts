import { beforeEach, describe, expect, it } from 'vitest';

import { fakeDb } from '../helpers/fake-firestore';
import { ctx, seedOrganization } from './fixtures';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppError } from '@/lib/errors';
import { purchaseService } from '@/lib/services/purchases';
import { returnService } from '@/lib/services/returns';
import { saleService } from '@/lib/services/sales';
import type { AccountPayable, FinancialAccount } from '@/types/finance';
import type { InventoryMovement } from '@/types/inventory';
import type { Product } from '@/types/catalog';
import type { Purchase } from '@/types/purchases';

let ids: ReturnType<typeof seedOrganization>;
const today = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  fakeDb.reset();
  ids = seedOrganization(fakeDb, { productCost: 100, productPrice: 200, initialStock: 0 });
});

describe('recepción de compra', () => {
  it('incrementa inventario y registra el movimiento', async () => {
    const purchase = await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 10, unitCost: 100 }],
      },
      { receive: true },
    );

    expect(purchase.number).toMatch(/^PUR-\d{6}$/);

    const product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.stock).toBe(10000);

    const movements = fakeDb.all<InventoryMovement>(COLLECTIONS.INVENTORY_MOVEMENTS);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('PURCHASE');
    expect(movements[0].newStock).toBe(10000);
  });

  it('calcula el costo promedio ponderado entre lotes', async () => {
    // Lote 1: 10 unidades a C$100
    await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 10, unitCost: 100 }],
      },
      { receive: true, idempotencyKey: 'lote-1' },
    );

    let product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.averageCost).toBe(10000);

    // Lote 2: 10 unidades a C$200 => promedio C$150
    await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 10, unitCost: 200 }],
      },
      { receive: true, idempotencyKey: 'lote-2' },
    );

    product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.stock).toBe(20000);
    expect(product.averageCost).toBe(15000);
    expect(product.cost).toBe(20000); // último costo de compra
  });

  it('capitaliza el flete en el costo promedio', async () => {
    // 10 unidades a C$100 + C$200 de flete => costo unitario C$120
    await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 10, unitCost: 100 }],
        shipping: 200,
      },
      { receive: true },
    );

    const product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.averageCost).toBe(12000);
  });

  it('genera cuenta por pagar cuando la compra es a crédito', async () => {
    const purchase = await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 5, unitCost: 100 }],
      },
      { receive: true },
    );

    const payables = fakeDb.all<AccountPayable>(COLLECTIONS.ACCOUNTS_PAYABLE);
    expect(payables).toHaveLength(1);
    expect(payables[0].remainingAmount).toBe(purchase.total);

    const supplier = fakeDb.read(COLLECTIONS.SUPPLIERS, ids.supplierId) as {
      stats: { outstandingBalance: number; documentCount: number };
    };
    expect(supplier.stats.outstandingBalance).toBe(purchase.total);
    expect(supplier.stats.documentCount).toBe(1);
  });

  it('no permite pagar más que el saldo pendiente', async () => {
    const purchase = await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 5, unitCost: 100 }],
      },
      { receive: true },
    );

    await expect(
      purchaseService.registerPayment(
        ctx,
        purchase.purchaseId,
        { accountId: ids.accountId, amount: 999999, method: 'CASH', date: today },
        'pago-excesivo',
      ),
    ).rejects.toThrow(AppError);
  });

  it('impide pagar si la cuenta no tiene saldo suficiente', async () => {
    fakeDb.write(COLLECTIONS.FINANCIAL_ACCOUNTS, ids.accountId, { currentBalance: 100 }, true);

    const purchase = await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 5, unitCost: 100 }],
      },
      { receive: true },
    );

    await expect(
      purchaseService.registerPayment(
        ctx,
        purchase.purchaseId,
        { accountId: ids.accountId, amount: 100, method: 'CASH', date: today },
        'pago-sin-fondos',
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });
});

describe('anulación de compra', () => {
  it('retira del inventario la mercadería recibida', async () => {
    const purchase = await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 8, unitCost: 100 }],
      },
      { receive: true },
    );

    await purchaseService.cancelPurchase(ctx, purchase.purchaseId, 'Mercadería no recibida');

    const product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.stock).toBe(0);

    const stored = fakeDb.read(COLLECTIONS.PURCHASES, purchase.purchaseId) as unknown as Purchase;
    expect(stored.status).toBe('CANCELLED');

    const payables = fakeDb.all<AccountPayable>(COLLECTIONS.ACCOUNTS_PAYABLE);
    expect(payables[0].status).toBe('CANCELLED');
  });

  it('restablece el costo promedio al anular el segundo lote', async () => {
    // Lote 1: 10 uds a C$100 => promedio C$100.
    await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 10, unitCost: 100 }],
      },
      { receive: true, idempotencyKey: 'wac-lote-1' },
    );

    // Lote 2: 10 uds a C$200 => promedio C$150.
    const lote2 = await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 10, unitCost: 200 }],
      },
      { receive: true, idempotencyKey: 'wac-lote-2' },
    );

    let product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.averageCost).toBe(15000);

    // Al anular el lote 2 el promedio debe volver a C$100 (antes quedaba en C$150).
    await purchaseService.cancelPurchase(ctx, lote2.purchaseId, 'Lote equivocado');

    product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.stock).toBe(10000);
    expect(product.averageCost).toBe(10000);
  });

  it('no permite anular si el inventario ya se vendió', async () => {
    const purchase = await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 5, unitCost: 100 }],
      },
      { receive: true },
    );

    await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 5 }],
      },
      { confirm: true },
    );

    await expect(
      purchaseService.cancelPurchase(ctx, purchase.purchaseId, 'Anulación tardía'),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });
});

describe('devoluciones', () => {
  beforeEach(async () => {
    await purchaseService.createPurchase(
      ctx,
      {
        supplierId: ids.supplierId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 20, unitCost: 100 }],
      },
      { receive: true, idempotencyKey: 'stock-inicial' },
    );
  });

  it('devuelve producto de una venta cobrada y reintegra el dinero', async () => {
    const sale = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: today,
        type: 'CASH',
        items: [{ productId: ids.productId, quantity: 4 }],
        payment: { accountId: ids.accountId, amount: 920, method: 'CASH' },
      },
      { confirm: true },
    );

    const stockAfterSale = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0].stock;
    const balanceAfterSale = fakeDb.all<FinancialAccount>(COLLECTIONS.FINANCIAL_ACCOUNTS)[0]
      .currentBalance;

    const doc = await returnService.createSaleReturn(
      ctx,
      {
        referenceId: sale.saleId,
        date: today,
        items: [{ productId: ids.productId, quantity: 2 }],
        refundMode: 'CASH_REFUND',
        accountId: ids.accountId,
        reason: 'Producto defectuoso',
      },
      'dev-1',
    );

    // La mitad de la venta: C$460 con impuesto incluido.
    expect(doc.total).toBe(46000);

    const product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.stock).toBe(stockAfterSale + 2000);

    const account = fakeDb.all<FinancialAccount>(COLLECTIONS.FINANCIAL_ACCOUNTS)[0];
    expect(account.currentBalance).toBe(balanceAfterSale - 46000);

    const movements = fakeDb
      .all<InventoryMovement>(COLLECTIONS.INVENTORY_MOVEMENTS)
      .filter((movement) => movement.type === 'SALE_RETURN');
    expect(movements).toHaveLength(1);
  });

  it('no permite devolver más de lo vendido', async () => {
    const sale = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: today,
        type: 'CASH',
        items: [{ productId: ids.productId, quantity: 2 }],
        payment: { accountId: ids.accountId, amount: 460, method: 'CASH' },
      },
      { confirm: true },
    );

    await expect(
      returnService.createSaleReturn(
        ctx,
        {
          referenceId: sale.saleId,
          date: today,
          items: [{ productId: ids.productId, quantity: 5 }],
          refundMode: 'CASH_REFUND',
          accountId: ids.accountId,
          reason: 'Intento inválido',
        },
        'dev-invalida',
      ),
    ).rejects.toThrow(AppError);
  });

  it('reduce la deuda cuando la devolución es con nota de crédito', async () => {
    const sale = await saleService.createSale(
      ctx,
      {
        customerId: ids.customerId,
        date: today,
        type: 'CREDIT',
        items: [{ productId: ids.productId, quantity: 4 }],
      },
      { confirm: true },
    );

    await returnService.createSaleReturn(
      ctx,
      {
        referenceId: sale.saleId,
        date: today,
        items: [{ productId: ids.productId, quantity: 1 }],
        refundMode: 'CREDIT_NOTE',
        reason: 'Producto sobrante',
      },
      'dev-credito',
    );

    const receivable = fakeDb.all<{ originalAmount: number; remainingAmount: number }>(
      COLLECTIONS.ACCOUNTS_RECEIVABLE,
    )[0];

    // La venta era de C$920; se devuelve C$230.
    expect(receivable.originalAmount).toBe(69000);
    expect(receivable.remainingAmount).toBe(69000);
  });
});

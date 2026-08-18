import { beforeEach, describe, expect, it } from 'vitest';

import { fakeDb } from '../helpers/fake-firestore';
import {
  ORG_ID,
  STORE_SLUG,
  ctx,
  seedDiscount,
  seedOrganization,
  seedStore,
} from './fixtures';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppError } from '@/lib/errors';
import { storeOrderService } from '@/lib/services/store-orders';
import type { Customer } from '@/types/parties';
import type { FinancialAccount, Payment } from '@/types/finance';
import type { Product } from '@/types/catalog';
import type { Sale } from '@/types/sales';
import type { StoreDiscount, StoreOrder } from '@/types/store';

/**
 * Pedidos de la tienda online.
 *
 * Lo que se prueba aquí es exactamente la frontera delicada del módulo: que un
 * pedido llegado de internet no pueda dictar precios, que no tumbe inventario
 * hasta que alguien lo apruebe, y que al aprobarlo la venta del ERP cuadre al
 * centavo con lo que el cliente pagó.
 */

let ids: ReturnType<typeof seedOrganization>;

/** Datos del comprador, iguales en todos los casos salvo que se diga otra cosa. */
const buyer = {
  customer: { name: 'Ana Pérez', phone: '8888-1234', email: 'ana@test.local', document: null },
  address: 'De la rotonda 2c al sur',
};

beforeEach(() => {
  fakeDb.reset();
  // Producto de C$200 con 15 % de impuesto y 50 unidades en bodega.
  ids = seedOrganization(fakeDb, { productCost: 100, productPrice: 200, initialStock: 50 });
});

describe('creación del pedido desde la tienda', () => {
  it('cotiza con el precio del catálogo, suma el envío y no toca inventario', async () => {
    seedStore(fakeDb, { shippingCost: 50 });

    const result = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 3 }],
    });

    // 3 x C$200 = C$600 de mercadería + C$50 de envío.
    expect(result.total).toBe(65000);
    expect(result.number).toMatch(/^WEB-\d{6}$/);

    const order = fakeDb.all<StoreOrder>(COLLECTIONS.STORE_ORDERS)[0];
    expect(order.status).toBe('PENDING');
    expect(order.subtotal).toBe(60000);
    expect(order.shippingCost).toBe(5000);
    expect(order.items[0].unitPrice).toBe(20000);
    expect(order.customer.phone).toBe('88881234');
    expect(order.saleId).toBeNull();

    // Lo esencial: un pedido pendiente no mueve nada del ERP.
    const product = fakeDb.all<Product>(COLLECTIONS.PRODUCTS)[0];
    expect(product.stock).toBe(50000);
    expect(fakeDb.all(COLLECTIONS.SALES)).toHaveLength(0);
    expect(fakeDb.all(COLLECTIONS.INVENTORY_MOVEMENTS)).toHaveLength(0);
    expect(fakeDb.all(COLLECTIONS.FINANCIAL_TRANSACTIONS)).toHaveLength(0);
  });

  it('aplica el precio de oferta de la ficha, no el del producto', async () => {
    seedStore(fakeDb, { shippingCost: 0, listingSalePrice: 150 });

    const result = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 2 }],
    });

    expect(result.total).toBe(30000); // 2 x C$150
  });

  it('rechaza un producto que no está publicado en la vitrina', async () => {
    seedStore(fakeDb, { productIds: ['prod-1'] });

    await expect(
      storeOrderService.createFromStorefront(STORE_SLUG, {
        ...buyer,
        items: [{ productId: 'prod-inexistente', quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('rechaza el pedido si no hay existencias suficientes', async () => {
    fakeDb.reset();
    ids = seedOrganization(fakeDb, { productCost: 100, productPrice: 200, initialStock: 2 });
    seedStore(fakeDb);

    await expect(
      storeOrderService.createFromStorefront(STORE_SLUG, {
        ...buyer,
        items: [{ productId: ids.productId, quantity: 5 }],
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    expect(fakeDb.all(COLLECTIONS.STORE_ORDERS)).toHaveLength(0);
  });

  it('no acepta pedidos de una tienda en borrador', async () => {
    seedStore(fakeDb, { status: 'DRAFT' });

    await expect(
      storeOrderService.createFromStorefront(STORE_SLUG, {
        ...buyer,
        items: [{ productId: ids.productId, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('aplica el cupón y consume un uso', async () => {
    seedStore(fakeDb, { shippingCost: 0 });
    const discount = seedDiscount(fakeDb, { value: 10, maxUses: 5 });

    const result = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 2 }],
      discountCode: discount.code,
    });

    // C$400 − 10 % = C$360
    expect(result.total).toBe(36000);

    const order = fakeDb.all<StoreOrder>(COLLECTIONS.STORE_ORDERS)[0];
    expect(order.discountCode).toBe('PROMO10');
    expect(order.discountAmount).toBe(4000);

    const stored = fakeDb.all<StoreDiscount>(COLLECTIONS.STORE_DISCOUNTS)[0];
    expect(stored.usedCount).toBe(1);
  });
});

describe('aprobación del pedido', () => {
  it('genera una venta confirmada cuyo total coincide con lo que pagó el cliente', async () => {
    seedStore(fakeDb, { shippingCost: 50 });

    const created = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 3 }],
    });

    const result = await storeOrderService.approve(ctx, created.orderId, {
      payment: { accountId: ids.accountId, method: 'TRANSFER', reference: 'TRX-1' },
    });

    const sale = fakeDb.all<Sale>(COLLECTIONS.SALES)[0];

    // La organización factura con impuesto por fuera, pero en la tienda el
    // precio mostrado es final: la venta debe cerrar en el mismo importe.
    expect(sale.total).toBe(created.total);
    expect(sale.status).toBe('PAID');
    expect(sale.tax).toBeGreaterThan(0);
    expect(result.saleNumber).toMatch(/^SALE-\d{6}$/);

    // Ahora sí se descontó el inventario del producto vendido.
    const product = fakeDb
      .all<Product>(COLLECTIONS.PRODUCTS)
      .find((item) => item.id === ids.productId);
    expect(product?.stock).toBe(47000);

    // El envío se facturó como una línea de servicio, no como un descuadre.
    expect(sale.items).toHaveLength(2);
    const shippingLine = sale.items.find((item) => item.sku === 'ENVIO-WEB');
    expect(shippingLine).toBeDefined();

    // El dinero entró a la cuenta elegida.
    const account = fakeDb
      .all<FinancialAccount>(COLLECTIONS.FINANCIAL_ACCOUNTS)
      .find((item) => item.id === ids.accountId);
    expect(account?.currentBalance).toBe(10000000 + created.total);

    const payments = fakeDb.all<Payment>(COLLECTIONS.PAYMENTS);
    expect(payments).toHaveLength(1);

    const order = fakeDb.all<StoreOrder>(COLLECTIONS.STORE_ORDERS)[0];
    expect(order.status).toBe('APPROVED');
    expect(order.saleId).toBe(sale.id);
    expect(order.saleNumber).toBe(sale.number);
  });

  it('crea el cliente a partir del teléfono y lo reutiliza en el siguiente pedido', async () => {
    seedStore(fakeDb, { shippingCost: 0 });

    const first = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 1 }],
    });
    await storeOrderService.approve(ctx, first.orderId, { payment: null });

    const created = fakeDb
      .all<Customer>(COLLECTIONS.CUSTOMERS)
      .filter((customer) => customer.phone === '88881234');
    expect(created).toHaveLength(1);
    expect(created[0].name).toBe('Ana Pérez');

    const second = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 1 }],
    });
    await storeOrderService.approve(ctx, second.orderId, { payment: null });

    expect(
      fakeDb.all<Customer>(COLLECTIONS.CUSTOMERS).filter((c) => c.phone === '88881234'),
    ).toHaveLength(1);
  });

  it('sin cuenta financiera deja la venta a crédito y su cuenta por cobrar', async () => {
    seedStore(fakeDb, { shippingCost: 0 });

    const created = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 1 }],
    });
    await storeOrderService.approve(ctx, created.orderId, { payment: null });

    const sale = fakeDb.all<Sale>(COLLECTIONS.SALES)[0];
    expect(sale.type).toBe('CREDIT');
    expect(sale.dueAmount).toBe(sale.total);
    expect(fakeDb.all(COLLECTIONS.ACCOUNTS_RECEIVABLE)).toHaveLength(1);
  });

  it('aprobar dos veces no duplica la venta', async () => {
    seedStore(fakeDb, { shippingCost: 0 });

    const created = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 2 }],
    });

    const first = await storeOrderService.approve(ctx, created.orderId, {
      payment: { accountId: ids.accountId, method: 'TRANSFER' },
    });

    // El segundo intento se rechaza por estado, no por doble escritura.
    await expect(
      storeOrderService.approve(ctx, created.orderId, {
        payment: { accountId: ids.accountId, method: 'TRANSFER' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    const sales = fakeDb.all<Sale>(COLLECTIONS.SALES);
    expect(sales).toHaveLength(1);
    expect(sales[0].id).toBe(first.saleId);

    const product = fakeDb
      .all<Product>(COLLECTIONS.PRODUCTS)
      .find((item) => item.id === ids.productId);
    expect(product?.stock).toBe(48000);
  });

  it('traslada el descuento del cupón a la venta', async () => {
    seedStore(fakeDb, { shippingCost: 0 });
    const discount = seedDiscount(fakeDb, { value: 10 });

    const created = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 2 }],
      discountCode: discount.code,
    });

    await storeOrderService.approve(ctx, created.orderId, {
      payment: { accountId: ids.accountId, method: 'TRANSFER' },
    });

    const sale = fakeDb.all<Sale>(COLLECTIONS.SALES)[0];
    expect(sale.total).toBe(created.total);
    expect(sale.discount).toBeGreaterThan(0);
  });
});

describe('rechazo del pedido', () => {
  it('no genera venta y devuelve el uso del cupón', async () => {
    seedStore(fakeDb, { shippingCost: 0 });
    const discount = seedDiscount(fakeDb, { value: 10, maxUses: 1 });

    const created = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 1 }],
      discountCode: discount.code,
    });

    expect(fakeDb.all<StoreDiscount>(COLLECTIONS.STORE_DISCOUNTS)[0].usedCount).toBe(1);

    await storeOrderService.resolveWithoutSale(
      ctx.actor,
      created.orderId,
      'REJECTED',
      'Pago no confirmado',
    );

    const order = fakeDb.all<StoreOrder>(COLLECTIONS.STORE_ORDERS)[0];
    expect(order.status).toBe('REJECTED');
    expect(order.resolutionNote).toBe('Pago no confirmado');
    expect(fakeDb.all(COLLECTIONS.SALES)).toHaveLength(0);

    // El cupón vuelve a estar disponible: nunca llegó a convertirse en venta.
    expect(fakeDb.all<StoreDiscount>(COLLECTIONS.STORE_DISCOUNTS)[0].usedCount).toBe(0);
  });

  it('exige un motivo', async () => {
    seedStore(fakeDb, { shippingCost: 0 });
    const created = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 1 }],
    });

    await expect(
      storeOrderService.resolveWithoutSale(ctx.actor, created.orderId, 'REJECTED', '  '),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('no permite rechazar un pedido ya aprobado', async () => {
    seedStore(fakeDb, { shippingCost: 0 });
    const created = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 1 }],
    });
    await storeOrderService.approve(ctx, created.orderId, { payment: null });

    await expect(
      storeOrderService.resolveWithoutSale(ctx.actor, created.orderId, 'CANCELLED', 'Ya no aplica'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });
});

describe('comprobante de pago', () => {
  it('se acepta mientras el pedido esté pendiente y se rechaza después', async () => {
    seedStore(fakeDb, { shippingCost: 0 });
    const created = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 1 }],
    });

    await storeOrderService.attachReceipt(
      STORE_SLUG,
      created.orderId,
      'https://i.ibb.co/abc/comprobante.png',
      'TRX-99',
    );

    let order = fakeDb.all<StoreOrder>(COLLECTIONS.STORE_ORDERS)[0];
    expect(order.receiptUrl).toBe('https://i.ibb.co/abc/comprobante.png');
    expect(order.paymentReference).toBe('TRX-99');

    await storeOrderService.approve(ctx, created.orderId, { payment: null });

    await expect(
      storeOrderService.attachReceipt(STORE_SLUG, created.orderId, 'https://i.ibb.co/x/y.png', null),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    order = fakeDb.all<StoreOrder>(COLLECTIONS.STORE_ORDERS)[0];
    expect(order.receiptUrl).toBe('https://i.ibb.co/abc/comprobante.png');
  });

  it('no acepta un pedido de otra tienda', async () => {
    seedStore(fakeDb, { shippingCost: 0 });
    const created = await storeOrderService.createFromStorefront(STORE_SLUG, {
      ...buyer,
      items: [{ productId: ids.productId, quantity: 1 }],
    });

    await expect(
      storeOrderService.requireReceivableOrder('otra-tienda', created.orderId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('aislamiento entre organizaciones', () => {
  it('la tienda solo ve productos de su propia organización', async () => {
    seedStore(fakeDb, { shippingCost: 0 });

    // Producto de otro comercio, con el mismo aspecto que uno propio.
    fakeDb.write(
      COLLECTIONS.PRODUCTS,
      'prod-ajeno',
      {
        id: 'prod-ajeno',
        organizationId: 'otra-org',
        sku: 'AJENO-1',
        name: 'Producto ajeno',
        searchName: 'producto ajeno',
        salePrice: 100,
        stock: 100000,
        status: 'ACTIVE',
        tracksInventory: true,
        taxRate: 0,
      },
      false,
    );

    await expect(
      storeOrderService.createFromStorefront(STORE_SLUG, {
        ...buyer,
        items: [{ productId: 'prod-ajeno', quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    expect(fakeDb.all<StoreOrder>(COLLECTIONS.STORE_ORDERS)).toHaveLength(0);
    expect(ORG_ID).not.toBe('otra-org');
  });
});

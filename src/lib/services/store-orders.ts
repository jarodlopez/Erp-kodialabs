import 'server-only';

/**
 * Pedidos de la tienda online.
 *
 * Es la única frontera del ERP que acepta escrituras SIN sesión, así que todo
 * lo que llega del navegador se trata como una sugerencia: del carrito solo se
 * respetan `productId` y cantidad. Precios, descuentos, envío y totales se
 * recalculan aquí contra el catálogo publicado, de modo que manipular el
 * `localStorage` de la tienda no cambia lo que se cobra.
 *
 * Un pedido NO toca inventario ni finanzas: nace en `PENDING` y espera
 * revisión. Al aprobarlo se genera una venta del ERP con `saleService`, que es
 * quien descuenta existencias, escribe el asiento y crea la cuenta por cobrar
 * dentro de una sola transacción.
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import {
  allocateProportionally,
  applyRate,
  fromScaledQty,
  multiplyByQty,
  QTY_SCALE,
  RATE_SCALE,
  roundHalfUp,
  toMajorUnits,
  toMinorUnits,
  toScaledQty,
} from '@/lib/money';
import { priceDocument } from '@/lib/pricing';
import { nowIso } from '@/lib/repositories/base';
import { productRepository } from '@/lib/repositories/catalog';
import { organizationRepository } from '@/lib/repositories/organization';
import { customerRepository } from '@/lib/repositories/parties';
import { newDoc, refs } from '@/lib/repositories/refs';
import {
  storeDiscountRepository,
  storeOrderRepository,
  storeSettingsRepository,
} from '@/lib/repositories/store';
import { audit } from './audit';
import { partyService } from './parties';
import { saleService, type SaleServiceContext } from './sales';
import {
  DEFAULT_STORE_ORDER_PREFIX,
  loadStorefrontCatalog,
  sellableIndex,
  storeService,
} from './store';
import { buildIdempotencyKey, reserveNumber, runTransaction } from './transaction';
import type { ActorContext, Id, Money } from '@/types/common';
import type { PaymentMethod } from '@/types/finance';
import type { TaxMode } from '@/types/organization';
import type { CreateSaleInput, SaleLineInput } from '@/types/sales';
import type {
  CreateStoreOrderInput,
  StoreDiscount,
  StoreOrder,
  StoreOrderItem,
} from '@/types/store';

/** Tope de líneas distintas por pedido: un carrito real nunca los supera. */
const MAX_ORDER_LINES = 50;

/** Tope de unidades por línea, para frenar pedidos absurdos automatizados. */
const MAX_LINE_QUANTITY = 500;

/** Pedidos pendientes que puede acumular un mismo teléfono. */
const MAX_PENDING_PER_PHONE = 5;

export interface CreateStoreOrderResult {
  orderId: Id;
  number: string;
  total: Money;
}

// ---------------------------------------------------------------------------
// Descuentos
// ---------------------------------------------------------------------------

function discountUnusable(discount: StoreDiscount, subtotal: Money): string | null {
  if (discount.status !== 'ACTIVE') return 'El cupón ya no está disponible.';
  if (discount.expiresAt && discount.expiresAt < nowIso()) return 'El cupón está vencido.';
  if (discount.maxUses > 0 && discount.usedCount >= discount.maxUses) {
    return 'El cupón alcanzó su límite de usos.';
  }
  if (discount.minimumPurchase > 0 && subtotal < discount.minimumPurchase) {
    return `El cupón aplica en compras desde ${toMajorUnits(discount.minimumPurchase)}.`;
  }
  return null;
}

/** Importe del cupón sobre un subtotal, acotado para no dejar el total en negativo. */
export function discountAmountFor(discount: StoreDiscount, subtotal: Money): Money {
  const raw =
    discount.kind === 'PERCENT'
      ? roundHalfUp((subtotal * discount.value) / RATE_SCALE)
      : discount.value;
  return Math.min(Math.max(raw, 0), subtotal);
}

// ---------------------------------------------------------------------------
// Conversión pedido → líneas de venta
// ---------------------------------------------------------------------------

/**
 * Base imponible que, al sumarle su impuesto, reconstruye lo que el cliente
 * pagó — o lo más cerca que la aritmética entera permite.
 *
 * En la tienda el precio mostrado es final. Si la organización factura con el
 * impuesto por fuera (`EXCLUSIVE`), hay que invertir la fórmula para obtener
 * la base. El detalle incómodo es que `base + round(base x tasa)` no cubre
 * todos los enteros: con 7 % de impuesto, por ejemplo, no existe base alguna
 * que dé 69.93 (6535 da 69.92 y 6536 da 69.94). Cuando el importe cae en uno
 * de esos huecos se elige la base que menos se aleja, y la venta queda a un
 * centavo del pedido. Es una consecuencia real de facturar con impuesto por
 * fuera un precio pensado como final, no un error de cálculo: por eso el
 * cobro se registra por el total de la VENTA y no por el del pedido.
 */
function taxableBaseFor(target: Money, taxRate: number, taxMode: TaxMode): Money {
  if (taxMode !== 'EXCLUSIVE' || taxRate <= 0 || target <= 0) return target;

  const start = roundHalfUp((target * RATE_SCALE) / (RATE_SCALE + taxRate));

  let best = start;
  let bestDistance = Number.POSITIVE_INFINITY;

  // El candidato exacto, si existe, está a un paso del valor teórico.
  for (const candidate of [start - 1, start, start + 1]) {
    if (candidate <= 0) continue;
    const distance = Math.abs(target - (candidate + applyRate(candidate, taxRate)));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      if (distance === 0) break;
    }
  }

  return best;
}

interface SaleLineSource {
  productId: Id;
  scaledQty: number;
  unitPrice: Money;
  taxRate: number;
}

/**
 * Convierte las líneas del pedido en líneas de venta.
 *
 * Dos cosas tienen que salir bien a la vez:
 *
 *  1. El total de la venta debe coincidir al centavo con lo que pagó el
 *     comprador, sin importar la tasa de impuesto ni la cantidad.
 *  2. El cupón debe seguir viéndose COMO descuento en la venta. Si se
 *     escondiera bajando el precio unitario, los reportes de descuentos
 *     concedidos quedarían en cero y el margen se leería mal.
 *
 * Por eso el precio unitario conserva el precio de lista (convertido a base
 * imponible) y todo lo demás —la parte del cupón que toca a la línea más el
 * ajuste de redondeo— viaja en el descuento de línea. El reparto del cupón
 * usa `allocateProportionally`, que garantiza que la suma de las partes sea
 * exactamente el descuento otorgado.
 */
export function buildSaleLines(
  sources: SaleLineSource[],
  discountAmount: Money,
  taxMode: TaxMode,
): SaleLineInput[] {
  const grossPerLine = sources.map((line) => multiplyByQty(line.unitPrice, line.scaledQty));
  const discountPerLine = allocateProportionally(discountAmount, grossPerLine);

  return sources.map((line, index) => {
    // Base imponible de la línea a precio de lista y con el cobro real.
    const listBase = taxableBaseFor(grossPerLine[index], line.taxRate, taxMode);
    const chargedBase = taxableBaseFor(
      grossPerLine[index] - discountPerLine[index],
      line.taxRate,
      taxMode,
    );

    // El precio unitario se redondea hacia arriba para que el descuento nunca
    // salga negativo cuando la cantidad no divide exacto al importe.
    const unitPrice = Math.ceil((listBase * QTY_SCALE) / line.scaledQty);
    const lineDiscount = multiplyByQty(unitPrice, line.scaledQty) - chargedBase;

    return {
      productId: line.productId,
      quantity: fromScaledQty(line.scaledQty),
      unitPrice: toMajorUnits(unitPrice),
      discount: toMajorUnits(Math.max(0, lineDiscount)),
    };
  });
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

export const storeOrderService = {
  /**
   * Registra un pedido llegado del sitio público. No requiere sesión: la
   * tienda se identifica por su slug y la organización se deduce de ahí.
   */
  async createFromStorefront(
    slug: string,
    input: CreateStoreOrderInput,
  ): Promise<CreateStoreOrderResult> {
    const settings = await storeSettingsRepository.findBySlug(slug);
    if (!settings) throw errors.notFound('Tienda');
    if (settings.status !== 'PUBLISHED') {
      throw errors.validation('Esta tienda no está recibiendo pedidos en este momento.');
    }

    const organizationId = settings.organizationId;

    if (input.items.length === 0) {
      throw errors.validation('Tu carrito está vacío.');
    }
    if (input.items.length > MAX_ORDER_LINES) {
      throw errors.validation('El pedido tiene demasiadas líneas distintas.');
    }

    const phone = input.customer.phone.replace(/[^0-9]/g, '');
    if (phone.length < 7) {
      throw errors.validation('Ingresa un número de teléfono válido para coordinar la entrega.');
    }

    // Freno simple contra el envío automatizado de pedidos falsos.
    const pendingFromPhone = await refs
      .storeOrders()
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'PENDING')
      .where('customer.phone', '==', phone)
      .count()
      .get();
    if (pendingFromPhone.data().count >= MAX_PENDING_PER_PHONE) {
      throw errors.validation(
        'Ya tienes varios pedidos pendientes de revisión. Espera a que los confirmemos.',
      );
    }

    const catalog = await loadStorefrontCatalog(organizationId);
    const sellable = sellableIndex(catalog);

    const seen = new Set<Id>();
    const items: StoreOrderItem[] = [];

    for (const line of input.items) {
      if (seen.has(line.productId)) {
        throw errors.validation('Hay productos repetidos en el carrito.');
      }
      seen.add(line.productId);

      const entry = sellable.get(line.productId);
      if (!entry) {
        throw errors.validation('Uno de los productos ya no está disponible en la tienda.');
      }

      const quantity = Math.trunc(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw errors.validation(`La cantidad de "${entry.product.title}" no es válida.`);
      }
      if (quantity > MAX_LINE_QUANTITY) {
        throw errors.validation(
          `No se pueden pedir más de ${MAX_LINE_QUANTITY} unidades de "${entry.product.title}" por la web.`,
        );
      }

      const scaledQty = toScaledQty(quantity);

      // En la web nunca se sobrevende: el cliente ya vio la disponibilidad en
      // la vitrina y no hay un vendedor que pueda resolver un faltante.
      if (!entry.option.available || entry.option.stock < scaledQty) {
        throw errors.insufficientStock(
          `Nos quedamos sin existencias de "${entry.product.title}"${
            entry.option.label !== 'ÚNICA' ? ` (${entry.option.label})` : ''
          }.`,
        );
      }

      items.push({
        productId: entry.option.productId,
        sku: entry.option.sku,
        name: entry.product.title,
        variantLabel: entry.option.label === 'ÚNICA' ? null : entry.option.label,
        quantity: scaledQty,
        unitPrice: entry.option.price,
        total: multiplyByQty(entry.option.price, scaledQty),
        imageUrl: entry.product.images[0] ?? null,
      });
    }

    const subtotal = items.reduce((acc, item) => acc + item.total, 0);
    if (subtotal <= 0) {
      throw errors.validation('El pedido no tiene importe a cobrar.');
    }

    const zone = input.shippingZoneId
      ? settings.shippingZones.find((z) => z.id === input.shippingZoneId)
      : settings.shippingZones[0];
    if (settings.shippingZones.length > 0 && !zone) {
      throw errors.validation('Elige una zona de envío válida.');
    }
    const shippingCost = zone?.cost ?? 0;

    // El cupón se valida y se consume dentro de la transacción, para que dos
    // pedidos simultáneos no puedan pasarse del límite de usos.
    const requestedCode = input.discountCode?.trim().toUpperCase() || null;
    let discount: StoreDiscount | null = null;
    if (requestedCode) {
      if (!settings.features.discounts) {
        throw errors.validation('Esta tienda no acepta cupones.');
      }
      discount = await storeDiscountRepository.findByCode(organizationId, requestedCode);
      if (!discount) throw errors.validation('El cupón no existe.');
      const problem = discountUnusable(discount, subtotal);
      if (problem) throw errors.validation(problem);
    }

    const erpSettings = await organizationRepository.getSettings(organizationId);
    const prefix = erpSettings.numbering.storeOrder || DEFAULT_STORE_ORDER_PREFIX;

    const ref = newDoc(COLLECTIONS.STORE_ORDERS);
    const discountId = discount?.id ?? null;

    const order = await runTransaction(async (tx) => {
      // Fase de lectura.
      const numbering = await reserveNumber(tx, organizationId, 'storeOrder', prefix);
      const discountSnap = discountId ? await tx.get(refs.storeDiscount(discountId)) : null;

      let discountAmount = 0;
      let discountCode: string | null = null;

      if (discountSnap) {
        const fresh = discountSnap.exists
          ? ({ ...(discountSnap.data() as StoreDiscount), id: discountSnap.id })
          : null;
        if (!fresh || fresh.organizationId !== organizationId) {
          throw errors.validation('El cupón no existe.');
        }
        const problem = discountUnusable(fresh, subtotal);
        if (problem) throw errors.validation(problem);
        discountAmount = discountAmountFor(fresh, subtotal);
        discountCode = fresh.code;
      }

      const total = subtotal - discountAmount + shippingCost;

      const document: StoreOrder = {
        id: ref.id,
        organizationId,
        number: numbering.number,
        status: 'PENDING',
        customer: {
          name: input.customer.name.trim(),
          phone,
          email: input.customer.email?.trim().toLowerCase() || null,
          document: input.customer.document?.trim() || null,
        },
        delivery: {
          recipient: input.customer.name.trim(),
          address: input.address.trim(),
          phone,
          notes: input.addressNotes?.trim() || null,
        },
        shippingZoneId: zone?.id ?? null,
        shippingZoneLabel: zone?.label ?? null,
        shippingCost,
        items,
        subtotal,
        discountCode,
        discountAmount,
        total,
        receiptUrl: null,
        paymentReference: null,
        notes: input.notes?.trim() || null,
        saleId: null,
        saleNumber: null,
        reviewedAt: null,
        reviewedBy: null,
        resolutionNote: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        // El pedido lo crea el propio comprador, que no es usuario del ERP.
        createdBy: 'storefront',
        updatedBy: 'storefront',
      };

      // Fase de escritura.
      numbering.commit();
      tx.create(ref, document);
      if (discountSnap && discountAmount > 0) {
        tx.set(
          refs.storeDiscount(discountSnap.id),
          { usedCount: (discountSnap.data() as StoreDiscount).usedCount + 1 },
          { merge: true },
        );
      }

      return document;
    });

    return { orderId: order.id, number: order.number, total: order.total };
  },

  /**
   * Comprueba que un pedido de esa tienda siga admitiendo comprobante. Se
   * llama ANTES de subir el archivo: así una petición con un pedido inventado
   * se rechaza sin haber gastado un byte de la cuota de imágenes.
   */
  async requireReceivableOrder(slug: string, orderId: Id): Promise<StoreOrder> {
    const settings = await storeSettingsRepository.findBySlug(slug);
    if (!settings) throw errors.notFound('Tienda');

    const order = await storeOrderRepository.get(settings.organizationId, orderId);
    if (!order) throw errors.notFound('Pedido');
    if (order.status !== 'PENDING') {
      throw errors.invalidTransition('Este pedido ya fue revisado.');
    }
    return order;
  },

  /**
   * Adjunta el comprobante de pago que sube el comprador tras hacer el pedido.
   * Solo se acepta mientras el pedido siga pendiente.
   */
  async attachReceipt(
    slug: string,
    orderId: Id,
    receiptUrl: string,
    reference: string | null,
  ): Promise<void> {
    await storeOrderService.requireReceivableOrder(slug, orderId);

    await refs.storeOrder(orderId).set(
      {
        receiptUrl,
        paymentReference: reference?.trim() || null,
        updatedAt: nowIso(),
      },
      { merge: true },
    );
  },

  /**
   * Aprueba un pedido y lo convierte en una venta del ERP.
   *
   * La venta se crea confirmada, con lo que descuenta inventario, escribe el
   * asiento en el libro mayor y genera la cuenta por cobrar en una sola
   * transacción. La clave de idempotencia se deriva del pedido, así que un
   * doble clic —o un reintento tras un corte de red— devuelve la misma venta
   * en lugar de duplicarla.
   */
  async approve(
    ctx: SaleServiceContext,
    orderId: Id,
    options: ApproveStoreOrderOptions,
  ): Promise<{ saleId: Id; saleNumber: string; total: Money }> {
    const organizationId = ctx.actor.organizationId;
    const order = await storeOrderRepository.require(organizationId, orderId);

    if (order.status !== 'PENDING') {
      throw errors.invalidTransition(
        `El pedido ${order.number} ya fue ${
          order.status === 'APPROVED' ? 'aprobado' : 'resuelto'
        }.`,
      );
    }

    const settings = await storeSettingsRepository.require(organizationId);

    const customerId = await resolveCustomer(ctx.actor, order);

    const products = await productRepository.listByIds(
      organizationId,
      order.items.map((item) => item.productId),
    );
    const taxRateByProduct = new Map(products.map((p) => [p.id, p.taxRate ?? 0]));

    const sources = order.items.map((item) => ({
      productId: item.productId,
      scaledQty: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: taxRateByProduct.get(item.productId) ?? 0,
    }));

    // El envío entra como una línea más, con el producto de servicio de la
    // tienda: así el ingreso por envío queda contabilizado y el total de la
    // venta coincide con lo que el cliente pagó.
    if (order.shippingCost > 0) {
      const shippingProductId = await storeService.ensureShippingProduct(ctx.actor, settings);
      sources.push({
        productId: shippingProductId,
        scaledQty: toScaledQty(1),
        unitPrice: order.shippingCost,
        taxRate: taxRateByProduct.get(shippingProductId) ?? 0,
      });
    }

    const items = buildSaleLines(sources, order.discountAmount, ctx.settings.taxMode);

    // El cobro se registra por el total de la VENTA, que puede diferir del
    // total del pedido en un centavo por línea cuando el impuesto va por
    // fuera (ver `taxableBaseFor`). Cobrar el total del pedido haría que el
    // ERP rechazara el pago por exceder el documento.
    const saleTotal = priceDocument(
      items.map((line, index) => ({
        quantity: toScaledQty(line.quantity),
        unitPrice: toMinorUnits(line.unitPrice ?? 0),
        discount: toMinorUnits(line.discount ?? 0),
        taxRate: sources[index].taxRate,
      })),
      { taxMode: ctx.settings.taxMode },
    ).totals.total;

    const saleInput: CreateSaleInput = {
      customerId,
      date: options.date ?? nowIso(),
      items,
      type: options.payment ? 'CASH' : 'CREDIT',
      notes: `Pedido web ${order.number}${order.notes ? ` · ${order.notes}` : ''}`,
      warehouseId: settings.warehouseId ?? ctx.defaultWarehouseId,
      delivery: order.delivery,
      payment: options.payment
        ? {
            accountId: options.payment.accountId,
            amount: toMajorUnits(saleTotal),
            method: options.payment.method,
            reference: options.payment.reference ?? order.paymentReference ?? order.number,
          }
        : null,
    };

    const result = await saleService.createSale(ctx, saleInput, {
      confirm: true,
      idempotencyKey: buildIdempotencyKey(['storeOrder', order.id, 'approve']),
    });

    await refs.storeOrder(order.id).set(
      {
        status: 'APPROVED',
        saleId: result.saleId,
        saleNumber: result.number,
        reviewedAt: nowIso(),
        reviewedBy: ctx.actor.userId,
        resolutionNote: options.note?.trim() || null,
        updatedAt: nowIso(),
        updatedBy: ctx.actor.userId,
      },
      { merge: true },
    );

    await audit(ctx.actor, {
      action: 'CONFIRM',
      module: 'STORE',
      entityType: 'storeOrder',
      entityId: order.id,
      entityLabel: order.number,
      before: { status: 'PENDING' },
      after: { status: 'APPROVED', saleId: result.saleId, saleNumber: result.number },
    });

    return { saleId: result.saleId, saleNumber: result.number, total: result.total };
  },

  /**
   * Rechaza o anula un pedido pendiente. Devuelve el uso del cupón, porque el
   * pedido nunca llegó a convertirse en venta.
   */
  async resolveWithoutSale(
    actor: ActorContext,
    orderId: Id,
    status: 'REJECTED' | 'CANCELLED',
    note: string,
  ): Promise<void> {
    const order = await storeOrderRepository.require(actor.organizationId, orderId);

    if (order.status !== 'PENDING') {
      throw errors.invalidTransition('Solo se pueden resolver pedidos pendientes.');
    }
    if (!note.trim()) {
      throw errors.validation('Explica por qué se rechaza el pedido.');
    }

    // El cupón se localiza fuera de la transacción; dentro solo se lee su
    // documento con `tx.get`, que es lo que Firestore exige para escribirlo.
    const usedDiscount =
      order.discountCode && order.discountAmount > 0
        ? await storeDiscountRepository.findByCode(actor.organizationId, order.discountCode)
        : null;

    await runTransaction(async (tx) => {
      const discountSnap = usedDiscount ? await tx.get(refs.storeDiscount(usedDiscount.id)) : null;

      tx.set(
        refs.storeOrder(orderId),
        {
          status,
          reviewedAt: nowIso(),
          reviewedBy: actor.userId,
          resolutionNote: note.trim(),
          updatedAt: nowIso(),
          updatedBy: actor.userId,
        },
        { merge: true },
      );

      if (discountSnap?.exists) {
        const current = (discountSnap.data() as StoreDiscount).usedCount ?? 0;
        tx.set(discountSnap.ref, { usedCount: Math.max(0, current - 1) }, { merge: true });
      }
    });

    await audit(actor, {
      action: 'CANCEL',
      module: 'STORE',
      entityType: 'storeOrder',
      entityId: orderId,
      entityLabel: order.number,
      before: { status: 'PENDING' },
      after: { status, note: note.trim() },
    });
  },
};

export interface ApproveStoreOrderOptions {
  /** Cuenta donde entra el dinero. Sin ella la venta queda a crédito (CxC). */
  payment?: {
    accountId: Id;
    method: PaymentMethod;
    reference?: string | null;
  } | null;
  date?: string;
  note?: string | null;
}

/**
 * Busca al cliente por teléfono y lo crea si es su primera compra, de modo que
 * los pedidos web alimenten la misma ficha de cliente que las ventas de
 * mostrador (historial, crédito y cuentas por cobrar).
 */
async function resolveCustomer(actor: ActorContext, order: StoreOrder): Promise<Id> {
  const existing = await customerRepository.findByPhone(actor.organizationId, order.customer.phone);
  if (existing) return existing.id;

  return partyService.createCustomer(actor, {
    name: order.customer.name,
    phone: order.customer.phone,
    email: order.customer.email,
    address: order.delivery.address,
    document: order.customer.document,
    notes: `Cliente creado desde la tienda online (pedido ${order.number}).`,
  });
}

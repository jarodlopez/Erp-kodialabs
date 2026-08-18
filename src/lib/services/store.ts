import 'server-only';

/**
 * Servicio de la tienda online.
 *
 * Se ocupa de lo que es propio del canal web —identidad, vitrina, cupones,
 * pop-ups— y de resolver el catálogo público. Nunca duplica catálogo ni
 * existencias: una ficha de vitrina apunta a productos reales del ERP y el
 * precio y el stock que ve el cliente se leen de `products` en cada visita.
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { toMinorUnits } from '@/lib/money';
import { normalizeSearch, nowIso } from '@/lib/repositories/base';
import { categoryRepository, productRepository } from '@/lib/repositories/catalog';
import { organizationRepository, warehouseRepository } from '@/lib/repositories/organization';
import { newDoc, refs } from '@/lib/repositories/refs';
import {
  listingSearchTitle,
  storeBannerRepository,
  storeDiscountRepository,
  storeListingRepository,
  storeSettingsRepository,
} from '@/lib/repositories/store';
import { audit } from './audit';
import { catalogService } from './catalog';
import type { ActorContext, Id, Money } from '@/types/common';
import type { Product } from '@/types/catalog';
import type {
  StoreBanner,
  StoreDiscount,
  StoreListing,
  StoreSettings,
  StorefrontOption,
  StorefrontProduct,
} from '@/types/store';
import { DEFAULT_STORE_FEATURES } from '@/types/store';

/** SKU del producto de servicio con el que se factura el envío en la venta. */
const SHIPPING_SKU = 'ENVIO-WEB';

export const DEFAULT_STORE_ORDER_PREFIX = 'WEB';

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

/** Convierte un nombre en un slug apto para URL. */
export function toSlug(value: string): string {
  return normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'login',
  'registro',
  'suscripcion',
  't',
  'tienda',
]);

async function assertSlugAvailable(slug: string, organizationId: Id): Promise<void> {
  if (slug.length < 3) {
    throw errors.validation('La dirección de la tienda debe tener al menos 3 caracteres.');
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw errors.validation(`"${slug}" es una dirección reservada. Elige otra.`);
  }
  if (await storeSettingsRepository.slugTaken(slug, organizationId)) {
    throw errors.conflict(`La dirección "${slug}" ya está en uso por otra tienda.`);
  }
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export interface StoreSettingsInput {
  slug: string;
  status: 'DRAFT' | 'PUBLISHED';
  branding: StoreSettings['branding'];
  features: StoreSettings['features'];
  heroSlides: StoreSettings['heroSlides'];
  shippingZones: { id?: string | null; label: string; cost: number }[];
  paymentInstructions: { id?: string | null; label: string; detail: string; notes?: string | null }[];
  seoDescription?: string | null;
  warehouseId?: Id | null;
  defaultAccountId?: Id | null;
}

function randomId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

export const storeService = {
  /**
   * Devuelve la configuración de la tienda, creándola con valores neutros la
   * primera vez que se entra al módulo. Nace en BORRADOR: nadie puede llegar
   * a una tienda a medio configurar.
   */
  async ensureSettings(actor: ActorContext): Promise<StoreSettings> {
    const existing = await storeSettingsRepository.get(actor.organizationId);
    if (existing) return existing;

    const organization = await organizationRepository.require(actor.organizationId);

    let slug = toSlug(organization.name) || `tienda-${actor.organizationId.slice(0, 6)}`;
    if (await storeSettingsRepository.slugTaken(slug, actor.organizationId)) {
      slug = `${slug}-${actor.organizationId.slice(0, 4).toLowerCase()}`;
    }

    const warehouse = await warehouseRepository.getDefault(actor.organizationId);

    const settings: StoreSettings = {
      id: actor.organizationId,
      organizationId: actor.organizationId,
      slug,
      status: 'DRAFT',
      branding: {
        name: organization.name,
        logoUrl: organization.logoUrl ?? null,
        accentColor: '#111111',
        marqueeText: null,
        whatsapp: organization.phone ?? null,
        currencySymbol: 'C$',
        variantLabel: 'PRESENTACIÓN',
        cartTitle: 'TU CARRITO',
      },
      features: { ...DEFAULT_STORE_FEATURES },
      heroSlides: [],
      shippingZones: [{ id: 'local', label: 'Entrega local', cost: 0 }],
      paymentInstructions: [],
      seoDescription: null,
      shippingProductId: null,
      warehouseId: warehouse.id,
      defaultAccountId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      updatedBy: actor.userId,
    };

    await storeSettingsRepository.save(settings);
    await audit(actor, {
      action: 'CREATE',
      module: 'STORE',
      entityType: 'storeSettings',
      entityId: actor.organizationId,
      entityLabel: settings.branding.name,
      after: { slug, status: settings.status },
    });

    return settings;
  },

  async updateSettings(actor: ActorContext, input: StoreSettingsInput): Promise<void> {
    const current = await storeService.ensureSettings(actor);
    const slug = toSlug(input.slug);
    if (slug !== current.slug) await assertSlugAvailable(slug, actor.organizationId);

    // Publicar exige lo mínimo para que un cliente pueda comprar de verdad.
    if (input.status === 'PUBLISHED') {
      const visible = await storeListingRepository.count(actor.organizationId, true);
      if (visible === 0) {
        throw errors.validation(
          'Publica al menos un producto en la vitrina antes de abrir la tienda.',
        );
      }
      if (input.paymentInstructions.length === 0) {
        throw errors.validation(
          'Agrega al menos un dato de pago para que el cliente sepa dónde pagar.',
        );
      }
    }

    const patch: Partial<StoreSettings> = {
      slug,
      status: input.status,
      branding: {
        name: input.branding.name.trim(),
        logoUrl: input.branding.logoUrl || null,
        accentColor: input.branding.accentColor || '#111111',
        marqueeText: input.branding.marqueeText || null,
        whatsapp: input.branding.whatsapp?.replace(/[^0-9]/g, '') || null,
        currencySymbol: input.branding.currencySymbol || 'C$',
        variantLabel: input.branding.variantLabel || 'PRESENTACIÓN',
        cartTitle: input.branding.cartTitle || 'TU CARRITO',
      },
      features: { ...DEFAULT_STORE_FEATURES, ...input.features },
      heroSlides: input.heroSlides,
      shippingZones: input.shippingZones.map((zone) => ({
        id: zone.id || randomId('z'),
        label: zone.label.trim(),
        cost: toMinorUnits(zone.cost),
      })),
      paymentInstructions: input.paymentInstructions.map((item) => ({
        id: item.id || randomId('p'),
        label: item.label.trim(),
        detail: item.detail.trim(),
        notes: item.notes?.trim() || null,
      })),
      seoDescription: input.seoDescription?.trim() || null,
      warehouseId: input.warehouseId || current.warehouseId,
      defaultAccountId: input.defaultAccountId || null,
    };

    await storeSettingsRepository.patch(actor.organizationId, patch, actor.userId);

    await audit(actor, {
      action: 'UPDATE',
      module: 'STORE',
      entityType: 'storeSettings',
      entityId: actor.organizationId,
      entityLabel: patch.branding?.name ?? current.branding.name,
      before: { slug: current.slug, status: current.status },
      after: { slug, status: input.status },
    });
  },

  /**
   * Producto de servicio con el que se factura el envío dentro de la venta.
   * Se crea una sola vez, no controla inventario y su costo es cero, de modo
   * que el envío entra como ingreso sin ensuciar el costo de la mercadería.
   */
  async ensureShippingProduct(actor: ActorContext, settings: StoreSettings): Promise<Id> {
    if (settings.shippingProductId) {
      const existing = await productRepository.get(
        actor.organizationId,
        settings.shippingProductId,
      );
      if (existing) return existing.id;
    }

    const bySku = await productRepository.findBySku(actor.organizationId, SHIPPING_SKU);
    const productId =
      bySku?.id ??
      (await catalogService.createProduct(
        actor,
        {
          sku: SHIPPING_SKU,
          name: 'Envío a domicilio',
          description: 'Costo de envío de los pedidos de la tienda online.',
          unit: 'SERVICE',
          cost: 0,
          salePrice: 0,
          wholesalePrice: 0,
          taxRate: 0,
          minimumStock: 0,
          tracksInventory: false,
          status: 'ACTIVE',
        },
        settings.warehouseId ?? (await warehouseRepository.getDefault(actor.organizationId)).id,
      ));

    await storeSettingsRepository.patch(
      actor.organizationId,
      { shippingProductId: productId },
      actor.userId,
    );
    return productId;
  },

  // -------------------------------------------------------------------------
  // Vitrina
  // -------------------------------------------------------------------------

  /**
   * Publica un producto del ERP o actualiza su ficha. La clave del documento
   * es `{orgId}_{productId}`, así que publicar dos veces el mismo producto es
   * imposible por construcción.
   */
  async saveListing(actor: ActorContext, input: StoreListingInput): Promise<Id> {
    const product = await productRepository.require(actor.organizationId, input.productId);

    // Cada variante debe ser un producto real y activo de la misma
    // organización: es lo que garantiza que el stock y el kardex cuadren.
    const variants = await Promise.all(
      input.variants.map(async (variant) => {
        const target = await productRepository.require(actor.organizationId, variant.productId);
        if (target.status !== 'ACTIVE') {
          throw errors.validation(`El producto "${target.name}" está inactivo.`);
        }
        return { label: variant.label.trim(), productId: target.id };
      }),
    );

    const labels = new Set<string>();
    for (const variant of variants) {
      if (!variant.label) throw errors.validation('Cada variante necesita una etiqueta.');
      if (labels.has(variant.label)) {
        throw errors.validation(`La variante "${variant.label}" está repetida.`);
      }
      labels.add(variant.label);
    }

    const existing = await storeListingRepository.get(actor.organizationId, input.productId);
    const title = input.title?.trim() || product.name;

    const listing: StoreListing = {
      id: `${actor.organizationId}_${input.productId}`,
      organizationId: actor.organizationId,
      productId: product.id,
      title,
      searchTitle: listingSearchTitle(title),
      description: input.description?.trim() || product.description || null,
      details: input.details.map((d) => d.trim()).filter(Boolean).slice(0, 12),
      images: input.images.filter(Boolean).slice(0, 8),
      collection: input.collection?.trim() || product.categoryName || null,
      variants,
      salePrice: toMinorUnits(input.salePrice ?? 0),
      featured: input.featured ?? false,
      position: input.position ?? existing?.position ?? 100,
      visible: input.visible ?? true,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      createdBy: existing?.createdBy ?? actor.userId,
      updatedBy: actor.userId,
    };

    if (listing.salePrice > 0 && listing.salePrice >= product.salePrice) {
      throw errors.validation(
        'El precio de oferta debe ser menor que el precio de venta del producto.',
      );
    }

    await storeListingRepository.save(listing);

    await audit(actor, {
      action: existing ? 'UPDATE' : 'CREATE',
      module: 'STORE',
      entityType: 'storeListing',
      entityId: listing.id,
      entityLabel: listing.title,
      after: { visible: listing.visible, variants: variants.length },
    });

    return listing.id;
  },

  async setListingVisibility(actor: ActorContext, productId: Id, visible: boolean): Promise<void> {
    const listing = await storeListingRepository.require(actor.organizationId, productId);
    await storeListingRepository.patch(
      actor.organizationId,
      productId,
      { visible },
      actor.userId,
    );
    await audit(actor, {
      action: 'UPDATE',
      module: 'STORE',
      entityType: 'storeListing',
      entityId: listing.id,
      entityLabel: listing.title,
      before: { visible: listing.visible },
      after: { visible },
    });
  },

  async removeListing(actor: ActorContext, productId: Id): Promise<void> {
    const listing = await storeListingRepository.require(actor.organizationId, productId);
    await storeListingRepository.remove(actor.organizationId, productId);
    await audit(actor, {
      action: 'DELETE',
      module: 'STORE',
      entityType: 'storeListing',
      entityId: listing.id,
      entityLabel: listing.title,
    });
  },

  // -------------------------------------------------------------------------
  // Cupones
  // -------------------------------------------------------------------------

  async saveDiscount(actor: ActorContext, id: Id | null, input: StoreDiscountInput): Promise<Id> {
    const code = input.code.trim().toUpperCase();
    const duplicate = await storeDiscountRepository.findByCode(actor.organizationId, code);
    if (duplicate && duplicate.id !== id) {
      throw errors.conflict(`Ya existe un cupón con el código "${code}".`);
    }

    if (input.kind === 'PERCENT' && (input.value <= 0 || input.value > 100)) {
      throw errors.validation('El porcentaje debe estar entre 1 y 100.');
    }

    const existing = id ? await storeDiscountRepository.get(actor.organizationId, id) : null;
    if (id && !existing) throw errors.notFound('Cupón');

    const ref = existing ? refs.storeDiscount(existing.id) : newDoc(COLLECTIONS.STORE_DISCOUNTS);

    const discount: StoreDiscount = {
      id: ref.id,
      organizationId: actor.organizationId,
      code,
      kind: input.kind,
      // El porcentaje se guarda en puntos base, igual que los impuestos.
      value: input.kind === 'PERCENT' ? Math.round(input.value * 100) : toMinorUnits(input.value),
      minimumPurchase: toMinorUnits(input.minimumPurchase ?? 0),
      maxUses: Math.max(0, Math.trunc(input.maxUses ?? 0)),
      usedCount: existing?.usedCount ?? 0,
      expiresAt: input.expiresAt || null,
      status: input.status ?? 'ACTIVE',
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      createdBy: existing?.createdBy ?? actor.userId,
      updatedBy: actor.userId,
    };

    await ref.set(discount);

    await audit(actor, {
      action: existing ? 'UPDATE' : 'CREATE',
      module: 'STORE',
      entityType: 'storeDiscount',
      entityId: ref.id,
      entityLabel: code,
      after: { kind: discount.kind, value: discount.value, status: discount.status },
    });

    return ref.id;
  },

  async setDiscountStatus(actor: ActorContext, id: Id, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    const discount = await storeDiscountRepository.get(actor.organizationId, id);
    if (!discount) throw errors.notFound('Cupón');
    await refs.storeDiscount(id).set(
      { status, updatedAt: nowIso(), updatedBy: actor.userId },
      { merge: true },
    );
    await audit(actor, {
      action: 'UPDATE',
      module: 'STORE',
      entityType: 'storeDiscount',
      entityId: id,
      entityLabel: discount.code,
      before: { status: discount.status },
      after: { status },
    });
  },

  // -------------------------------------------------------------------------
  // Pop-ups
  // -------------------------------------------------------------------------

  async saveBanner(actor: ActorContext, id: Id | null, input: StoreBannerInput): Promise<Id> {
    const existing = id ? await storeBannerRepository.get(actor.organizationId, id) : null;
    if (id && !existing) throw errors.notFound('Pop-up');

    const ref = existing ? refs.storeBanner(existing.id) : newDoc(COLLECTIONS.STORE_BANNERS);

    const banner: StoreBanner = {
      id: ref.id,
      organizationId: actor.organizationId,
      title: input.title.trim(),
      message: input.message?.trim() || null,
      imageUrl: input.imageUrl || null,
      ctaLabel: input.ctaLabel?.trim() || null,
      ctaHref: input.ctaHref?.trim() || null,
      delaySeconds: Math.min(Math.max(Math.trunc(input.delaySeconds ?? 3), 0), 60),
      status: input.status ?? 'ACTIVE',
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      createdBy: existing?.createdBy ?? actor.userId,
      updatedBy: actor.userId,
    };

    await ref.set(banner);

    await audit(actor, {
      action: existing ? 'UPDATE' : 'CREATE',
      module: 'STORE',
      entityType: 'storeBanner',
      entityId: ref.id,
      entityLabel: banner.title,
      after: { status: banner.status },
    });

    return ref.id;
  },

  async deleteBanner(actor: ActorContext, id: Id): Promise<void> {
    const banner = await storeBannerRepository.get(actor.organizationId, id);
    if (!banner) throw errors.notFound('Pop-up');
    await refs.storeBanner(id).delete();
    await audit(actor, {
      action: 'DELETE',
      module: 'STORE',
      entityType: 'storeBanner',
      entityId: id,
      entityLabel: banner.title,
    });
  },
};

export interface StoreListingInput {
  productId: Id;
  title?: string | null;
  description?: string | null;
  details: string[];
  images: string[];
  collection?: string | null;
  variants: { label: string; productId: Id }[];
  salePrice?: number;
  featured?: boolean;
  position?: number;
  visible?: boolean;
}

export interface StoreDiscountInput {
  code: string;
  kind: 'PERCENT' | 'AMOUNT';
  /** Porcentaje (1-100) o monto en unidad mayor, según `kind`. */
  value: number;
  minimumPurchase?: number;
  maxUses?: number;
  expiresAt?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface StoreBannerInput {
  title: string;
  message?: string | null;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  delaySeconds?: number;
  status?: 'ACTIVE' | 'INACTIVE';
}

// ---------------------------------------------------------------------------
// Resolución del catálogo público
// ---------------------------------------------------------------------------

/**
 * Precio unitario de una opción.
 *
 * Sin oferta, cada opción vale lo que dice su producto en el ERP. Con oferta,
 * la ficha impone un precio único para todas: es lo que ve el cliente y lo que
 * el servidor vuelve a calcular al recibir el pedido, de modo que un carrito
 * manipulado en el navegador no puede cambiar lo que se cobra.
 */
function optionPrice(listing: StoreListing, product: Product): { price: Money; compareAt: Money } {
  if (listing.salePrice > 0 && listing.salePrice < product.salePrice) {
    return { price: listing.salePrice, compareAt: product.salePrice };
  }
  return { price: product.salePrice, compareAt: 0 };
}

function toOption(label: string, listing: StoreListing, product: Product): StorefrontOption {
  const { price } = optionPrice(listing, product);
  return {
    label,
    productId: product.id,
    sku: product.sku,
    price,
    stock: product.stock ?? 0,
    available: product.status === 'ACTIVE' && (!product.tracksInventory || (product.stock ?? 0) > 0),
  };
}

/**
 * Convierte fichas + productos en el modelo que consume el sitio público.
 * Se descartan las fichas cuyo producto principal ya no existe o fue dado de
 * baja: la vitrina nunca muestra algo que el ERP no puede vender.
 */
export function buildStorefrontProducts(
  listings: StoreListing[],
  productsById: Map<Id, Product>,
): StorefrontProduct[] {
  const out: StorefrontProduct[] = [];

  for (const listing of listings) {
    const product = productsById.get(listing.productId);
    if (!product || product.status !== 'ACTIVE') continue;

    const options: StorefrontOption[] = listing.variants.length
      ? listing.variants
          .map((variant) => {
            const target = productsById.get(variant.productId);
            return target && target.status === 'ACTIVE'
              ? toOption(variant.label, listing, target)
              : null;
          })
          .filter((option): option is StorefrontOption => option !== null)
      : [toOption('ÚNICA', listing, product)];

    if (options.length === 0) continue;

    const prices = options.map((option) => option.price);
    const minPrice = Math.min(...prices);
    const { compareAt } = optionPrice(listing, product);

    out.push({
      listingId: listing.id,
      productId: product.id,
      publishedAt: listing.createdAt,
      title: listing.title,
      description: listing.description,
      details: listing.details,
      images: listing.images,
      collection: listing.collection,
      featured: listing.featured,
      price: minPrice,
      compareAtPrice: compareAt,
      priceVaries: new Set(prices).size > 1,
      options,
    });
  }

  return out;
}

/**
 * Índice `productId → { ficha, opción }` de todo lo que la tienda puede
 * vender. Es la referencia autoritativa del checkout: si un `productId` no
 * está aquí, no se vende por la web por más que llegue en la petición.
 */
export function sellableIndex(
  products: StorefrontProduct[],
): Map<Id, { product: StorefrontProduct; option: StorefrontOption }> {
  const index = new Map<Id, { product: StorefrontProduct; option: StorefrontOption }>();
  for (const product of products) {
    for (const option of product.options) {
      index.set(option.productId, { product, option });
    }
  }
  return index;
}

/** Catálogo público completo de una tienda, ya resuelto contra el ERP. */
export async function loadStorefrontCatalog(organizationId: Id): Promise<StorefrontProduct[]> {
  const listings = await storeListingRepository.list(organizationId, true);
  if (listings.length === 0) return [];

  const productIds = new Set<Id>();
  for (const listing of listings) {
    productIds.add(listing.productId);
    for (const variant of listing.variants) productIds.add(variant.productId);
  }

  const products = await productRepository.listByIds(organizationId, [...productIds]);
  const byId = new Map(products.map((product) => [product.id, product]));

  return buildStorefrontProducts(listings, byId);
}

/** Colecciones (categorías de vitrina) presentes en un catálogo. */
export function catalogCollections(products: StorefrontProduct[]): string[] {
  const set = new Set<string>();
  for (const product of products) {
    if (product.collection) set.add(product.collection);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Categorías del ERP disponibles para asignar a una ficha. */
export async function listCollectionOptions(organizationId: Id): Promise<string[]> {
  const categories = await categoryRepository.list(organizationId);
  return categories.map((category) => category.name);
}

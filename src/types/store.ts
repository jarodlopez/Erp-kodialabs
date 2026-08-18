import type { BaseEntity, EntityStatus, Id, IsoDate, Money, Quantity } from './common';
import type { DeliveryInfo } from './sales';

/**
 * Tienda online (módulo `store`).
 *
 * El catálogo, las existencias y el dinero NO se duplican: la tienda publica
 * productos que ya viven en `products` y cada pedido aprobado se convierte en
 * una venta del ERP con su descuento de inventario y su asiento financiero.
 * Aquí solo se guarda lo que es propio del canal online: identidad visual,
 * ficha de vitrina, zonas de envío, cupones y los pedidos por revisar.
 */

// ---------------------------------------------------------------------------
// Configuración de la tienda (`storeSettings/{organizationId}`)
// ---------------------------------------------------------------------------

/** Identidad visual. Se edita desde el panel; nada de esto vive en el código. */
export interface StoreBranding {
  /** Nombre comercial mostrado en la tienda (puede diferir del de la organización). */
  name: string;
  /** Logo del header. Vacío = se muestra el nombre como texto. */
  logoUrl: string | null;
  /** Color de acento en hexadecimal, aplicado como variable CSS en runtime. */
  accentColor: string;
  /** Cinta animada superior. Vacío = se oculta. */
  marqueeText: string | null;
  /** Número de WhatsApp en formato internacional sin `+`. Vacío = se oculta. */
  whatsapp: string | null;
  /** Prefijo de precios: `C$`, `$`, `Q`, `L`… */
  currencySymbol: string;
  /** Etiqueta de la variante: TALLA (ropa), MEDIDA (ferretería), PRESENTACIÓN… */
  variantLabel: string;
  cartTitle: string;
}

/** Módulos activables de la tienda. Lo apagado desaparece del sitio público. */
export interface StoreFeatures {
  hero: boolean;
  discounts: boolean;
  popups: boolean;
  whatsappButton: boolean;
  /** Muestra el stock disponible en la ficha de producto. */
  showStock: boolean;
}

export const DEFAULT_STORE_FEATURES: StoreFeatures = {
  hero: true,
  discounts: true,
  popups: true,
  whatsappButton: true,
  showStock: false,
};

export interface HeroSlide {
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

/** Zona de envío con su costo. Reemplaza cualquier zona fija del código. */
export interface ShippingZone {
  id: string;
  label: string;
  /** Costo en centavos. `0` = envío gratis. */
  cost: Money;
}

/** Instrucciones de pago que ve el cliente en el checkout. */
export interface StorePaymentInstruction {
  id: string;
  /** Banco, billetera o método: "BAC — Córdobas", "Transferencia", … */
  label: string;
  /** Número de cuenta, teléfono o detalle a copiar. */
  detail: string;
  notes: string | null;
}

export type StoreStatus = 'DRAFT' | 'PUBLISHED';

export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicada',
};

/** Configuración completa de la tienda. Documento `storeSettings/{orgId}`. */
export interface StoreSettings {
  id: Id;
  organizationId: Id;
  /** Identificador en la URL pública (`/t/{slug}`). Único en la plataforma. */
  slug: string;
  status: StoreStatus;
  branding: StoreBranding;
  features: StoreFeatures;
  heroSlides: HeroSlide[];
  shippingZones: ShippingZone[];
  paymentInstructions: StorePaymentInstruction[];
  /** Texto del pie de página y descripción para buscadores. */
  seoDescription: string | null;
  /**
   * Producto de tipo servicio usado para facturar el envío dentro de la venta
   * del ERP. Se crea la primera vez que se aprueba un pedido con costo de envío.
   */
  shippingProductId: Id | null;
  /** Bodega desde la que se descuenta el inventario de los pedidos online. */
  warehouseId: Id | null;
  /** Cuenta financiera sugerida al aprobar un pedido pagado. */
  defaultAccountId: Id | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  updatedBy: Id;
}

// ---------------------------------------------------------------------------
// Ficha de vitrina (`storeListings/{organizationId}_{productId}`)
// ---------------------------------------------------------------------------

/**
 * Variante vendible. Cada variante es un producto real del ERP con su propio
 * SKU y su propia existencia: la tienda solo las agrupa bajo una misma ficha,
 * de modo que el inventario, el kardex y el costo promedio siguen siendo los
 * del ERP sin ninguna capa paralela.
 */
export interface StoreVariant {
  label: string;
  productId: Id;
}

/** Publicación de un producto del ERP en la tienda. */
export interface StoreListing extends BaseEntity {
  /** Producto principal. Con variantes, es el que define precio y ficha. */
  productId: Id;
  /** Título de vitrina. Vacío = se usa el nombre del producto. */
  title: string;
  /** Título normalizado para ordenar y buscar. */
  searchTitle: string;
  description: string | null;
  /** Viñetas de detalle ("100% algodón", "Garantía 1 año"). */
  details: string[];
  /** Imágenes alojadas en ImgBB. La primera es la portada. */
  images: string[];
  /** Categoría de vitrina; si es `null` se usa la categoría del producto. */
  collection: string | null;
  variants: StoreVariant[];
  /** Precio de oferta en centavos. `0` = sin oferta, se usa el del producto. */
  salePrice: Money;
  featured: boolean;
  /** Orden manual en la vitrina (menor primero). */
  position: number;
  visible: boolean;
}

/**
 * Ficha resuelta para el sitio público: listing + datos vivos del producto.
 *
 * PRECIOS — cada opción se cotiza con el precio de venta de SU producto en el
 * ERP, salvo que la ficha declare un precio de oferta, que entonces aplica a
 * todas las opciones. Así una tienda de ropa vende todas las tallas al mismo
 * precio sin configurar nada, y una ferretería puede cobrar distinto por cada
 * medida sin salirse del catálogo del ERP.
 */
export interface StorefrontProduct {
  listingId: Id;
  productId: Id;
  title: string;
  description: string | null;
  details: string[];
  images: string[];
  collection: string | null;
  featured: boolean;
  /** Precio más bajo entre las opciones (centavos). Es el que se muestra. */
  price: Money;
  /** Precio de lista para tachar cuando hay oferta. `0` si no hay oferta. */
  compareAtPrice: Money;
  /** `true` si las opciones no comparten precio: la vitrina muestra "desde". */
  priceVaries: boolean;
  /** Opciones vendibles. Siempre trae al menos una. */
  options: StorefrontOption[];
}

export interface StorefrontOption {
  label: string;
  productId: Id;
  sku: string;
  /** Precio unitario vigente de esta opción (centavos). */
  price: Money;
  /** Existencia disponible (cantidad escalada). */
  stock: Quantity;
  available: boolean;
}

// ---------------------------------------------------------------------------
// Pedidos online (`storeOrders/{id}`)
// ---------------------------------------------------------------------------

export type StoreOrderStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export const STORE_ORDER_STATUS_LABELS: Record<StoreOrderStatus, string> = {
  PENDING: 'Por revisar',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Anulado',
};

export interface StoreOrderItem {
  productId: Id;
  sku: string;
  /** Nombre mostrado en la tienda al momento de comprar. */
  name: string;
  /** Variante elegida ("M", "1/2 pulgada"). `null` si el producto es único. */
  variantLabel: string | null;
  /** Cantidad escalada por QTY_SCALE. */
  quantity: Quantity;
  /** Precio unitario en centavos, congelado al momento del pedido. */
  unitPrice: Money;
  /** `unitPrice * quantity` en centavos. */
  total: Money;
  imageUrl: string | null;
}

export interface StoreOrderCustomer {
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
}

/** Pedido recibido por la tienda. Aún no toca inventario ni finanzas. */
export interface StoreOrder extends BaseEntity {
  number: string;
  status: StoreOrderStatus;
  customer: StoreOrderCustomer;
  /** Datos de entrega; se copian tal cual a la venta al aprobar. */
  delivery: DeliveryInfo;
  shippingZoneId: string | null;
  shippingZoneLabel: string | null;
  shippingCost: Money;
  items: StoreOrderItem[];
  /** Suma de las líneas, sin envío ni descuento (centavos). */
  subtotal: Money;
  discountCode: string | null;
  discountAmount: Money;
  /** `subtotal - discountAmount + shippingCost` (centavos). */
  total: Money;
  /** Comprobante de pago subido por el cliente (ImgBB). */
  receiptUrl: string | null;
  paymentReference: string | null;
  notes: string | null;
  /** Venta del ERP generada al aprobar. `null` mientras esté pendiente. */
  saleId: Id | null;
  saleNumber: string | null;
  reviewedAt: IsoDate | null;
  reviewedBy: Id | null;
  /** Motivo del rechazo o la anulación. */
  resolutionNote: string | null;
}

/** Línea enviada por el sitio público. El servidor recalcula todo lo demás. */
export interface StoreOrderLineInput {
  productId: Id;
  quantity: number;
}

export interface CreateStoreOrderInput {
  customer: StoreOrderCustomer;
  address: string;
  addressNotes?: string | null;
  shippingZoneId?: string | null;
  items: StoreOrderLineInput[];
  discountCode?: string | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Cupones y pop-ups
// ---------------------------------------------------------------------------

export type DiscountKind = 'PERCENT' | 'AMOUNT';

export const DISCOUNT_KIND_LABELS: Record<DiscountKind, string> = {
  PERCENT: 'Porcentaje',
  AMOUNT: 'Monto fijo',
};

export interface StoreDiscount extends BaseEntity {
  /** Código en mayúsculas que teclea el cliente. Único por organización. */
  code: string;
  kind: DiscountKind;
  /** Porcentaje en puntos base (10 % === 1000) o monto en centavos. */
  value: number;
  /** Compra mínima en centavos para que aplique. `0` = sin mínimo. */
  minimumPurchase: Money;
  /** Usos permitidos. `0` = ilimitado. */
  maxUses: number;
  usedCount: number;
  expiresAt: IsoDate | null;
  status: EntityStatus;
}

export interface StoreBanner extends BaseEntity {
  title: string;
  message: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  /** Segundos antes de mostrarlo. */
  delaySeconds: number;
  status: EntityStatus;
}

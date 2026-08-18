/**
 * Esquemas de validación con Zod.
 *
 * Se usan en DOS lugares:
 *  - en el cliente, para dar retroalimentación inmediata en los formularios;
 *  - en el servidor, dentro de cada Server Action, como validación
 *    autoritativa. El servidor NUNCA confía en que el cliente ya validó.
 */
import { z } from 'zod';

import { ROLE_LIST } from '@/lib/rbac';

const requiredText = (label: string, max = 200) =>
  z
    .string({ error: `${label} es obligatorio.` })
    .trim()
    .min(1, `${label} es obligatorio.`)
    .max(max, `${label} no puede superar ${max} caracteres.`);

const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `El texto no puede superar ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null));

const money = (label: string) =>
  z.coerce
    .number({ error: `${label} debe ser un número.` })
    .finite(`${label} debe ser un número válido.`)
    .min(0, `${label} no puede ser negativo.`)
    .max(999_999_999, `${label} es demasiado grande.`);

const positiveMoney = (label: string) =>
  money(label).refine((v) => v > 0, `${label} debe ser mayor que cero.`);

const quantity = (label: string) =>
  z.coerce
    .number({ error: `${label} debe ser un número.` })
    .finite(`${label} debe ser un número válido.`)
    .min(0, `${label} no puede ser negativa.`)
    .max(9_999_999, `${label} es demasiado grande.`);

const dateString = z
  .string()
  .min(1, 'La fecha es obligatoria.')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'La fecha no es válida.');

const idString = z.string().trim().min(1, 'Identificador inválido.').max(128);

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.email('Ingresa un correo válido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
});

const registerObjectSchema = z.object({
  displayName: requiredText('El nombre', 120),
  organizationName: requiredText('El nombre del negocio', 120),
  email: z.email('Ingresa un correo válido.'),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .regex(/[A-Za-z]/, 'La contraseña debe incluir al menos una letra.')
    .regex(/[0-9]/, 'La contraseña debe incluir al menos un número.'),
  confirmPassword: z.string(),
});

export const registerSchema = registerObjectSchema.refine(
  (data) => data.password === data.confirmPassword,
  {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  },
);

// Solo los campos que el servidor necesita del registro. Se deriva del objeto
// base (sin refinamientos) porque en Zod 4 `.pick()` no puede aplicarse sobre
// un schema que ya tiene `.refine()`.
export const registerProfileSchema = registerObjectSchema.pick({
  displayName: true,
  organizationName: true,
});

export const forgotPasswordSchema = z.object({
  email: z.email('Ingresa un correo válido.'),
});

export const subscriptionPaymentReportSchema = z.object({
  plan: requiredText('El plan', 40),
  amount: money('El monto').refine((v) => v > 0, 'El monto debe ser mayor que cero.'),
  method: requiredText('El método de pago', 40),
  reference: optionalText(120),
  paidAt: dateString,
  note: optionalText(500),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(6, 'Ingresa tu contraseña actual.'),
    newPassword: z
      .string()
      .min(8, 'La nueva contraseña debe tener al menos 8 caracteres.')
      .regex(/[A-Za-z]/, 'Debe incluir al menos una letra.')
      .regex(/[0-9]/, 'Debe incluir al menos un número.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  name: requiredText('El nombre', 80),
  description: optionalText(300),
  parentId: idString.optional().nullable().transform((v) => v || null),
  color: optionalText(20),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const productSchema = z.object({
  sku: requiredText('El SKU', 40),
  barcode: optionalText(64),
  name: requiredText('El nombre', 150),
  description: optionalText(1000),
  categoryId: z.string().optional().nullable().transform((v) => v || null),
  brand: optionalText(80),
  unit: z.enum(['UNIT', 'BOX', 'PACK', 'KG', 'GRAM', 'LITER', 'METER', 'SERVICE']),
  imageUrl: optionalText(500),
  imagePath: optionalText(500),
  cost: money('El costo'),
  salePrice: money('El precio de venta'),
  wholesalePrice: money('El precio mayorista').default(0),
  taxRate: z.coerce.number().int().min(0).max(10000).default(0),
  minimumStock: quantity('El stock mínimo').default(0),
  initialStock: quantity('El stock inicial').default(0),
  tracksInventory: z.boolean().default(true),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

/**
 * Alta rápida de producto desde el punto de venta: solo lo mínimo para vender
 * al instante (nombre y precio). El SKU se genera en el servidor y, por
 * defecto, el producto no controla inventario (pensado para artículos únicos).
 */
export const posQuickProductSchema = z.object({
  name: requiredText('El nombre', 150),
  salePrice: money('El precio de venta'),
  cost: money('El costo').optional().default(0),
  categoryId: z.string().optional().nullable().transform((v) => v || null),
  tracksInventory: z.coerce.boolean().optional().default(false),
  initialStock: quantity('La existencia inicial').optional().default(0),
});
export type PosQuickProductInput = z.infer<typeof posQuickProductSchema>;

// ---------------------------------------------------------------------------
// Clientes y proveedores
// ---------------------------------------------------------------------------

const documentTypeSchema = z
  .enum(['CEDULA', 'RUC', 'PASSPORT', 'OTHER'])
  .optional()
  .nullable()
  .transform((v) => v ?? null);

export const customerSchema = z.object({
  name: requiredText('El nombre', 150),
  documentType: documentTypeSchema,
  document: optionalText(40),
  phone: optionalText(40),
  email: z
    .union([z.email('Ingresa un correo válido.'), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  address: optionalText(300),
  notes: optionalText(1000),
  creditLimit: money('El límite de crédito').default(0),
  creditDays: z.coerce.number().int().min(0).max(365).default(30),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const supplierSchema = z.object({
  name: requiredText('El nombre', 150),
  documentType: documentTypeSchema,
  document: optionalText(40),
  contactName: optionalText(120),
  phone: optionalText(40),
  email: z
    .union([z.email('Ingresa un correo válido.'), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  address: optionalText(300),
  notes: optionalText(1000),
  creditDays: z.coerce.number().int().min(0).max(365).default(30),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

const paymentMethodSchema = z.enum([
  'CASH',
  'TRANSFER',
  'CARD',
  'CHECK',
  'DIGITAL_WALLET',
  'CREDIT_NOTE',
  'OTHER',
]);

export const saleLineSchema = z.object({
  productId: idString,
  quantity: z.coerce
    .number({ error: 'La cantidad debe ser un número.' })
    .positive('La cantidad debe ser mayor que cero.')
    .max(1_000_000, 'La cantidad es demasiado grande.'),
  unitPrice: money('El precio').optional(),
  discount: money('El descuento').optional().default(0),
});

export const saleSchema = z.object({
  customerId: z.string().optional().nullable().transform((v) => v || null),
  date: dateString,
  type: z.enum(['CASH', 'CREDIT']),
  items: z.array(saleLineSchema).min(1, 'Agrega al menos un producto.').max(200),
  globalDiscount: money('El descuento global').optional().default(0),
  notes: optionalText(1000),
  dueDate: z.string().optional().nullable().transform((v) => v || null),
  warehouseId: z.string().optional().nullable().transform((v) => v || undefined),
  delivery: z
    .object({
      recipient: optionalText(150),
      address: requiredText('La dirección de entrega', 400),
      phone: optionalText(40),
      notes: optionalText(500),
    })
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  payment: z
    .object({
      accountId: idString,
      amount: positiveMoney('El pago'),
      method: paymentMethodSchema,
      reference: optionalText(80),
    })
    .optional()
    .nullable(),
  idempotencyKey: z.string().max(120).optional().nullable(),
});

export const salePaymentSchema = z.object({
  saleId: idString,
  accountId: idString,
  amount: positiveMoney('El importe'),
  method: paymentMethodSchema,
  date: dateString,
  reference: optionalText(80),
  notes: optionalText(500),
  idempotencyKey: z.string().max(120).optional().nullable(),
});

export const cancelSchema = z.object({
  id: idString,
  reason: requiredText('El motivo', 300),
});

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

export const purchaseLineSchema = z.object({
  productId: idString,
  quantity: z.coerce.number().positive('La cantidad debe ser mayor que cero.').max(1_000_000),
  unitCost: money('El costo'),
  discount: money('El descuento').optional().default(0),
});

export const purchaseSchema = z.object({
  supplierId: idString,
  invoiceNumber: optionalText(60),
  date: dateString,
  type: z.enum(['CASH', 'CREDIT']),
  items: z.array(purchaseLineSchema).min(1, 'Agrega al menos un producto.').max(200),
  globalDiscount: money('El descuento global').optional().default(0),
  shipping: money('El flete').optional().default(0),
  otherCosts: money('Otros costos').optional().default(0),
  notes: optionalText(1000),
  dueDate: z.string().optional().nullable().transform((v) => v || null),
  warehouseId: z.string().optional().nullable().transform((v) => v || undefined),
  payment: z
    .object({
      accountId: idString,
      amount: positiveMoney('El pago'),
      method: paymentMethodSchema,
      reference: optionalText(80),
    })
    .optional()
    .nullable(),
  idempotencyKey: z.string().max(120).optional().nullable(),
});

export const purchasePaymentSchema = z.object({
  purchaseId: idString,
  accountId: idString,
  amount: positiveMoney('El importe'),
  method: paymentMethodSchema,
  date: dateString,
  reference: optionalText(80),
  notes: optionalText(500),
  idempotencyKey: z.string().max(120).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------

export const expenseSchema = z
  .object({
    categoryId: idString,
    description: requiredText('La descripción', 300),
    supplierId: z.string().optional().nullable().transform((v) => v || null),
    amount: positiveMoney('El importe'),
    taxRate: z.coerce.number().int().min(0).max(10000).default(0),
    date: dateString,
    payNow: z.boolean().default(true),
    accountId: z.string().optional().nullable().transform((v) => v || null),
    method: paymentMethodSchema.optional().nullable(),
    dueDate: z.string().optional().nullable().transform((v) => v || null),
    notes: optionalText(1000),
    receiptUrl: optionalText(500),
    receiptPath: optionalText(500),
    idempotencyKey: z.string().max(120).optional().nullable(),
  })
  .refine((data) => !data.payNow || Boolean(data.accountId), {
    message: 'Selecciona la cuenta desde la que se paga.',
    path: ['accountId'],
  });

export const expenseCategorySchema = z.object({
  name: requiredText('El nombre', 80),
  description: optionalText(300),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const recurringExpenseSchema = z.object({
  description: requiredText('La descripción', 300),
  categoryId: idString,
  supplierId: z.string().optional().nullable().transform((v) => v || null),
  amount: positiveMoney('El importe'),
  taxRate: z.coerce.number().int().min(0).max(10000).default(0),
  frequency: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  nextDate: dateString,
  endDate: z.string().optional().nullable().transform((v) => v || null),
  accountId: z.string().optional().nullable().transform((v) => v || null),
  method: paymentMethodSchema.optional().nullable(),
  autoPay: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

// ---------------------------------------------------------------------------
// Finanzas
// ---------------------------------------------------------------------------

export const accountSchema = z.object({
  name: requiredText('El nombre', 100),
  type: z.enum(['CASH', 'BANK', 'CARD', 'DIGITAL_WALLET', 'OTHER']),
  bankName: optionalText(100),
  accountNumber: optionalText(60),
  initialBalance: money('El saldo inicial').default(0),
  isDefault: z.boolean().default(false),
  notes: optionalText(500),
});

export const transferSchema = z
  .object({
    sourceAccountId: idString,
    destinationAccountId: idString,
    amount: positiveMoney('El importe'),
    date: dateString,
    reference: optionalText(80),
    notes: optionalText(500),
    idempotencyKey: z.string().max(120).optional().nullable(),
  })
  .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
    message: 'La cuenta de origen y la de destino deben ser distintas.',
    path: ['destinationAccountId'],
  });

export const accountAdjustmentSchema = z.object({
  accountId: idString,
  amount: positiveMoney('El importe'),
  direction: z.enum(['IN', 'OUT']),
  reason: requiredText('El motivo', 300),
  date: dateString,
});

export const collectReceivableSchema = z.object({
  receivableId: idString,
  accountId: idString,
  amount: positiveMoney('El importe'),
  method: paymentMethodSchema,
  date: dateString,
  reference: optionalText(80),
  idempotencyKey: z.string().max(120).optional().nullable(),
});

export const payPayableSchema = z.object({
  payableId: idString,
  accountId: idString,
  amount: positiveMoney('El importe'),
  method: paymentMethodSchema,
  date: dateString,
  reference: optionalText(80),
  idempotencyKey: z.string().max(120).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

export const inventoryAdjustmentSchema = z.object({
  productId: idString,
  warehouseId: z.string().optional().nullable().transform((v) => v || undefined),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor que cero.').max(1_000_000),
  direction: z.enum(['IN', 'OUT']),
  reason: requiredText('El motivo', 300),
  unitCost: money('El costo unitario').optional(),
  idempotencyKey: z.string().max(120).optional().nullable(),
});

export const inventoryTransferSchema = z
  .object({
    productId: idString,
    sourceWarehouseId: idString,
    destinationWarehouseId: idString,
    quantity: z.coerce.number().positive('La cantidad debe ser mayor que cero.').max(1_000_000),
    reason: requiredText('El motivo', 300),
    idempotencyKey: z.string().max(120).optional().nullable(),
  })
  .refine((data) => data.sourceWarehouseId !== data.destinationWarehouseId, {
    message: 'La bodega de origen y la de destino deben ser distintas.',
    path: ['destinationWarehouseId'],
  });

// ---------------------------------------------------------------------------
// Devoluciones
// ---------------------------------------------------------------------------

export const returnSchema = z
  .object({
    referenceId: idString,
    date: dateString,
    items: z
      .array(
        z.object({
          productId: idString,
          quantity: z.coerce.number().positive('La cantidad debe ser mayor que cero.'),
        }),
      )
      .min(1, 'Selecciona al menos un producto.'),
    refundMode: z.enum(['CASH_REFUND', 'CREDIT_NOTE']),
    accountId: z.string().optional().nullable().transform((v) => v || null),
    reason: requiredText('El motivo', 300),
    notes: optionalText(500),
    idempotencyKey: z.string().max(120).optional().nullable(),
  })
  .refine((data) => data.refundMode !== 'CASH_REFUND' || Boolean(data.accountId), {
    message: 'Selecciona la cuenta para el reembolso.',
    path: ['accountId'],
  });

// ---------------------------------------------------------------------------
// Administración
// ---------------------------------------------------------------------------

export const inviteUserSchema = z.object({
  email: z.email('Ingresa un correo válido.'),
  displayName: requiredText('El nombre', 120),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .regex(/[A-Za-z]/, 'Debe incluir al menos una letra.')
    .regex(/[0-9]/, 'Debe incluir al menos un número.'),
  role: z.enum(ROLE_LIST as [string, ...string[]]),
});

export const changeRoleSchema = z.object({
  uid: idString,
  role: z.enum(ROLE_LIST as [string, ...string[]]),
});

export const userStatusSchema = z.object({
  uid: idString,
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const settingsSchema = z.object({
  currency: z.string().trim().length(3, 'Usa el código ISO de 3 letras (p. ej. NIO).'),
  locale: requiredText('El idioma', 20),
  timezone: requiredText('La zona horaria', 60),
  taxMode: z.enum(['EXCLUSIVE', 'INCLUSIVE']),
  defaultTaxRate: z.coerce.number().int().min(0).max(10000),
  defaultCreditDays: z.coerce.number().int().min(0).max(365),
  allowNegativeStock: z.boolean().default(false),
  invoiceFooter: optionalText(500),
});

export const organizationSchema = z.object({
  name: requiredText('El nombre', 120),
  legalName: optionalText(150),
  taxId: optionalText(40),
  email: z
    .union([z.email('Ingresa un correo válido.'), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  phone: optionalText(40),
  address: optionalText(300),
  logoUrl: optionalText(500),
});

// ---------------------------------------------------------------------------
// Tienda online
// ---------------------------------------------------------------------------

/** Dirección pública de la tienda: minúsculas, números y guiones. */
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'La dirección debe tener al menos 3 caracteres.')
  .max(40, 'La dirección no puede superar 40 caracteres.')
  .regex(/^[a-z0-9-]+$/, 'Usa solo letras, números y guiones.');

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Elige un color válido.');

export const storeSettingsSchema = z.object({
  slug: slugSchema,
  status: z.enum(['DRAFT', 'PUBLISHED']),
  branding: z.object({
    name: requiredText('El nombre de la tienda', 80),
    logoUrl: optionalText(500),
    accentColor: hexColorSchema,
    marqueeText: optionalText(200),
    whatsapp: optionalText(30),
    currencySymbol: requiredText('El símbolo de moneda', 6),
    variantLabel: requiredText('La etiqueta de variante', 24),
    cartTitle: requiredText('El título del carrito', 40),
  }),
  features: z.object({
    hero: z.coerce.boolean().default(true),
    discounts: z.coerce.boolean().default(true),
    popups: z.coerce.boolean().default(true),
    whatsappButton: z.coerce.boolean().default(true),
    showStock: z.coerce.boolean().default(false),
  }),
  heroSlides: z
    .array(
      z.object({
        imageUrl: requiredText('La imagen', 500),
        title: optionalText(80),
        subtitle: optionalText(160),
        ctaLabel: optionalText(40),
        ctaHref: optionalText(300),
      }),
    )
    .max(6, 'Máximo 6 portadas.')
    .default([]),
  shippingZones: z
    .array(
      z.object({
        id: optionalText(40),
        label: requiredText('El nombre de la zona', 60),
        cost: money('El costo de envío'),
      }),
    )
    .max(30, 'Máximo 30 zonas de envío.')
    .default([]),
  paymentInstructions: z
    .array(
      z.object({
        id: optionalText(40),
        label: requiredText('El método de pago', 60),
        detail: requiredText('El dato de pago', 200),
        notes: optionalText(300),
      }),
    )
    .max(10, 'Máximo 10 datos de pago.')
    .default([]),
  seoDescription: optionalText(300),
  warehouseId: z.string().optional().nullable().transform((v) => v || null),
  defaultAccountId: z.string().optional().nullable().transform((v) => v || null),
});

export const storeListingSchema = z.object({
  productId: idString,
  title: optionalText(150),
  description: optionalText(2000),
  details: z.array(z.string().trim().max(160)).max(12).default([]),
  images: z.array(z.string().trim().max(500)).max(8).default([]),
  collection: optionalText(80),
  variants: z
    .array(z.object({ label: requiredText('La etiqueta', 30), productId: idString }))
    .max(40, 'Máximo 40 variantes por producto.')
    .default([]),
  salePrice: money('El precio de oferta').optional().default(0),
  featured: z.coerce.boolean().optional().default(false),
  position: z.coerce.number().int().min(0).max(9999).optional().default(100),
  visible: z.coerce.boolean().optional().default(true),
});

export const storeDiscountSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, 'El código debe tener al menos 3 caracteres.')
    .max(24, 'El código no puede superar 24 caracteres.')
    .regex(/^[A-Z0-9-]+$/, 'Usa solo letras, números y guiones.'),
  kind: z.enum(['PERCENT', 'AMOUNT']),
  value: z.coerce
    .number({ error: 'El valor debe ser un número.' })
    .positive('El valor debe ser mayor que cero.'),
  minimumPurchase: money('La compra mínima').optional().default(0),
  maxUses: z.coerce.number().int().min(0).max(100000).optional().default(0),
  expiresAt: z.string().optional().nullable().transform((v) => v || null),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const storeBannerSchema = z.object({
  title: requiredText('El título', 80),
  message: optionalText(300),
  imageUrl: optionalText(500),
  ctaLabel: optionalText(40),
  ctaHref: optionalText(300),
  delaySeconds: z.coerce.number().int().min(0).max(60).optional().default(3),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const storeOrderResolutionSchema = z.object({
  orderId: idString,
  note: requiredText('El motivo', 300),
});

export const approveStoreOrderSchema = z.object({
  orderId: idString,
  /** Sin cuenta, la venta se genera a crédito y deja la cuenta por cobrar. */
  accountId: z.string().optional().nullable().transform((v) => v || null),
  method: paymentMethodSchema.optional().default('TRANSFER'),
  reference: optionalText(80),
  note: optionalText(300),
});

/**
 * Pedido recibido del sitio público. Es la única entrada sin sesión del ERP,
 * por lo que se acota con firmeza: del carrito solo se aceptan identificadores
 * y cantidades, nunca precios.
 */
export const storefrontOrderSchema = z.object({
  customer: z.object({
    name: requiredText('Tu nombre', 120),
    phone: requiredText('Tu teléfono', 30),
    email: z
      .union([z.email('Ingresa un correo válido.'), z.literal('')])
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    document: optionalText(40),
  }),
  address: requiredText('La dirección de entrega', 400),
  addressNotes: optionalText(300),
  shippingZoneId: z.string().max(40).optional().nullable().transform((v) => v || null),
  items: z
    .array(
      z.object({
        productId: idString,
        quantity: z.coerce
          .number({ error: 'La cantidad debe ser un número.' })
          .int('La cantidad debe ser un número entero.')
          .positive('La cantidad debe ser mayor que cero.')
          .max(500, 'La cantidad es demasiado grande.'),
      }),
    )
    .min(1, 'Tu carrito está vacío.')
    .max(50, 'El pedido tiene demasiadas líneas.'),
  discountCode: z.string().trim().max(24).optional().nullable().transform((v) => v || null),
  notes: optionalText(500),
});

// ---------------------------------------------------------------------------
// Reparto
// ---------------------------------------------------------------------------

/**
 * Coordenada. Se rechaza el (0,0) porque no es un destino sino lo que informa
 * un dispositivo sin señal: aceptarlo pondría repartos en el golfo de Guinea.
 */
const geoPointSchema = z
  .object({
    lat: z.coerce
      .number({ error: 'La latitud debe ser un número.' })
      .min(-90, 'Latitud fuera de rango.')
      .max(90, 'Latitud fuera de rango.'),
    lng: z.coerce
      .number({ error: 'La longitud debe ser un número.' })
      .min(-180, 'Longitud fuera de rango.')
      .max(180, 'Longitud fuera de rango.'),
  })
  .refine((p) => !(p.lat === 0 && p.lng === 0), 'Marca el punto en el mapa.');

export const createDeliverySchema = z.object({
  source: z.enum(['SALE', 'STORE_ORDER']),
  sourceId: idString,
  point: geoPointSchema,
  landmark: optionalText(160),
  origin: geoPointSchema.optional().nullable().transform((v) => v ?? null),
  riderId: z.string().trim().max(128).optional().nullable().transform((v) => v || null),
  notes: optionalText(500),
});

export const assignDeliverySchema = z.object({
  deliveryId: idString,
  riderId: idString,
});

export const finishDeliverySchema = z.object({
  deliveryId: idString,
  status: z.enum(['DELIVERED', 'FAILED']),
  note: optionalText(300),
});

export const cancelDeliverySchema = z.object({
  deliveryId: idString,
  note: requiredText('El motivo', 300),
});

/**
 * Marca de posición del teléfono del rider.
 *
 * `at` se acepta pero el servidor la ignora al guardar: se conserva en el
 * esquema para no romper clientes que la envíen. La hora la pone el servidor,
 * porque un reloj mal puesto falsearía las velocidades con las que se
 * descartan los saltos del GPS.
 */
export const trackPingSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  accuracy: z.coerce.number().min(0).max(100_000),
  speed: z.coerce.number().min(0).max(1000).optional().nullable().transform((v) => v ?? null),
  at: z.string().trim().max(40).optional().nullable().transform((v) => v || null),
});

export const deliverySettingsSchema = z
  .object({
    origin: geoPointSchema.optional().nullable().transform((v) => v ?? null),
    costPerKm: money('El costo por kilómetro'),
    riderPayPerDelivery: money('El pago por entrega'),
    riderPayPerKm: money('El pago por kilómetro'),
    customerBaseFee: money('La tarifa base'),
    customerFeePerKm: money('La tarifa por kilómetro'),
    customerFreeKm: z.coerce
      .number({ error: 'Los kilómetros incluidos deben ser un número.' })
      .min(0, 'No puede ser negativo.')
      .max(100, 'Como máximo 100 km incluidos.'),
    // Por debajo de 1 la "ruta" sería más corta que la línea recta, que es
    // geométricamente imposible.
    roadFactor: z.coerce
      .number({ error: 'El factor de carretera debe ser un número.' })
      .min(1, 'El factor no puede ser menor que 1.')
      .max(3, 'Un factor mayor que 3 no describe ninguna ciudad.'),
    // Menos de 10 s vacía la batería sin agregar precisión; más de 5 min deja
    // huecos en los que el rastro deja de describir la ruta.
    pingSeconds: z.coerce
      .number({ error: 'La cadencia debe ser un número.' })
      .int('Usa segundos enteros.')
      .min(10, 'Menos de 10 segundos agota la batería sin ganar precisión.')
      .max(300, 'Más de 5 minutos entre marcas deja huecos en la ruta.'),
    maxAccuracyMeters: z.coerce
      .number({ error: 'La precisión mínima debe ser un número.' })
      .int('Usa metros enteros.')
      .min(20, 'Exigir menos de 20 m descartaría casi todas las lecturas.')
      .max(1000, 'Aceptar más de 1 km de error haría inútil el rastro.'),
    expenseCategoryId: z
      .string()
      .trim()
      .max(128)
      .optional()
      .nullable()
      .transform((v) => v || null),
    autoRegisterExpense: z.coerce.boolean().default(false),
  })
  .refine((v) => !v.autoRegisterExpense || Boolean(v.expenseCategoryId), {
    error: 'Elige la categoría de gasto o desactiva el registro automático.',
    path: ['expenseCategoryId'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ProductFormInput = z.infer<typeof productSchema>;
export type CategoryFormInput = z.infer<typeof categorySchema>;
export type CustomerFormInput = z.infer<typeof customerSchema>;
export type SupplierFormInput = z.infer<typeof supplierSchema>;
export type SaleFormInput = z.infer<typeof saleSchema>;
export type PurchaseFormInput = z.infer<typeof purchaseSchema>;
export type ExpenseFormInput = z.infer<typeof expenseSchema>;
export type AccountFormInput = z.infer<typeof accountSchema>;
export type TransferFormInput = z.infer<typeof transferSchema>;
export type ReturnFormInput = z.infer<typeof returnSchema>;
export type StoreSettingsFormInput = z.infer<typeof storeSettingsSchema>;
export type StoreListingFormInput = z.infer<typeof storeListingSchema>;
export type StoreDiscountFormInput = z.infer<typeof storeDiscountSchema>;
export type StoreBannerFormInput = z.infer<typeof storeBannerSchema>;
export type StorefrontOrderInput = z.infer<typeof storefrontOrderSchema>;
export type CreateDeliveryFormInput = z.infer<typeof createDeliverySchema>;
export type DeliverySettingsFormInput = z.infer<typeof deliverySettingsSchema>;
export type TrackPingFormInput = z.infer<typeof trackPingSchema>;

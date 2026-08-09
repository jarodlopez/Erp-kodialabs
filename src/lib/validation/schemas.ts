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

export const registerSchema = z
  .object({
    displayName: requiredText('El nombre', 120),
    organizationName: requiredText('El nombre del negocio', 120),
    email: z.email('Ingresa un correo válido.'),
    password: z
      .string()
      .min(8, 'La contraseña debe tener al menos 8 caracteres.')
      .regex(/[A-Za-z]/, 'La contraseña debe incluir al menos una letra.')
      .regex(/[0-9]/, 'La contraseña debe incluir al menos un número.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.email('Ingresa un correo válido.'),
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

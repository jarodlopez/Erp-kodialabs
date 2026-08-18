import { COLLECTIONS } from '@/lib/firebase/collections';
import { normalizeSearch } from '@/lib/repositories/base';
import { DEFAULT_SETTINGS } from '@/lib/repositories/organization';
import { toMinorUnits, toScaledQty } from '@/lib/money';
import type { ActorContext } from '@/types/common';
import type { Settings } from '@/types/organization';
import type { FakeFirestore } from '../helpers/fake-firestore';

export const ORG_ID = 'org-test';
export const WAREHOUSE_ID = 'wh-main';
export const USER_ID = 'user-admin';

export const settings: Settings = {
  ...DEFAULT_SETTINGS,
  id: ORG_ID,
  organizationId: ORG_ID,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: USER_ID,
};

export const actor: ActorContext = {
  userId: USER_ID,
  organizationId: ORG_ID,
  email: 'admin@test.local',
  role: 'ADMIN',
  permissions: [],
};

export const ctx = {
  actor,
  actorName: 'Administrador',
  settings,
  defaultWarehouseId: WAREHOUSE_ID,
};

const now = '2026-01-01T00:00:00.000Z';

export interface SeedOptions {
  productCost?: number;
  productPrice?: number;
  initialStock?: number;
  accountBalance?: number;
  taxRate?: number;
}

/** Prepara una organización mínima pero completa dentro del Firestore falso. */
export function seedOrganization(db: FakeFirestore, options: SeedOptions = {}) {
  const {
    productCost = 100,
    productPrice = 200,
    initialStock = 0,
    accountBalance = 100000,
    taxRate = 1500,
  } = options;

  db.write(COLLECTIONS.SETTINGS, ORG_ID, settings as unknown as Record<string, unknown>, false);

  db.write(
    COLLECTIONS.WAREHOUSES,
    WAREHOUSE_ID,
    {
      id: WAREHOUSE_ID,
      organizationId: ORG_ID,
      name: 'Bodega principal',
      code: 'MAIN',
      isDefault: true,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: USER_ID,
      updatedBy: USER_ID,
    },
    false,
  );

  const productId = 'prod-1';
  db.write(
    COLLECTIONS.PRODUCTS,
    productId,
    {
      id: productId,
      organizationId: ORG_ID,
      sku: 'TEST-001',
      barcode: null,
      name: 'Producto de prueba',
      searchName: normalizeSearch('Producto de prueba'),
      description: null,
      categoryId: null,
      categoryName: null,
      brand: null,
      unit: 'UNIT',
      imageUrl: null,
      imagePath: null,
      cost: toMinorUnits(productCost),
      averageCost: toMinorUnits(productCost),
      salePrice: toMinorUnits(productPrice),
      wholesalePrice: 0,
      taxRate,
      stock: toScaledQty(initialStock),
      minimumStock: toScaledQty(5),
      isLowStock: initialStock <= 5,
      tracksInventory: true,
      status: 'ACTIVE',
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
      updatedAt: now,
      createdBy: USER_ID,
      updatedBy: USER_ID,
    },
    false,
  );

  const accountId = 'acc-cash';
  db.write(
    COLLECTIONS.FINANCIAL_ACCOUNTS,
    accountId,
    {
      id: accountId,
      organizationId: ORG_ID,
      name: 'Caja general',
      type: 'CASH',
      currency: 'NIO',
      bankName: null,
      accountNumber: null,
      initialBalance: toMinorUnits(accountBalance),
      currentBalance: toMinorUnits(accountBalance),
      isDefault: true,
      status: 'ACTIVE',
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: USER_ID,
      updatedBy: USER_ID,
    },
    false,
  );

  const customerId = 'cust-1';
  db.write(
    COLLECTIONS.CUSTOMERS,
    customerId,
    {
      id: customerId,
      organizationId: ORG_ID,
      name: 'Cliente de prueba',
      searchName: normalizeSearch('Cliente de prueba'),
      documentType: 'CEDULA',
      document: '0011234567890X',
      phone: null,
      email: null,
      address: null,
      notes: null,
      creditLimit: toMinorUnits(50000),
      creditDays: 30,
      status: 'ACTIVE',
      stats: { totalAmount: 0, documentCount: 0, outstandingBalance: 0, lastDocumentAt: null },
      createdAt: now,
      updatedAt: now,
      createdBy: USER_ID,
      updatedBy: USER_ID,
    },
    false,
  );

  const supplierId = 'supp-1';
  db.write(
    COLLECTIONS.SUPPLIERS,
    supplierId,
    {
      id: supplierId,
      organizationId: ORG_ID,
      name: 'Proveedor de prueba',
      searchName: normalizeSearch('Proveedor de prueba'),
      documentType: 'RUC',
      document: 'J0310000000001',
      contactName: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      creditDays: 30,
      status: 'ACTIVE',
      stats: { totalAmount: 0, documentCount: 0, outstandingBalance: 0, lastDocumentAt: null },
      createdAt: now,
      updatedAt: now,
      createdBy: USER_ID,
      updatedBy: USER_ID,
    },
    false,
  );

  const expenseCategoryId = 'expcat-1';
  db.write(
    COLLECTIONS.EXPENSE_CATEGORIES,
    expenseCategoryId,
    {
      id: expenseCategoryId,
      organizationId: ORG_ID,
      name: 'Alquiler',
      description: null,
      isSystem: true,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: USER_ID,
      updatedBy: USER_ID,
    },
    false,
  );

  return { productId, accountId, customerId, supplierId, expenseCategoryId };
}

// ---------------------------------------------------------------------------
// Tienda online
// ---------------------------------------------------------------------------

export const STORE_SLUG = 'tienda-test';

export interface SeedStoreOptions {
  /** Zonas de envío. Por defecto, una zona con costo. */
  shippingCost?: number;
  /** Productos que se publican en la vitrina. */
  productIds?: string[];
  /** Precio de oferta de la ficha (unidad mayor). `0` = sin oferta. */
  listingSalePrice?: number;
  status?: 'DRAFT' | 'PUBLISHED';
}

/** Publica una tienda con un producto en vitrina, lista para recibir pedidos. */
export function seedStore(db: FakeFirestore, options: SeedStoreOptions = {}) {
  const {
    shippingCost = 50,
    productIds = ['prod-1'],
    listingSalePrice = 0,
    status = 'PUBLISHED',
  } = options;

  const zoneId = 'zone-managua';

  db.write(
    COLLECTIONS.STORE_SETTINGS,
    ORG_ID,
    {
      id: ORG_ID,
      organizationId: ORG_ID,
      slug: STORE_SLUG,
      status,
      branding: {
        name: 'Tienda de prueba',
        logoUrl: null,
        accentColor: '#111111',
        marqueeText: null,
        whatsapp: null,
        currencySymbol: 'C$',
        variantLabel: 'TALLA',
        cartTitle: 'TU CARRITO',
      },
      features: {
        hero: true,
        discounts: true,
        popups: true,
        whatsappButton: true,
        showStock: false,
      },
      heroSlides: [],
      shippingZones: [{ id: zoneId, label: 'Managua', cost: toMinorUnits(shippingCost) }],
      paymentInstructions: [{ id: 'pay-1', label: 'BAC', detail: '000-0000', notes: null }],
      seoDescription: null,
      shippingProductId: null,
      warehouseId: WAREHOUSE_ID,
      defaultAccountId: null,
      createdAt: now,
      updatedAt: now,
      updatedBy: USER_ID,
    },
    false,
  );

  const [mainProductId, ...variantProductIds] = productIds;

  db.write(
    COLLECTIONS.STORE_LISTINGS,
    `${ORG_ID}_${mainProductId}`,
    {
      id: `${ORG_ID}_${mainProductId}`,
      organizationId: ORG_ID,
      productId: mainProductId,
      title: 'Producto en vitrina',
      searchTitle: normalizeSearch('Producto en vitrina'),
      description: null,
      details: [],
      images: [],
      collection: null,
      variants: variantProductIds.map((id, index) => ({
        label: `V${index + 1}`,
        productId: id,
      })),
      salePrice: toMinorUnits(listingSalePrice),
      featured: false,
      position: 1,
      visible: true,
      createdAt: now,
      updatedAt: now,
      createdBy: USER_ID,
      updatedBy: USER_ID,
    },
    false,
  );

  return { zoneId, listingId: `${ORG_ID}_${mainProductId}` };
}

/** Cupón de la tienda, para probar el descuento y su liberación al rechazar. */
export function seedDiscount(
  db: FakeFirestore,
  options: {
    code?: string;
    kind?: 'PERCENT' | 'AMOUNT';
    value: number;
    maxUses?: number;
    /** Compra mínima en unidad mayor para que el cupón aplique. */
    minimumPurchase?: number;
  },
) {
  const { code = 'PROMO10', kind = 'PERCENT', value, maxUses = 0, minimumPurchase = 0 } = options;
  const id = `disc-${code.toLowerCase()}`;

  db.write(
    COLLECTIONS.STORE_DISCOUNTS,
    id,
    {
      id,
      organizationId: ORG_ID,
      code,
      // El porcentaje viaja en puntos base; el monto fijo, en centavos.
      value: kind === 'PERCENT' ? value * 100 : toMinorUnits(value),
      kind,
      minimumPurchase: toMinorUnits(minimumPurchase),
      maxUses,
      usedCount: 0,
      expiresAt: null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: USER_ID,
      updatedBy: USER_ID,
    },
    false,
  );

  return { id, code };
}

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

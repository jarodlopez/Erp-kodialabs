/**
 * Seed de desarrollo.
 *
 * Crea una organización completa con datos realistas para poder probar el ERP
 * de extremo a extremo: usuarios y roles, catálogo, clientes, proveedores,
 * cuentas financieras, compras recibidas, ventas cobradas y gastos.
 *
 * Uso:
 *   npm run seed                 (contra el proyecto configurado en .env.local)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed   (contra emuladores)
 *
 * NUNCA se ejecuta automáticamente: hay que invocarlo a mano y se bloquea si
 * NODE_ENV es "production" salvo que se pase --force.
 */
import { getAdminAuth, getDb } from '../src/lib/firebase/admin';
import { COLLECTIONS } from '../src/lib/firebase/collections';
import { nowIso, normalizeSearch } from '../src/lib/repositories/base';
import { toMinorUnits, toScaledQty } from '../src/lib/money';
import { DEFAULT_SETTINGS } from '../src/lib/repositories/organization';
import { purchaseService } from '../src/lib/services/purchases';
import { saleService } from '../src/lib/services/sales';
import { expenseService } from '../src/lib/services/expenses';
import { DEFAULT_EXPENSE_CATEGORIES } from '../src/types/expenses';
import type { ActorContext } from '../src/types/common';
import type { Settings } from '../src/types/organization';

const FORCE = process.argv.includes('--force');

if (process.env.NODE_ENV === 'production' && !FORCE) {
  console.error('El seed no puede ejecutarse en producción. Usa --force solo si sabes lo que haces.');
  process.exit(1);
}

const ORG_NAME = process.env.SEED_ORG_NAME ?? 'HomeMart';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@homemart.test';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

const CATEGORIES = [
  { name: 'Ferretería', color: '#4f46e5' },
  { name: 'Limpieza', color: '#12b76a' },
  { name: 'Electricidad', color: '#f79009' },
  { name: 'Pinturas', color: '#f04438' },
  { name: 'Jardinería', color: '#06aed4' },
];

const PRODUCTS = [
  { sku: 'FER-001', name: 'Martillo de carpintero 16 oz', category: 'Ferretería', cost: 180, price: 320, unit: 'UNIT' },
  { sku: 'FER-002', name: 'Juego de destornilladores 6 piezas', category: 'Ferretería', cost: 250, price: 450, unit: 'PACK' },
  { sku: 'FER-003', name: 'Cinta métrica 5 m', category: 'Ferretería', cost: 95, price: 175, unit: 'UNIT' },
  { sku: 'LIM-001', name: 'Detergente multiusos 1 L', category: 'Limpieza', cost: 55, price: 95, unit: 'LITER' },
  { sku: 'LIM-002', name: 'Escoba de cerdas suaves', category: 'Limpieza', cost: 70, price: 130, unit: 'UNIT' },
  { sku: 'ELE-001', name: 'Bombillo LED 9 W', category: 'Electricidad', cost: 45, price: 85, unit: 'UNIT' },
  { sku: 'ELE-002', name: 'Rollo de cable THHN 12 (100 m)', category: 'Electricidad', cost: 1850, price: 2650, unit: 'UNIT' },
  { sku: 'PIN-001', name: 'Pintura acrílica blanca 1 gal', category: 'Pinturas', cost: 620, price: 950, unit: 'UNIT' },
  { sku: 'PIN-002', name: 'Brocha 3 pulgadas', category: 'Pinturas', cost: 60, price: 120, unit: 'UNIT' },
  { sku: 'JAR-001', name: 'Manguera de jardín 15 m', category: 'Jardinería', cost: 480, price: 790, unit: 'UNIT' },
];

const CUSTOMERS = [
  { name: 'Constructora El Roble S.A.', document: 'J0310000012345', phone: '2255-4433', creditDays: 30, creditLimit: 50000 },
  { name: 'Ferretería Los Pinos', document: '0011809900001A', phone: '8844-1122', creditDays: 15, creditLimit: 20000 },
  { name: 'María Jiménez', document: '0012211900002B', phone: '8712-9080', creditDays: 0, creditLimit: 0 },
  { name: 'Servicios Eléctricos Delta', document: 'J0310000098765', phone: '2278-3311', creditDays: 30, creditLimit: 35000 },
];

const SUPPLIERS = [
  { name: 'Distribuidora Industrial S.A.', document: 'J0310000055555', contact: 'Carlos Ruiz', creditDays: 30 },
  { name: 'Importaciones del Norte', document: 'J0310000066666', contact: 'Lucía Ortega', creditDays: 15 },
  { name: 'Químicos y Limpieza Nica', document: 'J0310000077777', contact: 'Pedro Salas', creditDays: 30 },
];

async function main() {
  const db = getDb();
  const auth = getAdminAuth();
  const timestamp = nowIso();

  console.log('Creando usuario administrador...');
  let uid: string;
  const existing = await auth.getUserByEmail(ADMIN_EMAIL).catch(() => null);
  if (existing) {
    uid = existing.uid;
    await auth.updateUser(uid, { password: ADMIN_PASSWORD, displayName: 'Administrador' });
  } else {
    const created = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: 'Administrador',
      emailVerified: true,
    });
    uid = created.uid;
  }

  console.log('Creando organización...');
  const orgRef = db.collection(COLLECTIONS.ORGANIZATIONS).doc();
  const organizationId = orgRef.id;

  const batch = db.batch();

  batch.create(orgRef, {
    id: organizationId,
    name: ORG_NAME,
    legalName: `${ORG_NAME} S.A.`,
    taxId: 'J0310000011111',
    email: ADMIN_EMAIL,
    phone: '2255-0000',
    address: 'Managua, Nicaragua',
    logoUrl: null,
    currency: 'NIO',
    locale: 'es-NI',
    timezone: 'America/Managua',
    status: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: uid,
    updatedBy: uid,
  });

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    id: organizationId,
    organizationId,
    updatedAt: timestamp,
    updatedBy: uid,
  };
  batch.set(db.collection(COLLECTIONS.SETTINGS).doc(organizationId), settings);

  const warehouseRef = db.collection(COLLECTIONS.WAREHOUSES).doc();
  batch.create(warehouseRef, {
    id: warehouseRef.id,
    organizationId,
    name: 'Bodega principal',
    code: 'MAIN',
    address: null,
    isDefault: true,
    status: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: uid,
    updatedBy: uid,
  });

  const taxRef = db.collection(COLLECTIONS.TAXES).doc();
  batch.create(taxRef, {
    id: taxRef.id,
    organizationId,
    name: 'IVA 15%',
    rate: 1500,
    isDefault: true,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: uid,
    updatedBy: uid,
  });

  batch.set(db.collection(COLLECTIONS.USERS).doc(uid), {
    id: uid,
    email: ADMIN_EMAIL,
    displayName: 'Administrador',
    phone: null,
    photoUrl: null,
    organizationId,
    organizationIds: [organizationId],
    role: 'ADMIN',
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: uid,
    updatedBy: uid,
  });

  batch.set(db.collection(COLLECTIONS.MEMBERSHIPS).doc(`${organizationId}_${uid}`), {
    id: `${organizationId}_${uid}`,
    organizationId,
    userId: uid,
    email: ADMIN_EMAIL,
    displayName: 'Administrador',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: uid,
    updatedBy: uid,
  });

  // Categorías de gasto
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    const ref = db.collection(COLLECTIONS.EXPENSE_CATEGORIES).doc();
    batch.create(ref, {
      id: ref.id,
      organizationId,
      name,
      description: null,
      isSystem: true,
      status: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: uid,
      updatedBy: uid,
    });
  }

  // Categorías de producto
  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const ref = db.collection(COLLECTIONS.CATEGORIES).doc();
    categoryIds.set(category.name, ref.id);
    batch.create(ref, {
      id: ref.id,
      organizationId,
      name: category.name,
      description: null,
      parentId: null,
      color: category.color,
      status: 'ACTIVE',
      productCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: uid,
      updatedBy: uid,
    });
  }

  // Cuentas financieras
  const accountIds: string[] = [];
  for (const account of [
    { name: 'Caja general', type: 'CASH', balance: 25000, isDefault: true },
    { name: 'BAC — Cuenta corriente', type: 'BANK', balance: 180000, isDefault: false },
  ]) {
    const ref = db.collection(COLLECTIONS.FINANCIAL_ACCOUNTS).doc();
    accountIds.push(ref.id);
    const initial = toMinorUnits(account.balance);
    batch.create(ref, {
      id: ref.id,
      organizationId,
      name: account.name,
      type: account.type,
      currency: 'NIO',
      bankName: account.type === 'BANK' ? 'BAC Credomatic' : null,
      accountNumber: account.type === 'BANK' ? '1234567890' : null,
      initialBalance: initial,
      currentBalance: initial,
      isDefault: account.isDefault,
      status: 'ACTIVE',
      notes: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: uid,
      updatedBy: uid,
    });

    const ledgerRef = db.collection(COLLECTIONS.FINANCIAL_TRANSACTIONS).doc();
    batch.create(ledgerRef, {
      id: ledgerRef.id,
      organizationId,
      type: 'OPENING_BALANCE',
      referenceType: 'ACCOUNT',
      referenceId: ref.id,
      referenceNumber: null,
      accountId: ref.id,
      accountName: account.name,
      amount: initial,
      direction: 'IN',
      balanceAfter: initial,
      date: timestamp,
      description: `Saldo inicial de ${account.name}`,
      transferId: null,
      createdBy: uid,
      createdByName: 'Seed',
      createdAt: timestamp,
    });
  }

  // Productos
  const productIds: string[] = [];
  for (const product of PRODUCTS) {
    const ref = db.collection(COLLECTIONS.PRODUCTS).doc();
    productIds.push(ref.id);
    batch.create(ref, {
      id: ref.id,
      organizationId,
      sku: product.sku,
      barcode: `750${product.sku.replace(/\D/g, '').padStart(10, '0')}`,
      name: product.name,
      searchName: normalizeSearch(product.name),
      description: null,
      categoryId: categoryIds.get(product.category) ?? null,
      categoryName: product.category,
      brand: null,
      unit: product.unit,
      imageUrl: null,
      imagePath: null,
      cost: toMinorUnits(product.cost),
      averageCost: toMinorUnits(product.cost),
      salePrice: toMinorUnits(product.price),
      wholesalePrice: toMinorUnits(product.price * 0.9),
      taxRate: 1500,
      stock: 0,
      minimumStock: toScaledQty(5),
      isLowStock: true,
      tracksInventory: true,
      status: 'ACTIVE',
      deletedAt: null,
      deletedBy: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: uid,
      updatedBy: uid,
    });
  }

  // Clientes
  const customerIds: string[] = [];
  for (const customer of CUSTOMERS) {
    const ref = db.collection(COLLECTIONS.CUSTOMERS).doc();
    customerIds.push(ref.id);
    batch.create(ref, {
      id: ref.id,
      organizationId,
      name: customer.name,
      searchName: normalizeSearch(customer.name),
      documentType: customer.document.startsWith('J') ? 'RUC' : 'CEDULA',
      document: customer.document,
      phone: customer.phone,
      email: null,
      address: null,
      notes: null,
      creditLimit: toMinorUnits(customer.creditLimit),
      creditDays: customer.creditDays,
      status: 'ACTIVE',
      stats: { totalAmount: 0, documentCount: 0, outstandingBalance: 0, lastDocumentAt: null },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: uid,
      updatedBy: uid,
    });
  }

  // Proveedores
  const supplierIds: string[] = [];
  for (const supplier of SUPPLIERS) {
    const ref = db.collection(COLLECTIONS.SUPPLIERS).doc();
    supplierIds.push(ref.id);
    batch.create(ref, {
      id: ref.id,
      organizationId,
      name: supplier.name,
      searchName: normalizeSearch(supplier.name),
      documentType: 'RUC',
      document: supplier.document,
      contactName: supplier.contact,
      phone: '2255-1000',
      email: null,
      address: null,
      notes: null,
      creditDays: supplier.creditDays,
      status: 'ACTIVE',
      stats: { totalAmount: 0, documentCount: 0, outstandingBalance: 0, lastDocumentAt: null },
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: uid,
      updatedBy: uid,
    });
  }

  await batch.commit();

  await auth.setCustomUserClaims(uid, {
    organizationId,
    role: 'ADMIN',
    name: 'Administrador',
  });

  console.log('Registrando operaciones de ejemplo...');

  const actor: ActorContext = {
    userId: uid,
    organizationId,
    email: ADMIN_EMAIL,
    role: 'ADMIN',
    permissions: [],
  };

  const ctx = {
    actor,
    actorName: 'Administrador',
    settings,
    defaultWarehouseId: warehouseRef.id,
  };

  // Compra recibida: ingresa inventario y fija el costo promedio.
  const purchase = await purchaseService.createPurchase(
    ctx,
    {
      supplierId: supplierIds[0],
      invoiceNumber: 'F-100234',
      date: daysAgo(20),
      type: 'CREDIT',
      items: PRODUCTS.slice(0, 6).map((product, index) => ({
        productId: productIds[index],
        quantity: 20,
        unitCost: product.cost,
      })),
      shipping: 1500,
    },
    { receive: true },
  );

  // Se paga por completo desde la cuenta bancaria.
  await purchaseService.registerPayment(
    ctx,
    purchase.purchaseId,
    {
      accountId: accountIds[1],
      amount: purchase.total / 100,
      method: 'TRANSFER',
      date: daysAgo(19),
    },
    `seed-pay-${purchase.purchaseId}`,
  );
  console.log(`  Compra ${purchase.number} recibida y pagada.`);

  // Segunda compra a crédito, para generar cuentas por pagar.
  const purchase2 = await purchaseService.createPurchase(
    ctx,
    {
      supplierId: supplierIds[1],
      invoiceNumber: 'F-200145',
      date: daysAgo(12),
      type: 'CREDIT',
      items: PRODUCTS.slice(6).map((product, index) => ({
        productId: productIds[index + 6],
        quantity: 15,
        unitCost: product.cost,
      })),
    },
    { receive: true },
  );
  console.log(`  Compra ${purchase2.number} recibida a crédito.`);

  // Ventas de contado y a crédito.
  const sale1 = await saleService.createSale(
    ctx,
    {
      customerId: customerIds[2],
      date: daysAgo(8),
      type: 'CASH',
      items: [
        { productId: productIds[0], quantity: 2 },
        { productId: productIds[5], quantity: 6 },
      ],
    },
    { confirm: false },
  );
  await saleService.confirmSale(
    ctx,
    sale1.saleId,
    { accountId: accountIds[0], amount: sale1.total / 100, method: 'CASH' },
    `seed-confirm-${sale1.saleId}`,
  );
  console.log(`  Venta ${sale1.number} confirmada y cobrada.`);

  const sale2 = await saleService.createSale(
    ctx,
    {
      customerId: customerIds[0],
      date: daysAgo(5),
      type: 'CREDIT',
      items: [
        { productId: productIds[6], quantity: 3 },
        { productId: productIds[7], quantity: 4 },
        { productId: productIds[1], quantity: 2 },
      ],
    },
    { confirm: true },
  );
  console.log(`  Venta ${sale2.number} a crédito registrada.`);

  const sale3 = await saleService.createSale(
    ctx,
    {
      customerId: customerIds[1],
      date: daysAgo(2),
      type: 'CREDIT',
      items: [{ productId: productIds[9], quantity: 2 }],
      payment: { accountId: accountIds[0], amount: 500, method: 'CASH' },
    },
    { confirm: true },
  );
  console.log(`  Venta ${sale3.number} con abono parcial.`);

  // Gastos
  const expenseCategories = await db
    .collection(COLLECTIONS.EXPENSE_CATEGORIES)
    .where('organizationId', '==', organizationId)
    .get();
  const rent = expenseCategories.docs.find((doc) => doc.data().name === 'Alquiler');
  const power = expenseCategories.docs.find((doc) => doc.data().name === 'Electricidad');

  if (rent) {
    await expenseService.createExpense(
      { actor, actorName: 'Administrador', settings },
      {
        categoryId: rent.id,
        description: 'Alquiler del local — mes corriente',
        amount: 12000,
        date: daysAgo(10),
        payNow: true,
        accountId: accountIds[1],
        method: 'TRANSFER',
      },
      'seed-expense-rent',
    );
  }

  if (power) {
    await expenseService.createExpense(
      { actor, actorName: 'Administrador', settings },
      {
        categoryId: power.id,
        description: 'Energía eléctrica',
        amount: 3400,
        date: daysAgo(6),
        payNow: true,
        accountId: accountIds[0],
        method: 'CASH',
      },
      'seed-expense-power',
    );
  }

  console.log('  Gastos registrados.');

  console.log('\nSeed completado.');
  console.log(`  Organización: ${ORG_NAME} (${organizationId})`);
  console.log(`  Usuario:      ${ADMIN_EMAIL}`);
  console.log(`  Contraseña:   ${ADMIN_PASSWORD}`);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('El seed falló:', error);
    process.exit(1);
  });

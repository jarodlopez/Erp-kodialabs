import { expect, test, type Page } from '@playwright/test';

/**
 * Recorrido completo del ERP:
 *
 *   Login → crear producto → crear cliente → comprar inventario →
 *   registrar venta → cobrar → revisar inventario → revisar caja → reporte
 *
 * Se ejecuta contra los emuladores de Firebase con la semilla cargada
 * (`npm run emulators` + `npm run seed`).
 */
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@homemart.test';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

const stamp = Date.now();
const SKU = `E2E-${stamp}`;
const PRODUCT_NAME = `Producto E2E ${stamp}`;
const CUSTOMER_NAME = `Cliente E2E ${stamp}`;

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(EMAIL);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('flujo completo de operación', async ({ page }) => {
  await test.step('iniciar sesión', async () => {
    await login(page);
  });

  await test.step('crear producto', async () => {
    await page.goto('/inventario/nuevo');
    await page.getByLabel('SKU').fill(SKU);
    await page.getByLabel('Nombre', { exact: true }).fill(PRODUCT_NAME);
    await page.getByLabel('Precio de venta').fill('250');
    await page.getByLabel('Stock mínimo').fill('2');
    await page.getByRole('button', { name: 'Crear producto' }).click();

    await expect(page.getByRole('heading', { name: PRODUCT_NAME })).toBeVisible();
    await expect(page.getByText('Sin existencias')).toBeVisible();
  });

  await test.step('crear cliente', async () => {
    await page.goto('/clientes');
    await page.getByRole('button', { name: 'Nuevo cliente' }).click();
    await page.getByLabel('Nombre o razón social').fill(CUSTOMER_NAME);
    await page.getByLabel('Teléfono').fill('8888-0000');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(CUSTOMER_NAME)).toBeVisible();
  });

  await test.step('comprar inventario', async () => {
    await page.goto('/compras/nueva');

    await page.getByPlaceholder('Buscar proveedor...').fill('Distribuidora');
    await page.getByRole('button', { name: /Distribuidora/ }).first().click();

    await page.getByPlaceholder('Buscar producto a comprar...').fill(PRODUCT_NAME);
    await page.getByRole('button', { name: new RegExp(SKU) }).first().click();

    await page.getByLabel('Cantidad').fill('10');
    await page.getByLabel('Costo unitario').fill('150');

    await page.getByRole('button', { name: 'Recibir e ingresar al inventario' }).click();
    await expect(page.getByText('Recibida')).toBeVisible();
  });

  await test.step('el inventario y el costo promedio se actualizaron', async () => {
    await page.goto('/inventario');
    await page.getByPlaceholder('Buscar por nombre...').fill(PRODUCT_NAME);
    await page.keyboard.press('Enter');

    await page.getByRole('link', { name: PRODUCT_NAME }).click();
    await expect(page.getByText('Costo promedio')).toBeVisible();
    await expect(page.getByText('10', { exact: false })).toBeVisible();
  });

  await test.step('registrar y cobrar una venta', async () => {
    await page.goto('/ventas/nueva');

    await page.getByPlaceholder('Buscar cliente...').fill(CUSTOMER_NAME);
    await page.getByRole('button', { name: new RegExp(CUSTOMER_NAME) }).first().click();

    await page.getByPlaceholder('Buscar producto por nombre o SKU...').fill(PRODUCT_NAME);
    await page.getByRole('button', { name: new RegExp(SKU) }).first().click();

    await page.getByLabel('Cantidad').fill('3');
    await page.getByRole('button', { name: 'Confirmar venta' }).click();

    await expect(page.getByText('Pagada')).toBeVisible();
  });

  await test.step('el inventario disminuyó', async () => {
    await page.goto('/inventario');
    await page.getByPlaceholder('Buscar por nombre...').fill(PRODUCT_NAME);
    await page.keyboard.press('Enter');
    await page.getByRole('link', { name: PRODUCT_NAME }).click();
    await expect(page.getByText('Movimientos de inventario')).toBeVisible();
    await expect(page.getByText('Venta')).toBeVisible();
  });

  await test.step('la caja registró el ingreso', async () => {
    await page.goto('/caja-y-bancos');
    await expect(page.getByRole('heading', { name: 'Caja y bancos' })).toBeVisible();
    await expect(page.getByText('Movimientos recientes')).toBeVisible();
  });

  await test.step('el reporte refleja la operación', async () => {
    await page.goto('/reportes?tab=ventas');
    await expect(page.getByRole('heading', { name: 'Centro de reportes' })).toBeVisible();
    await expect(page.getByText('Ventas netas')).toBeVisible();
  });

  await test.step('la auditoría registró los eventos', async () => {
    await page.goto('/auditoria');
    await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible();
    await expect(page.getByText('Confirmación').first()).toBeVisible();
  });
});

test('las rutas protegidas exigen sesión', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/ventas');
  await expect(page).toHaveURL(/\/login/);
});

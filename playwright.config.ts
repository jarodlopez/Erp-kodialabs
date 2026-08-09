import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de las pruebas end-to-end.
 *
 * Requisitos para ejecutarlas:
 *   1. Emuladores de Firebase corriendo:   npm run emulators
 *   2. Semilla de datos:                   npm run seed
 *   3. Variables en `.env.local` con NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
 *
 * Después:  npm run test:e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-NI',
    timezoneId: 'America/Managua',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

import next from 'eslint-config-next';

/**
 * Configuración de ESLint (flat config).
 * El linting es una herramienta de calidad y no forma parte del build de
 * producción: Next 16 ya no ejecuta ESLint durante `next build`.
 */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...next,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Los scripts de línea de comandos sí informan por consola.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];

export default config;

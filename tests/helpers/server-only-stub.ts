/**
 * Sustituto de `server-only` para el entorno de pruebas.
 * En producción ese paquete impide que un módulo de servidor se importe desde
 * un Client Component; en Vitest no aplica esa distinción.
 */
export {};

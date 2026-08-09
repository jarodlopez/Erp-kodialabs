import { vi } from 'vitest';

import { fakeDb, FakeFieldValue, FakeTimestamp } from './fake-firestore';

/**
 * Setup global de Vitest.
 *
 * Sustituye Firestore por la implementación en memoria para poder ejercitar
 * los servicios de negocio completos —transacciones, contadores, idempotencia
 * y libro mayor— sin depender de red ni de emuladores.
 */
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: FakeFieldValue,
  Timestamp: FakeTimestamp,
  getFirestore: () => fakeDb,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getDb: () => fakeDb,
  getAdminApp: () => ({ name: 'test' }),
  getAdminAuth: () => ({
    setCustomUserClaims: async () => undefined,
    revokeRefreshTokens: async () => undefined,
    getUserByEmail: async () => null,
    createUser: async () => ({ uid: 'nuevo-usuario' }),
    updateUser: async () => undefined,
  }),
  getAdminStorage: () => ({}),
  getStorageBucket: () => ({}),
  isFirebaseConfigured: () => true,
}));

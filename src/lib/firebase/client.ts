'use client';

/**
 * Firebase Client SDK.
 *
 * En este ERP el cliente se usa EXCLUSIVAMENTE para:
 *  - autenticación (login, registro, recuperación y cambio de contraseña);
 *  - subida de archivos a Storage con las reglas de seguridad aplicadas.
 *
 * NINGUNA lectura ni escritura de datos de negocio ocurre directamente desde
 * el navegador: todo pasa por Server Actions / Route Handlers que usan el
 * Admin SDK, donde se validan permisos y se ejecutan las transacciones.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

import { resolveFirebaseWebConfig } from './config';

// Toma las variables `NEXT_PUBLIC_FIREBASE_*` si existen; si no, usa la
// configuración por defecto del proyecto (valores públicos, ver `config.ts`).
const config = resolveFirebaseWebConfig();

export function isClientConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.authDomain);
}

let emulatorsConnected = false;

export function getClientApp(): FirebaseApp {
  if (!isClientConfigured()) {
    throw new Error(
      'Firebase no está configurado. Define las variables NEXT_PUBLIC_FIREBASE_* en el entorno.',
    );
  }
  return getApps().length ? getApp() : initializeApp(config);
}

export function getClientAuth(): Auth {
  const auth = getAuth(getClientApp());
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' && !emulatorsConnected) {
    emulatorsConnected = true;
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectStorageEmulator(getStorage(getClientApp()), '127.0.0.1', 9199);
  }
  // La sesión de larga duración vive en una cookie httpOnly emitida por el
  // servidor; en el cliente basta con persistencia local para el refresco.
  void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  return auth;
}

export function getClientStorage(): FirebaseStorage {
  return getStorage(getClientApp());
}

/**
 * Inicialización centralizada del Firebase Admin SDK.
 *
 * ESTE MÓDULO SOLO PUEDE IMPORTARSE DESDE CÓDIGO DE SERVIDOR
 * (Server Components, Server Actions, Route Handlers, scripts).
 * Las credenciales del service account nunca llegan al navegador.
 *
 * Configuración soportada, en orden de prioridad:
 *  1. `FIREBASE_SERVICE_ACCOUNT_BASE64` — JSON completo en base64.
 *  2. `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`.
 *  3. Credenciales por defecto del entorno (`GOOGLE_APPLICATION_CREDENTIALS`)
 *     o emuladores locales.
 */
import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { errors } from '@/lib/errors';
import { DEFAULT_FIREBASE_WEB_CONFIG } from './config';

const APP_NAME = 'erp-admin';

/** Proyecto por defecto, tomado de la configuración web pública. */
function defaultProjectId(): string {
  return DEFAULT_FIREBASE_WEB_CONFIG.projectId;
}

function usingEmulators(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
}

function readServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64) {
    try {
      const json = JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (json.project_id && json.client_email && json.private_key) {
        return {
          projectId: json.project_id,
          clientEmail: json.client_email,
          privateKey: json.private_key.replace(/\\n/g, '\n'),
        };
      }
    } catch {
      throw errors.configuration(
        'Las credenciales de Firebase no son válidas.',
        'FIREBASE_SERVICE_ACCOUNT_BASE64 no contiene un JSON válido en base64.',
      );
    }
  }

  // El `projectId` puede omitirse: se toma de la configuración web por defecto.
  // Lo que siempre debe venir del entorno son las credenciales privadas.
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    defaultProjectId();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      // Vercel guarda los saltos de línea escapados.
      privateKey: privateKey.replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
    };
  }
  return null;
}

let cachedApp: App | null = null;

export function getAdminApp(): App {
  if (cachedApp) return cachedApp;

  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) {
    cachedApp = existing;
    return existing;
  }

  const serviceAccount = readServiceAccount();
  const projectId =
    serviceAccount?.projectId ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    defaultProjectId();

  if (!serviceAccount && !usingEmulators() && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw errors.configuration(
      'La aplicación no está conectada a Firebase. Falta configurar las credenciales del servidor.',
      'Define FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY (o FIREBASE_SERVICE_ACCOUNT_BASE64) en las variables de entorno.',
    );
  }

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ??
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    DEFAULT_FIREBASE_WEB_CONFIG.storageBucket;

  cachedApp = initializeApp(
    {
      ...(serviceAccount
        ? {
            credential: cert({
              projectId: serviceAccount.projectId,
              clientEmail: serviceAccount.clientEmail,
              privateKey: serviceAccount.privateKey,
            }),
          }
        : {}),
      projectId,
      storageBucket,
    },
    APP_NAME,
  );

  return cachedApp;
}

let cachedDb: Firestore | null = null;

export function getDb(): Firestore {
  if (cachedDb) return cachedDb;
  const db = getFirestore(getAdminApp());
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // `settings` solo puede llamarse una vez; si ya fue configurado, seguimos.
  }
  cachedDb = db;
  return db;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}

export function getStorageBucket() {
  return getAdminStorage().bucket();
}

/** Verifica que el entorno tenga credenciales, sin lanzar excepción. */
export function isFirebaseConfigured(): boolean {
  try {
    getAdminApp();
    return true;
  } catch {
    return false;
  }
}

export { getApp, getApps };

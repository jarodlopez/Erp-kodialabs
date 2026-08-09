/**
 * Configuración web de Firebase.
 *
 * Estos valores son PÚBLICOS por diseño: el SDK de Firebase los incrusta en el
 * bundle del navegador y cualquiera puede leerlos. No son un secreto y no
 * otorgan acceso por sí solos — la seguridad la imponen las Security Rules de
 * Firestore y Storage, y el hecho de que en este ERP todas las operaciones de
 * negocio se ejecutan en el servidor con el Admin SDK.
 *
 * Lo que SÍ es secreto y NUNCA debe vivir en el código son las credenciales del
 * service account (`FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY`), que solo
 * se leen desde variables de entorno del servidor.
 *
 * Prioridad: si existen las variables `NEXT_PUBLIC_FIREBASE_*` se usan esas;
 * si no, se toman estos valores por defecto. Así el proyecto funciona sin
 * configurar nada en Vercel, pero sigue siendo posible apuntarlo a otro
 * proyecto de Firebase sin tocar el código.
 */
export const DEFAULT_FIREBASE_WEB_CONFIG = {
  apiKey: 'AIzaSyAV6gMO1QyqJYoHJlozC0daho8H3nAMDts',
  authDomain: 'control-de-59fbd.firebaseapp.com',
  projectId: 'control-de-59fbd',
  storageBucket: 'control-de-59fbd.firebasestorage.app',
  messagingSenderId: '735571263188',
  appId: '1:735571263188:web:4c028eb727ef1c83d5c541',
} as const;

/** Configuración efectiva del cliente: entorno primero, valores por defecto después. */
export function resolveFirebaseWebConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || DEFAULT_FIREBASE_WEB_CONFIG.apiKey,
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_WEB_CONFIG.authDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_WEB_CONFIG.projectId,
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_WEB_CONFIG.storageBucket,
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
      DEFAULT_FIREBASE_WEB_CONFIG.messagingSenderId,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || DEFAULT_FIREBASE_WEB_CONFIG.appId,
  };
}

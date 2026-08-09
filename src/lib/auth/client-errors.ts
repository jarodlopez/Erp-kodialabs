/**
 * Traduce los códigos de error de Firebase Auth a mensajes en español,
 * sin exponer detalles técnicos al usuario final.
 */
const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'El correo electrónico no tiene un formato válido.',
  'auth/user-disabled': 'Este usuario está desactivado. Contacta al administrador.',
  'auth/user-not-found': 'No encontramos una cuenta con ese correo.',
  'auth/wrong-password': 'La contraseña es incorrecta.',
  'auth/invalid-credential': 'El correo o la contraseña son incorrectos.',
  'auth/invalid-login-credentials': 'El correo o la contraseña son incorrectos.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
  'auth/weak-password': 'La contraseña es demasiado débil.',
  'auth/too-many-requests': 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
  'auth/network-request-failed': 'No hay conexión con el servidor. Revisa tu red.',
  'auth/requires-recent-login': 'Por seguridad, vuelve a iniciar sesión antes de hacer este cambio.',
  'auth/operation-not-allowed': 'El acceso con correo y contraseña no está habilitado en Firebase.',
  'auth/api-key-not-valid': 'La configuración de Firebase no es válida. Revisa las variables de entorno.',
};

export function translateAuthError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    if (MESSAGES[code]) return MESSAGES[code];
  }
  if (error instanceof Error) {
    for (const [code, message] of Object.entries(MESSAGES)) {
      if (error.message.includes(code)) return message;
    }
    if (/Firebase no está configurado/.test(error.message)) return error.message;
  }
  return 'No pudimos completar la operación. Intenta nuevamente.';
}

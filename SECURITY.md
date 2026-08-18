# Seguridad

## Modelo de amenazas asumido

El navegador es **hostil**: cualquier usuario autenticado puede abrir la consola,
llamar a Server Actions con parámetros arbitrarios, intentar leer Firestore
directamente o manipular identificadores de documentos. El diseño parte de esa
premisa.

---

## 1. Autenticación

- Firebase Authentication con correo y contraseña.
- El cliente obtiene un `idToken` y lo envía **una sola vez** al servidor, que lo
  verifica con el Admin SDK y emite una **cookie de sesión** `httpOnly`, `secure`
  y `sameSite=lax`. JavaScript no puede leerla, lo que neutraliza el robo de sesión
  por XSS.
- Se rechazan tokens con más de 5 minutos de antigüedad al crear la sesión.
- La cookie tiene vigencia configurable (5 días por defecto, máximo 14).
- `verifySessionCookie(cookie, checkRevoked)` se ejecuta en cada petición. Con
  `SESSION_CHECK_REVOKED` activado (valor por defecto) se comprueba además que los
  tokens no hayan sido revocados, de modo que desactivar un usuario o cambiarle el
  rol surte efecto de inmediato.
- El flujo está preparado para añadir OAuth: solo cambia el proveedor que emite el
  `idToken`; el resto de la cadena es idéntico.

## 2. Autorización (RBAC)

Seis roles — `ADMIN`, `MANAGER`, `SALES`, `WAREHOUSE`, `ACCOUNTANT`, `RIDER` — y
más de cincuenta permisos granulares definidos en `src/lib/rbac.ts`.

- El rol viaja en los *custom claims* del token, por lo que también las Security
  Rules pueden evaluarlo.
- **Toda** Server Action y **todo** Route Handler empieza con
  `requirePermission(PERMISSIONS.X)`. Si falta el permiso, se lanza `FORBIDDEN`
  antes de tocar la base de datos.
- La interfaz oculta lo que el usuario no puede hacer, pero eso es una comodidad,
  no un control: el servidor vuelve a verificarlo siempre.
- Al cambiar un rol se revocan los tokens del usuario para forzar la renovación de
  permisos.

Separación de responsabilidades verificada por pruebas: ventas no puede recibir
compras ni ajustar inventario; bodega no puede cobrar ni ver finanzas; contabilidad
no puede crear ventas; solo el administrador gestiona usuarios.

**`RIDER` es el rol más restringido del sistema, y a propósito.** Tiene un único
permiso (`delivery.ride`), no entra al panel —el layout del área protegida lo
redirige a su vista de reparto— y no puede leer inventario, ventas ni finanzas.
La razón es concreta: el teléfono de un repartidor se presta, se pierde y se
revende, así que la sesión que corre ahí no puede ser una puerta al negocio.
Tener el permiso tampoco alcanza para tocar cualquier reparto: el servidor
comprueba en cada operación —salir, marcar posición, cerrar— que el reparto esté
asignado a quien la pide, de modo que un rider no puede ver el cliente, la
dirección ni el teléfono del reparto de un compañero cambiando el id de la URL.

## 3. Aislamiento entre organizaciones

Defensa en profundidad, en cuatro capas:

1. La sesión resuelve el `organizationId` desde el token, **nunca** desde un
   parámetro enviado por el cliente.
2. Cada consulta filtra por `organizationId`.
3. Cada lectura de documento individual verifica la pertenencia antes de operar y
   lanza `ORGANIZATION_MISMATCH` si no coincide.
4. Las Security Rules bloquean cualquier lectura fuera de la organización.

Manipular el ID de un documento de otra organización produce un error, no una fuga
de datos. Hay una prueba automatizada que lo comprueba.

## 4. Security Rules

**Firestore** ([`firestore.rules`](./firestore.rules)):

- **Escritura prohibida desde el cliente en todas las colecciones, sin excepción.**
  Solo el Admin SDK —que no evalúa reglas— escribe, y siempre tras validar
  permisos.
- Lectura permitida únicamente sobre documentos de la propia organización.
- `auditLogs`: lectura restringida a `ADMIN` y `ACCOUNTANT`; `update` y `delete`
  prohibidos para todos, sin excepción.
- `counters` e `idempotencyKeys`: sin acceso alguno desde el cliente.
- Regla de cierre `match /{document=**} { allow read, write: if false; }`: cualquier
  colección nueva nace bloqueada.

**Storage** ([`storage.rules`](./storage.rules)): lectura restringida a los archivos
de la propia organización; escritura prohibida desde el navegador.

En ningún punto existe `allow read, write: if true;`.

## 5. Validación de entrada

- Esquemas Zod en `src/lib/validation/schemas.ts`, usados en el cliente (respuesta
  inmediata) y en el servidor (**autoritativa**).
- Los errores se devuelven mapeados por campo y se pintan junto al input.
- Además de la forma, se validan reglas de negocio: existencia y estado de los
  productos, stock disponible, saldo de la cuenta, que un cobro no exceda el
  pendiente, que una devolución no supere lo vendido, y las transiciones de estado.

## 6. Protección contra duplicados

Cada operación crítica acepta una clave de idempotencia; el servidor la registra
dentro de la transacción. Un doble clic o un reintento de red devuelve el resultado
original en lugar de crear un segundo documento. Los botones se deshabilitan durante
el envío como refuerzo, no como control.

## 7. Secretos

- La configuración web (`apiKey`, `appId`, `projectId`…) vive en el código
  (`src/lib/firebase/config.ts`) porque **es pública por diseño**: Firebase la
  incrusta en el bundle del navegador y está pensada para ser visible. No
  concede acceso por sí sola; quien la use seguirá topándose con las Security
  Rules y con el hecho de que toda operación de negocio se ejecuta en el
  servidor.
- Las credenciales del Admin SDK —lo que sí es secreto— solo existen en
  variables **sin** el prefijo `NEXT_PUBLIC`, por lo que el bundler jamás las
  incluye en el navegador.
- `src/lib/firebase/admin.ts` importa `server-only`: si alguien intentara
  importarlo desde un Client Component, el build fallaría.
- `.gitignore` excluye `.env*` y cualquier `service-account*.json`.
- Los endpoints de cron exigen `CRON_SECRET` por cabecera `Authorization`.

## 8. XSS e inyección

- React escapa por defecto y el proyecto **no usa** `dangerouslySetInnerHTML` en
  ningún punto.
- Firestore no es SQL: no hay concatenación de consultas.
- Los CSV se generan con escapado de comillas y separadores.
- Las cabeceras `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` y `Strict-Transport-Security` se aplican desde
  `vercel.json`.

## 9. Subida de archivos

`/api/storage/upload` valida sesión, permiso, tipo MIME (imágenes y PDF) y tamaño
máximo (5 MB) **en el servidor**. La ruta siempre incluye el `organizationId`. Las
imágenes de catálogo se publican explícitamente; los comprobantes permanecen
privados y se sirven mediante URL firmada temporal.

## 10. Exposición de información

- Los errores técnicos nunca llegan al usuario: `AppError` los traduce a mensajes
  empresariales y el detalle queda en los logs del servidor.
- Los mensajes de recuperación de contraseña no revelan si un correo está
  registrado.
- `robots: noindex, nofollow` en toda la aplicación.

## 11. Auditoría

Cada operación sensible deja rastro con actor, IP, agente, estado anterior y
posterior. Cuando la operación es transaccional, el registro se escribe **dentro**
de la misma transacción: si la operación se revierte no queda auditoría fantasma, y
si la auditoría no puede escribirse la operación completa se revierte.

---

## Lista de verificación antes de producción

- [ ] Reglas de Firestore y Storage desplegadas (`firebase deploy --only firestore:rules,storage`).
- [ ] Índices desplegados (`firebase deploy --only firestore:indexes`).
- [ ] Variables del Admin SDK definidas solo en el entorno del servidor de Vercel.
- [ ] `CRON_SECRET` con un valor aleatorio largo.
- [ ] Autenticación por correo/contraseña habilitada en Firebase.
- [ ] Dominio de producción añadido a los dominios autorizados de Firebase Auth.
- [ ] Seed **no** ejecutado contra la base de datos de producción.
- [ ] Roles asignados según el principio de mínimo privilegio.

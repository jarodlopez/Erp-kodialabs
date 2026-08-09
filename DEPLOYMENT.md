# Despliegue

Ruta: **GitHub → Vercel → Next.js → Firebase**.

No hace falta ejecutar nada localmente: Vercel construye y publica en cada push.

---

## 1. Preparar Firebase (una sola vez)

1. Crea el proyecto en [Firebase Console](https://console.firebase.google.com).
2. **Authentication → Sign-in method**: habilita *Correo electrónico/contraseña*.
3. **Firestore Database**: créala en modo producción y elige la región más cercana
   (por ejemplo `nam5` o `us-central1`).
4. **Storage**: habilita el bucket.
5. **Project settings → General → Your apps**: crea una app **Web** y copia la
   configuración (son las variables `NEXT_PUBLIC_FIREBASE_*`).
6. **Project settings → Service accounts → Generate new private key**: descarga el
   JSON (son las variables privadas del Admin SDK).

### Publicar reglas e índices

Desde cualquier equipo con Node (o desde una acción de GitHub):

```bash
npx firebase-tools login
npx firebase-tools use TU_PROJECT_ID
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

> Este paso es **obligatorio**. Sin los índices, las consultas con filtros y orden
> fallan; sin las reglas, la base queda expuesta.

---

## 2. Configurar Vercel

1. Importa el repositorio en Vercel. El framework se detecta solo (Next.js).
2. En **Settings → Environment Variables**, añade **solo estas tres** para
   *Production* y *Preview*:

| Variable | Valor |
| --- | --- |
| `FIREBASE_CLIENT_EMAIL` | del service account (`client_email`) |
| `FIREBASE_PRIVATE_KEY` | del service account (`private_key`), **entre comillas dobles y conservando los `\n`** |
| `CRON_SECRET` | cadena aleatoria larga |

La configuración web de Firebase (proyecto `control-de-59fbd`) ya viene incluida
en `src/lib/firebase/config.ts`. Son valores **públicos** —el SDK los incrusta en
el bundle del navegador y cualquiera puede leerlos— y no otorgan acceso por sí
solos: la seguridad la imponen las Security Rules y el hecho de que toda
operación de negocio se ejecuta en el servidor.

Si algún día quieres apuntar la aplicación a otro proyecto de Firebase, define
las variables `NEXT_PUBLIC_FIREBASE_*` (y opcionalmente `FIREBASE_PROJECT_ID` /
`FIREBASE_STORAGE_BUCKET`): tienen prioridad sobre los valores del código y no
hace falta modificarlo.

### Sobre `FIREBASE_PRIVATE_KEY`

Pega el valor exactamente como aparece en el JSON, incluyendo las comillas:

```
"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"
```

La aplicación convierte los `\n` literales en saltos de línea reales. Si prefieres
evitar el problema por completo, codifica el JSON entero en base64 y usa una sola
variable:

```bash
base64 -w0 service-account.json
```

y defínela como `FIREBASE_SERVICE_ACCOUNT_BASE64`.

3. **Deploy**. Vercel ejecuta `npm install` y `npm run build`.

---

## 3. Autorizar el dominio en Firebase

**Authentication → Settings → Authorized domains**: añade el dominio de Vercel
(`tu-proyecto.vercel.app`) y, si lo tienes, tu dominio propio. Sin este paso el
inicio de sesión falla en producción.

---

## 4. Primer uso

1. Abre `https://tu-dominio/registro`.
2. Crea la organización con tu nombre, el del negocio y una contraseña.
3. Quedarás como **administrador**. El sistema aprovisiona automáticamente la
   configuración, la bodega principal, el impuesto por defecto, las categorías de
   gasto y una caja inicial.
4. Desde **Usuarios** crea las cuentas de tu equipo con el rol adecuado.

No ejecutes el seed contra producción: está pensado para desarrollo.

---

## 5. Tareas programadas

`vercel.json` declara el cron:

```json
{ "path": "/api/cron/daily", "schedule": "0 7 * * *" }
```

Se ejecuta todos los días a las 07:00 UTC (01:00 en Nicaragua) y:

- genera los gastos recurrentes vencidos;
- marca como vencidas las cuentas por cobrar y por pagar cuya fecha pasó.

Vercel envía `Authorization: Bearer $CRON_SECRET`; el endpoint rechaza cualquier
llamada sin ese secreto.

Para ejecutarlo manualmente:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/daily
```

> Los crons de Vercel están disponibles en el plan Hobby con frecuencia diaria y sin
> límite de frecuencia en planes de pago. Si tu plan no los incluye, puedes llamar al
> mismo endpoint desde cualquier programador externo (por ejemplo Cloud Scheduler o
> GitHub Actions) usando el mismo secreto.

---

## 6. Verificación posterior al despliegue

- [ ] `/login` carga y permite iniciar sesión.
- [ ] `/` muestra el dashboard con los KPIs en cero (o con datos si ya operaste).
- [ ] Crear un producto, un proveedor y una compra recibida: el inventario sube y el
      costo promedio se calcula.
- [ ] Registrar una venta cobrada: el inventario baja y la caja sube.
- [ ] `/finanzas` muestra el estado de resultados y el libro mayor.
- [ ] `/reportes` exporta CSV y PDF.
- [ ] `/auditoria` lista los eventos.
- [ ] Un usuario con rol `SALES` no ve los módulos de administración.

---

## 7. Resolución de problemas

| Síntoma | Causa habitual | Solución |
| --- | --- | --- |
| «La aplicación no está conectada a Firebase» | Faltan variables del Admin SDK | Revísalas en Vercel y vuelve a desplegar |
| `auth/api-key-not-valid` | `NEXT_PUBLIC_FIREBASE_API_KEY` incorrecta | Cópiala de nuevo desde la consola |
| «La consulta requiere un índice…» | Índices no desplegados | `firebase deploy --only firestore:indexes` |
| El login funciona en local pero no en producción | Dominio no autorizado | Añádelo en Authentication → Authorized domains |
| Error al leer la clave privada | Saltos de línea mal pegados | Usa `FIREBASE_SERVICE_ACCOUNT_BASE64` |
| El cron devuelve 401 | `CRON_SECRET` distinto o ausente | Define la variable y vuelve a desplegar |

---

## 8. Desarrollo local con emuladores

```bash
npm run emulators   # Auth, Firestore y Storage
npm run seed        # datos de ejemplo
npm run dev
```

Con estas variables en `.env.local`:

```
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
```

Los emuladores requieren Java 11 o superior.

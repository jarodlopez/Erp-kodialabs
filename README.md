# ERP HomeMart

Sistema ERP full-stack para la gestión integral de un negocio: inventario con costo
promedio ponderado, ventas, compras, gastos, caja y bancos, cuentas por cobrar y por
pagar, reportes y auditoría.

No es una maqueta: toda la información proviene de una base de datos real y las
operaciones críticas se ejecutan en el servidor dentro de transacciones atómicas.

---

## Índice

- [Stack](#stack)
- [Qué incluye](#qué-incluye)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [Datos de prueba (seed)](#datos-de-prueba-seed)
- [Emuladores](#emuladores)
- [Pruebas](#pruebas)
- [Despliegue](#despliegue)
- [Documentación](#documentación)

---

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| UI | React 19 + Tailwind CSS 4 |
| Lenguaje | TypeScript en modo estricto |
| Autenticación | Firebase Authentication (email/contraseña) |
| Base de datos | Cloud Firestore |
| Archivos | Firebase Storage |
| Servidor | Firebase Admin SDK |
| Validación | Zod 4 |
| Pruebas | Vitest (unitarias e integración) y Playwright (E2E) |
| Despliegue | Vercel |

## Qué incluye

**Operaciones**

- Ventas: borrador, confirmación, cobro total o parcial, venta a crédito, anulación y
  devolución. Al confirmar se descuenta inventario, se registra el asiento financiero y
  se crea la cuenta por cobrar, todo en una sola transacción.
- Compras: borrador, recepción de mercadería, pago total o parcial, anulación y
  devolución al proveedor. La recepción recalcula el **costo promedio ponderado**
  incluyendo flete y otros costos prorrateados.
- Gastos: registro con o sin pago inmediato, pago posterior, anulación y **gastos
  recurrentes** generados automáticamente por una tarea programada.
- Inventario: kardex completo, ajustes con motivo obligatorio y transferencias entre
  bodegas.

**Finanzas**

- Cuentas de caja, banco, tarjeta y billetera digital.
- Libro mayor (`financialTransactions`) como fuente única de verdad del dinero.
- Transferencias internas que **no** se contabilizan como ingreso ni gasto.
- Cuentas por cobrar y por pagar con abonos, vencimientos y antigüedad de saldos.

**Análisis**

- Dashboard ejecutivo con KPIs, gráficos y alertas (stock bajo, documentos vencidos).
- Estado de resultados y flujo de caja construidos desde los documentos registrados.
- Centro de reportes con exportación real a **CSV** y **PDF**.

**Tienda online**

- Módulo de e-commerce integrado: vitrina pública en `/t/{slug}` servida por el
  mismo Next.js, con marca, portadas, zonas de envío, datos de pago, cupones y
  pop-ups configurables desde el panel — sin tocar código.
- Publica productos que ya existen en el inventario: no hay catálogo ni
  existencias duplicadas. Las variantes (talla, medida, presentación) son
  productos reales del ERP agrupados bajo una misma ficha.
- Los pedidos llegan a revisión con su comprobante de pago. Al aprobarlos se
  genera una **venta confirmada**: descuenta inventario, registra el asiento y
  crea la cuenta por cobrar en la misma transacción atómica.
- Imágenes alojadas en ImgBB y servidas en WebP al ancho de cada vista.

**Administración**

- Multi-organización con aislamiento estricto de datos.
- RBAC con 5 roles y más de 40 permisos granulares, validados en el servidor.
- Auditoría inmutable de cada operación sensible.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y completa las variables
npm run dev
```

La aplicación queda disponible en <http://localhost:3000>.

Primer acceso: abre `/registro`, crea tu organización y quedarás como
administrador con acceso total. El registro aprovisiona automáticamente la
configuración, la bodega principal, el impuesto por defecto, las categorías de
gasto y una caja inicial.

### Requisitos previos en Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com).
2. **Authentication** → Sign-in method → habilita **Correo electrónico/contraseña**.
3. **Firestore Database** → crea la base de datos en modo producción.
4. **Storage** → habilita el bucket.
5. **Project settings → Service accounts** → *Generate new private key* (para las
   variables del Admin SDK).
6. Publica las reglas e índices:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

## Variables de entorno

La configuración web de Firebase (proyecto `control-de-59fbd`) ya viene en el
código: `src/lib/firebase/config.ts`. Son valores públicos por diseño —el SDK los
incrusta en el bundle del navegador— y la seguridad la imponen las Security Rules,
no su ocultamiento.

Solo hay **tres variables obligatorias**, todas privadas y de servidor:

| Variable | Descripción |
| --- | --- |
| `FIREBASE_CLIENT_EMAIL` | Del service account. **Nunca** con prefijo `NEXT_PUBLIC`. |
| `FIREBASE_PRIVATE_KEY` | Del service account, entre comillas dobles y conservando los `\n`. |
| `CRON_SECRET` | Protege `/api/cron/daily`. |

Para la tienda online se añaden dos opcionales: `IMGBB_API_KEY` (privada, sin
ella no se pueden subir imágenes) y `NEXT_PUBLIC_SITE_URL` (para armar el enlace
público de cada tienda).

Opcionales: `SESSION_COOKIE_DAYS`, `SESSION_CHECK_REVOKED`, las variables de
emuladores y las `NEXT_PUBLIC_FIREBASE_*` (solo si quieres apuntar a otro
proyecto). Todo está detallado en [`.env.example`](./.env.example).

## Datos de prueba (seed)

```bash
npm run seed
```

Crea una organización con catálogo, clientes, proveedores, cuentas financieras,
compras recibidas, ventas cobradas y gastos, de modo que el dashboard y los
reportes muestren información desde el primer momento.

El seed **nunca** se ejecuta solo y se bloquea si `NODE_ENV=production`.

## Emuladores

```bash
npm run emulators        # Auth + Firestore + Storage
```

Con `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` y `FIRESTORE_EMULATOR_HOST` /
`FIREBASE_AUTH_EMULATOR_HOST` definidos en `.env.local`, tanto el cliente como el
servidor apuntan a los emuladores.

## Pruebas

```bash
npm test           # unitarias + integración (Vitest)
npm run test:e2e   # end-to-end (Playwright, requiere emuladores + seed)
npm run typecheck  # TypeScript en modo estricto
npm run build      # build de producción
```

Las pruebas de integración ejercitan los servicios completos —transacciones,
contadores correlativos, idempotencia, inventario y libro mayor— sobre una
implementación de Firestore en memoria (`tests/helpers/fake-firestore.ts`), por lo
que corren en segundos y sin dependencias externas.

## Despliegue

Ver [DEPLOYMENT.md](./DEPLOYMENT.md). En resumen: conectar el repositorio a Vercel,
definir las variables de entorno y desplegar. El cron diario se configura solo a
partir de `vercel.json`.

## Documentación

| Documento | Contenido |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Capas, flujo de una operación, decisiones técnicas. |
| [TIENDA.md](./TIENDA.md) | Módulo de tienda online: puesta en marcha y modelo. |
| [DATABASE.md](./DATABASE.md) | Modelo de datos, colecciones, índices y convenciones. |
| [SECURITY.md](./SECURITY.md) | Autenticación, RBAC, reglas, aislamiento y controles. |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Despliegue en Vercel y configuración de Firebase. |

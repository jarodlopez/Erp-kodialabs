# Arquitectura

## Principio rector

> Este ERP administra dinero e inventario. **La integridad de los datos tiene
> prioridad sobre la simplicidad.**

De ahí se derivan todas las decisiones de este documento: transacciones atómicas,
aritmética entera, estados centralizados, idempotencia y auditoría obligatoria.

---

## Capas

```
                 Navegador
                     │
  ┌──────────────────┴──────────────────┐
  │ UI  (Server Components + Client)    │  src/app/**, src/components/**
  ├─────────────────────────────────────┤
  │ Server Actions / Route Handlers     │  src/app/actions/**, src/app/api/**
  │   · sesión + permisos (RBAC)        │
  │   · validación Zod                  │
  ├─────────────────────────────────────┤
  │ Servicios de negocio                │  src/lib/services/**
  │   · transacciones atómicas          │
  │   · reglas de negocio               │
  ├─────────────────────────────────────┤
  │ Repositorios                        │  src/lib/repositories/**
  │   · consultas y paginación          │
  ├─────────────────────────────────────┤
  │ Firebase Admin SDK  →  Firestore    │  src/lib/firebase/admin.ts
  └─────────────────────────────────────┘
```

**El navegador nunca lee ni escribe datos de negocio en Firestore.** El SDK de
cliente se usa exclusivamente para autenticación. Toda consulta y toda mutación
pasa por el servidor, donde se verifica identidad, permisos y organización.

### Reparto de responsabilidades

| Capa | Responsabilidad | Nunca hace |
| --- | --- | --- |
| UI | Presentar, recoger datos, retroalimentación inmediata | Decidir permisos, calcular totales definitivos |
| Actions / Handlers | Sesión, RBAC, validación, invalidación de caché | Lógica de negocio |
| Servicios | Reglas de negocio y transacciones | Consultas ad hoc dispersas |
| Repositorios | Acceso a datos y paginación | Reglas de negocio |

---

## Anatomía de una operación crítica: confirmar una venta

`saleService.createSale(..., { confirm: true })` ejecuta **una sola transacción**
de Firestore con este orden obligado (Firestore exige que todas las lecturas
precedan a cualquier escritura):

**Fase de lectura**

1. Comprobación de idempotencia (`idempotencyKeys`).
2. Lectura de cada producto: existencia, organización, estado y stock.
3. Lectura del cliente (obligatorio si la venta es a crédito).
4. Lectura de la cuenta financiera si hay cobro.
5. Reserva del correlativo de venta y, si aplica, del correlativo de pago.

**Cálculo**

6. `priceDocument()` calcula subtotales, descuentos de línea, descuento global
   prorrateado, impuestos y total.
7. Se congela el costo unitario (`averageCost` vigente) en cada línea: el costo de
   venta **nunca** se recalcula con costos futuros.

**Fase de escritura**

8. Documento de venta con su número correlativo.
9. Por cada línea: descuento de stock + `inventoryMovement` (nunca uno sin el otro).
10. Asiento en el libro mayor y actualización del saldo de la cuenta, si hubo cobro.
11. Documento `Payment` del cobro.
12. Cuenta por cobrar si queda saldo pendiente.
13. Actualización de métricas del cliente.
14. Registro de auditoría.
15. Registro de la clave de idempotencia con el resultado.

Si cualquier paso falla, **nada** se escribe: es imposible que quede una venta sin
inventario descontado, sin asiento o sin auditoría.

---

## Decisiones técnicas

### 1. Dinero en enteros

Todo importe se almacena como entero en la unidad mínima de la moneda (centavos);
`10000` es C$100.00. Las cantidades de inventario se escalan por 1000 para admitir
fracciones (kg, litros) sin punto flotante. Toda la aritmética vive en
`src/lib/money.ts` y está cubierta por pruebas.

`priceDocument()` (en `src/lib/pricing.ts`) es un módulo **puro**: no depende de
Firebase ni de Next, se prueba exhaustivamente y lo usan tanto el servidor (cálculo
definitivo) como el cliente (vista previa). Así lo que ve el usuario y lo que se
guarda coinciden exactamente.

El prorrateo de descuentos y costos usa `allocateProportionally()`, que garantiza
que la suma de las partes sea exactamente el total: no se pierden ni se inventan
centavos.

### 2. Fechas como ISO-8601 en UTC

Se almacenan como cadenas `2026-08-08T14:03:00.000Z` en lugar de `Timestamp`:

- ordenan y filtran correctamente con operadores de rango, porque el formato
  ISO-8601 UTC es lexicográficamente ordenable;
- son serializables entre Server y Client Components sin convertidores;
- eliminan una clase entera de errores por objetos `Timestamp` filtrándose al
  navegador.

Solo el servidor escribe fechas, por lo que el reloj es confiable.

### 3. Numeración correlativa concurrente

Los números (`SALE-000001`, `PUR-000001`, …) provienen de contadores en
`counters/{organizationId}_{key}` que se leen e incrementan **dentro de la misma
transacción** que crea el documento. Nunca se usa `array.length + 1`.

### 4. Idempotencia

Cada operación crítica acepta una clave de idempotencia. El cliente genera un UUID
por intento; el servidor registra la clave junto con el resultado dentro de la
transacción. Un segundo envío con la misma clave devuelve el resultado original sin
volver a ejecutar nada. Cubre ventas, compras, pagos, cobros, devoluciones,
transferencias y ajustes.

### 5. Máquinas de estado centralizadas

`src/lib/state-machines.ts` es el único lugar donde se decide un `status`. Las
transiciones inválidas (`CANCELLED → PAID`) lanzan un error de negocio. Los estados
de pago se derivan siempre de los importes, nunca se asignan a mano.

### 6. Costo promedio ponderado

Al recibir mercadería:

```
nuevoCosto = (stockAnterior × costoAnterior + cantidad × costoCompra)
             ÷ (stockAnterior + cantidad)
```

El costo de compra usado es el **costo final** (*landed cost*): incluye flete y
otros costos capitalizables prorrateados proporcionalmente entre las líneas.

Las ventas guardan el costo del momento en cada línea. Modificar precios o costos
después **no altera** ningún documento histórico.

### 7. Transferencias internas

Una transferencia genera dos asientos (salida y entrada) unidos por `transferId`, y
sus tipos (`TRANSFER_IN` / `TRANSFER_OUT`) están excluidos del cálculo de ingresos y
gastos operativos: mover dinero entre cuentas propias no es ni ingreso ni egreso.

### 8. Borrado lógico

La información financiera nunca se elimina físicamente. Los documentos se anulan
(`status = CANCELLED`, con motivo, autor y fecha) y los productos con historial se
desactivan. Las devoluciones son documentos independientes que revierten inventario
y dinero, sin tocar la operación original.

### 9. Rendimiento y costo de Firestore

- Paginación por cursor en todas las tablas: nunca se descarga una colección entera
  al navegador.
- Sin listeners en tiempo real: el renderizado ocurre en el servidor.
- Campos denormalizados donde evitan lecturas caras: `categoryName` en el producto,
  `stats` en clientes y proveedores, `isLowStock` (Firestore no puede comparar dos
  campos entre sí).
- Índices compuestos declarados en `firestore.indexes.json`.
- `count()` agregado para totales, en lugar de traer documentos.

### 10. Sin dependencias innecesarias

Los gráficos son SVG propios y el generador de PDF está escrito a mano
(`src/lib/export/pdf.ts`). Menos peso en el bundle y ningún riesgo de que una
librería de terceros rompa el build.

---

## Estructura de carpetas

```
src/
├── app/
│   ├── (auth)/            Login, registro y recuperación
│   ├── (app)/             Área protegida (sidebar + módulos)
│   ├── actions/           Server Actions por dominio
│   ├── api/               Route Handlers (cron, export, storage)
│   ├── layout.tsx         Layout raíz
│   └── globals.css        Sistema de diseño (Tailwind 4)
├── components/
│   ├── ui/                Primitivas, tablas, modales, gráficos, toasts
│   ├── domain/            Componentes con semántica de negocio
│   └── layout/            Shell de la aplicación y navegación
├── lib/
│   ├── firebase/          Admin SDK, cliente y nombres de colecciones
│   ├── auth/              Sesión y traducción de errores
│   ├── repositories/      Acceso a datos
│   ├── services/          Lógica de negocio y transacciones
│   ├── validation/        Esquemas Zod
│   ├── export/            CSV y PDF
│   ├── money.ts           Aritmética monetaria
│   ├── pricing.ts         Cálculo de documentos (puro)
│   ├── rbac.ts            Roles y permisos
│   ├── state-machines.ts  Transiciones válidas
│   └── errors.ts          Sistema global de errores
├── types/                 Modelo de dominio tipado
└── middleware.ts          Redirección por presencia de sesión
```

## Manejo de errores

`AppError` normaliza toda excepción a un código estable y un mensaje empresarial en
español. El detalle técnico se registra en el servidor con `logError()` y **nunca**
llega al navegador: un `PERMISSION_DENIED` de Firebase se le presenta al usuario
como *«No tienes permisos para realizar esta operación.»*

Las Server Actions devuelven un `ActionResult` uniforme
(`{ ok: true, data }` | `{ ok: false, error }`), lo que permite pintar errores por
campo en los formularios sin `try/catch` en cada componente.

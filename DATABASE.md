# Modelo de datos

Base de datos: **Cloud Firestore** (modo nativo).

## Convenciones globales

| Convención | Detalle |
| --- | --- |
| Multi-tenancy | Colecciones de primer nivel; **todo** documento de negocio lleva `organizationId`. |
| Dinero | Enteros en la unidad mínima (centavos). `10000` = C$100.00. |
| Cantidades | Enteros escalados ×1000. `1500` = 1.5 unidades. |
| Tasas | Puntos base enteros. `1500` = 15 %. |
| Fechas | Cadenas ISO-8601 en UTC (`2026-08-08T14:03:00.000Z`). |
| Auditoría | `createdAt`, `updatedAt`, `createdBy`, `updatedBy` en toda entidad. |
| Borrado | Lógico (`status`, `deletedAt`, `deletedBy`). Nunca físico en datos financieros. |

**Por qué colecciones planas y no subcolecciones bajo `organizations/{id}`:**
permite reglas de seguridad simples y baratas
(`resource.data.organizationId == request.auth.token.organizationId`), índices
compuestos eficientes y una migración futura a multi-organización sin mover datos.

---

## Colecciones

### `organizations/{organizationId}`

Tenant. `name`, `legalName`, `taxId`, `email`, `phone`, `address`, `logoUrl`,
`currency`, `locale`, `timezone`, `status`.

### `settings/{organizationId}`

Parámetros de operación: `currency`, `locale`, `timezone`, `taxMode`
(`EXCLUSIVE` | `INCLUSIVE`), `defaultTaxRate`, `defaultCreditDays`,
`allowNegativeStock`, `numbering` (prefijos por documento), `invoiceFooter`.

### `users/{uid}` y `memberships/{organizationId}_{uid}`

Perfil del usuario y su pertenencia a una organización con su rol. El rol
autoritativo viaja además en los *custom claims* del token de Firebase.

### `taxes`, `warehouses`

Catálogos de la organización. Las bodegas soportan múltiples ubicaciones; existe
una marcada como `isDefault`.

### `categories`

`name`, `description`, `parentId`, `color`, `status`, `productCount`
(denormalizado para evitar contar productos en cada listado).

### `products`

| Campo | Notas |
| --- | --- |
| `sku`, `barcode`, `name`, `searchName` | `searchName` está normalizado (minúsculas, sin acentos) para búsqueda por prefijo. |
| `categoryId`, `categoryName` | El nombre se denormaliza para listar sin joins. |
| `unit`, `brand`, `description`, `imageUrl` | Ficha del producto. |
| `cost` | Último costo de compra. |
| `averageCost` | **Costo promedio ponderado vigente.** Lo mantiene el flujo de compras. |
| `salePrice`, `wholesalePrice`, `taxRate` | Precios e impuesto por defecto. |
| `stock`, `minimumStock` | Cantidades escaladas. |
| `isLowStock` | `stock <= minimumStock`, denormalizado porque Firestore no puede comparar dos campos entre sí. |
| `tracksInventory` | `false` para servicios. |
| `status`, `deletedAt`, `deletedBy` | Borrado lógico. |

### `productStock/{organizationId}_{productId}_{warehouseId}`

Existencias por bodega. `product.stock` es el total; este documento el desglose.

### `customers`, `suppliers`

Datos de contacto, condiciones de crédito y un objeto `stats` denormalizado
(`totalAmount`, `documentCount`, `outstandingBalance`, `lastDocumentAt`) que se
actualiza dentro de las mismas transacciones que mueven dinero.

### `sales`

Documento de venta con sus `items` embebidos. Cada ítem conserva **precio, tasa de
impuesto y costo unitario del momento**: modificar el catálogo después no altera el
histórico.

Totales: `subtotal`, `discount`, `globalDiscount`, `tax`, `total`,
`costOfGoodsSold`, `grossProfit`, `paidAmount`, `dueAmount`.

Estados: `DRAFT → CONFIRMED → PARTIAL → PAID`, más `CANCELLED` y `RETURNED`.

### `purchases`

Análogo a ventas. Cada ítem guarda `unitCost` (negociado) y `landedUnitCost`
(con flete y otros costos prorrateados) — este último alimenta el costo promedio.

Estados: `DRAFT → RECEIVED → PARTIAL → PAID`, más `CANCELLED` y `RETURNED`.

### `expenses`, `expenseCategories`, `recurringExpenses`

Gastos con categoría, proveedor opcional, impuesto, estado de pago y comprobante.
Los recurrentes guardan `frequency`, `nextDate`, `autoPay` y `generatedCount`; la
tarea diaria los materializa en gastos reales.

### `inventoryMovements`

**Registro inmutable de todo cambio de existencias.** Se crea siempre en la misma
transacción que modifica `product.stock`.

Tipos: `PURCHASE`, `SALE`, `SALE_RETURN`, `PURCHASE_RETURN`, `ADJUSTMENT_IN`,
`ADJUSTMENT_OUT`, `TRANSFER_IN`, `TRANSFER_OUT`, `INITIAL`.

Campos: `productId`, `warehouseId`, `type`, `quantity`, `signedQuantity`,
`previousStock`, `newStock`, `unitCost`, `totalCost`, `referenceType`,
`referenceId`, `referenceNumber`, `reason`, `createdBy`, `createdAt`.

### `financialAccounts`

Caja, banco, tarjeta, billetera digital u otra. `initialBalance`, `currentBalance`,
`isDefault`, `status`.

### `financialTransactions` — libro mayor

Fuente única de verdad del dinero. Cada asiento guarda `type`, `direction`
(`IN` / `OUT`), `amount`, `accountId`, `balanceAfter` (saldo resultante, para
auditar el saldo en cualquier momento), `referenceType`, `referenceId`, `date` y
`transferId` cuando forma parte de una transferencia.

Los tipos `TRANSFER_IN`, `TRANSFER_OUT` y `OPENING_BALANCE` se excluyen del cálculo
de ingresos y gastos operativos.

### `transfers`

Cabecera de la transferencia interna; sus dos patas viven en el libro mayor.

### `accountsReceivable` / `accountsPayable`

Generadas automáticamente por ventas y compras a crédito.
`originalAmount`, `paidAmount`, `remainingAmount`, `issueDate`, `dueDate`,
`status` (`PENDING`, `PARTIAL`, `PAID`, `OVERDUE`, `CANCELLED`).

### `payments`

Documento de cada cobro o pago: `type`, `referenceId`, `accountId`, `amount`,
`method`, `date`. Al anularse un documento, el pago se marca con `cancelledAt` y se
emite el asiento inverso.

### `returns`

Documento de devolución (venta o compra) con sus ítems, `refundMode`
(`CASH_REFUND` | `CREDIT_NOTE`) y motivo. **Nunca** modifica ni elimina la
operación original: solo actualiza sus cantidades devueltas.

### `auditLogs`

Registro inmutable: `userId`, `action`, `module`, `entityType`, `entityId`,
`before`, `after`, `metadata`, `ip`, `userAgent`, `timestamp`. Las reglas de
seguridad prohíben `update` y `delete` a todos los clientes.

### `counters/{organizationId}_{key}`

Contadores de numeración correlativa. Se incrementan dentro de la transacción del
documento que numeran.

### `idempotencyKeys/{organizationId}_{operation}_{key}`

Guarda el resultado de una operación crítica para que un reintento no la duplique.
Incluye `expiresAt` para configurar una política TTL en Firestore.

---

## Índices

Están declarados en [`firestore.indexes.json`](./firestore.indexes.json) y se
despliegan con:

```bash
npx firebase-tools deploy --only firestore:indexes
```

Patrón general: `organizationId` primero (aislamiento), luego el filtro de
equivalencia (estado, categoría, cliente…) y por último el campo de orden (`date`,
`searchName`, `dueDate`, `timestamp`). El campo `__name__` se añade implícitamente
en la misma dirección que el último `orderBy`, por lo que no se declara.

Si Firestore devuelve `FAILED_PRECONDITION: requires an index`, la aplicación lo
traduce a un mensaje claro; despliega los índices para resolverlo.

---

## Diagrama de relaciones

```
organization
 ├── settings, taxes, warehouses
 ├── users ── memberships
 ├── categories ──< products ──< inventoryMovements
 │                     └──< productStock (por bodega)
 ├── customers ──< sales ──< accountsReceivable ──< payments
 ├── suppliers ──< purchases ──< accountsPayable ──< payments
 │                 └──< expenses
 ├── financialAccounts ──< financialTransactions (libro mayor)
 │                          └── transfers (dos patas)
 ├── returns ── (referencian sales o purchases)
 └── auditLogs (inmutable)
```

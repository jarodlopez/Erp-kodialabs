# Tienda online

Módulo de e-commerce del ERP. Añade un canal de venta por internet sobre el
mismo catálogo, el mismo inventario y la misma contabilidad que ya usa el
comercio, sin abrir una segunda fuente de verdad.

Nace de la plantilla [Kodia Shop](https://github.com/jarodlopez/kodiashop),
portada a la arquitectura del ERP: lo que allí era una app aparte con su propio
Firebase, su propio panel y su propio inventario, aquí es un módulo más.

---

## Índice

- [Qué resuelve](#qué-resuelve)
- [Puesta en marcha](#puesta-en-marcha)
- [Cómo funciona el catálogo](#cómo-funciona-el-catálogo)
- [Del pedido a la venta](#del-pedido-a-la-venta)
- [Imágenes](#imágenes)
- [Permisos](#permisos)
- [Rutas](#rutas)
- [Qué no hace todavía](#qué-no-hace-todavía)

---

## Qué resuelve

| | Tienda separada | Este módulo |
| --- | --- | --- |
| Catálogo | Se carga dos veces | Se publica el del ERP |
| Existencias | Dos inventarios que se desincronizan | Uno solo, en vivo |
| Pedidos | Se transcriben a mano al ERP | Se aprueban y generan la venta |
| Contabilidad | Aparte | Asiento, CxC y kardex automáticos |
| Panel | Dos paneles y dos accesos | El mismo, con los mismos roles |

La identidad de la tienda —nombre, logo, color, moneda, etiqueta de variante,
zonas de envío, datos de pago— se configura desde el panel. La misma base sirve
para una tienda de ropa (`TALLA`) y para una ferretería (`MEDIDA`) sin tocar
código.

## Puesta en marcha

1. **Entrá a `Tienda online → Resumen`.** La primera visita crea la tienda en
   **borrador** con valores neutros. En borrador nadie más puede verla.
2. **Configurá `Diseño`**: nombre, color, dirección pública (`slug`), moneda,
   etiqueta de variante, zonas de envío y —obligatorio para publicar— al menos
   un dato de pago.
3. **Publicá productos** en `Vitrina`: elegí un producto del inventario, subí
   fotos y, si aplica, agregá variantes apuntando a otros productos del ERP.
4. **Configurá `IMGBB_API_KEY`** en las variables de entorno si aún no está;
   sin ella no se pueden subir imágenes (el resto del módulo funciona).
5. **Cambiá el estado a `Publicada`** en Diseño. El ERP verifica que haya al
   menos un producto visible y un dato de pago antes de dejarte abrir.
6. **Compartí el enlace** `https://tu-dominio/t/{slug}`.

Los índices de Firestore del módulo ya están en `firestore.indexes.json`:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

## Cómo funciona el catálogo

Una **ficha de vitrina** (`storeListings`) no es un producto: es la publicación
de uno que ya existe en `products`. Guarda solo lo que la web necesita —título
de venta, descripción larga, viñetas de detalle, fotos, colección, precio de
oferta y orden— y apunta al producto real.

Las **variantes** son la pieza que suele llevar a diseños malos. Aquí cada
variante es **otro producto del ERP** con su propio SKU y su propia existencia;
la ficha solo las agrupa bajo un mismo título y un mismo selector. El resultado:

- el kardex, el costo promedio ponderado y los reportes siguen intactos;
- no hace falta un modelo paralelo de stock por talla;
- una ferretería puede cobrar distinto por cada medida sin configurar nada.

**Precios.** Cada opción se cotiza con el precio de venta de su producto. Si la
ficha declara un precio de oferta, ese precio aplica a todas las opciones y el
de lista se muestra tachado. Cuando las opciones no comparten precio, la vitrina
muestra «desde».

## Del pedido a la venta

```
Comprador                Servidor                        ERP
    │  carrito (ids)        │                             │
    ├──────────────────────>│ recalcula precio, envío,    │
    │                       │ cupón y total; valida stock │
    │  n.º de pedido        │                             │
    │<──────────────────────┤ storeOrders: PENDING        │
    │  comprobante          │ (no toca inventario         │
    ├──────────────────────>│  ni finanzas)               │
                            │                             │
   Panel: "Aprobar" ───────>│ saleService.createSale ────>│ venta CONFIRMADA
                            │   confirm: true             │ · descuenta stock
                            │   idempotencyKey del pedido │ · asiento contable
                            │                             │ · cuenta por cobrar
                            │                             │ · auditoría
```

Detalles que importan:

- **Del carrito solo se aceptan `productId` y cantidad.** Precio, envío, cupón y
  total se recalculan en el servidor contra el catálogo publicado. Editar el
  `localStorage` de la tienda no cambia lo que se cobra.
- **No se sobrevende.** La web exige existencias suficientes aunque la
  organización permita stock negativo: el comprador ya vio la disponibilidad y
  no hay un vendedor que pueda resolver un faltante.
- **El envío se factura.** Se agrega a la venta como línea del producto de
  servicio `ENVIO-WEB`, que el módulo crea la primera vez que hace falta. Así el
  ingreso por envío queda contabilizado y el total cuadra.
- **El cupón sigue siendo un descuento.** Se traslada a la venta como descuento
  de línea prorrateado, no escondido en el precio, para que los reportes de
  margen y de descuentos concedidos digan la verdad.
- **Aprobar sin cuenta financiera** deja la venta a crédito con su cuenta por
  cobrar. Es lo correcto cuando el cliente paga contra entrega.
- **Rechazar** no genera venta y devuelve el uso del cupón.
- **El cliente se identifica por teléfono**: si ya compró antes, el pedido se
  acumula en su ficha en lugar de crear un cliente por compra.

### El centavo del impuesto

La tienda muestra precios **finales**; el ERP puede facturar con el impuesto por
fuera (`taxMode: EXCLUSIVE`). Al aprobar, el servicio invierte la fórmula para
obtener la base imponible de cada línea.

En casi todos los importes la reconstrucción es exacta. En unos pocos no existe
base entera que la alcance —con 7 % de impuesto, ninguna base da 69.93: 65.35 da
69.92 y 65.36 da 69.94— y la venta queda a un centavo del pedido. Por eso el
cobro se registra por el total de la **venta**, no por el del pedido. El
comportamiento está fijado en `tests/unit/store-pricing.test.ts`.

## Imágenes

Las imágenes públicas de la tienda van a **ImgBB**, no a Firebase Storage: son
públicas por definición y así no consumen cuota del bucket privado.

- **Al subir**: se comprimen en el navegador a WebP (~1400 px, calidad 82 %)
  antes de salir. Una foto de varios MB suele quedar en 150-250 KB. El archivo
  viaja al servidor, que valida tipo y tamaño y es el único que conoce la API
  key — el navegador nunca la ve.
- **Al mostrar**: se sirven vía `wsrv.nl` (sobre Cloudflare), que las convierte
  a WebP y las redimensiona al ancho de cada vista. Los anchos se normalizan a
  tres tamaños fijos para que todas las vistas compartan la misma URL por
  imagen. Si el proxy fallara, cada imagen cae a su URL original de ImgBB.
- **Comprobantes de pago**: los sube el comprador desde el checkout. La subida
  es pública, pero solo se acepta contra un pedido existente de esa tienda que
  siga pendiente, y el pedido se verifica **antes** de gastar la cuota.

Los archivos privados del ERP (comprobantes de compra, logos internos) siguen
yendo a Firebase Storage, donde las Storage Rules imponen el aislamiento.

## Permisos

| Permiso | Qué habilita | Roles con él |
| --- | --- | --- |
| `store.view` | Ver el módulo y la vitrina | ADMIN, MANAGER, SALES, WAREHOUSE, ACCOUNTANT |
| `store.manage` | Diseño, vitrina, cupones y pop-ups | ADMIN, MANAGER |
| `store.orders.view` | Ver pedidos online | Todos los roles |
| `store.orders.manage` | Aprobar y rechazar pedidos | ADMIN, MANAGER, SALES |

Aprobar un pedido genera una venta, así que además exige `sales.create`: quien
no puede facturar en el ERP tampoco puede hacerlo por el canal web.

## Rutas

**Panel** (bajo sesión y RBAC)

| Ruta | Para qué |
| --- | --- |
| `/tienda` | Resumen: pedidos por revisar, vendido en 30 días, enlace público |
| `/tienda/catalogo` | Publicar productos y editar sus fichas |
| `/tienda/pedidos` | Bandeja de pedidos |
| `/tienda/pedidos/[id]` | Detalle, comprobante, aprobar o rechazar |
| `/tienda/diseno` | Marca, módulos, envíos, datos de pago, publicación |
| `/tienda/descuentos` | Cupones |
| `/tienda/popups` | Pop-ups |

**Sitio público** (sin sesión)

| Ruta | Para qué |
| --- | --- |
| `/t/[slug]` | Vitrina, con portada y filtro por colección |
| `/t/[slug]/producto/[productId]` | Ficha, selector de variante, carrito |
| `/t/[slug]/checkout` | Datos, envío, cupón, confirmación y comprobante |
| `POST /api/tienda/[slug]/pedidos` | Alta del pedido |
| `POST /api/tienda/[slug]/comprobante` | Subida del comprobante |

Las páginas públicas se renderizan en el servidor con el Admin SDK: el navegador
del comprador **no** lee Firestore, igual que en el resto del ERP.

## Qué no hace todavía

Lo que quedó deliberadamente fuera de esta primera versión, para no fingir
alcance:

- **Pasarela de pago.** El flujo es transferencia + comprobante + aprobación
  manual, como en la plantilla original. No hay cobro con tarjeta.
- **Reserva de stock.** Un producto se descuenta al aprobar, no al pedir: dos
  compradores pueden pedir la última unidad y el segundo pedido fallará al
  aprobarse. Para catálogos con rotación alta conviene revisar pronto.
- **Analítica propia.** No se registran eventos de navegación (`page_view`,
  `add_to_cart`). Los reportes del ERP cubren lo vendido, no el embudo.
- **Búsqueda en la tienda.** Hay filtro por colección, no buscador.
- **Múltiples tiendas por organización.** Una organización, una tienda.
- **Notificación al comercio.** El pedido aparece en el panel; no se envía
  correo ni WhatsApp automático al recibirlo.

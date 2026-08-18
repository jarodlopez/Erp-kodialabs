# Reparto

Módulo de entregas a domicilio con seguimiento en vivo. Registra dónde está
cada rider, cuánto recorrió de verdad, cuánto tardó y —lo que casi ningún
sistema dice— cuánto ganó o perdió el negocio en cada envío.

Se apoya en **OpenStreetMap** y en **Leaflet**: no hay SDK de mapas que cobre
por carga, así que el costo del módulo no crece con el uso.

---

## Índice

- [Qué resuelve](#qué-resuelve)
- [Puesta en marcha](#puesta-en-marcha)
- [El ciclo de un reparto](#el-ciclo-de-un-reparto)
- [Los dos números del dinero](#los-dos-números-del-dinero)
- [Cómo se mide la distancia](#cómo-se-mide-la-distancia)
- [La vista del rider](#la-vista-del-rider)
- [Permisos](#permisos)
- [Rutas](#rutas)
- [Costo en lecturas y escrituras](#costo-en-lecturas-y-escrituras)
- [Qué no hace todavía](#qué-no-hace-todavía)

---

## Qué resuelve

| | Sin el módulo | Con el módulo |
| --- | --- | --- |
| ¿Dónde va el pedido? | Se llama al rider | Mapa en vivo |
| ¿Cuánto se recorrió? | Lo que dice el rider | Rastro medido por el servidor |
| ¿Cuánto costó el envío? | Nadie lo calcula | Costo por km real, opcionalmente como gasto |
| ¿El envío deja ganancia? | Se supone que sí | Margen por reparto y del período |
| ¿Cuánto tarda una entrega? | A ojo | Tiempo estimado y tiempo real |

Un reparto **nunca se inventa**: nace de una venta del ERP con datos de entrega
o de un pedido online aprobado, y hereda de ahí el cliente, la dirección y el
teléfono. Lo único que agrega es el punto exacto en el mapa, el rider y el
rastro.

## Puesta en marcha

1. **`Reparto → Tarifas de reparto`.** Tocá el mapa para fijar el **punto de
   partida** (normalmente la bodega o el local). Sin él no se puede despachar:
   todas las distancias se miden desde ahí.
2. **Cargá las tarifas.** Son dos bloques distintos y conviene no confundirlos:
   lo que le cobrás al cliente y lo que a vos te cuesta. La previsualización de
   la misma pantalla te muestra qué sale un reparto de 5 km con lo que
   escribiste, y te avisa si esa configuración te deja pérdida.
3. **Creá los usuarios repartidores.** En `Usuarios`, con el rol
   **Repartidor**. Ese rol tiene un solo permiso: repartir.
4. **(Opcional) Registro automático del gasto.** Elegí la categoría de gasto y
   activá la casilla. El costo operativo de cada entrega efectiva se asienta
   solo.
5. **Despachá.** Desde `Reparto → Repartos → Nuevo reparto`, o directo desde el
   botón **Crear reparto** que aparece en la ficha de la venta y del pedido
   online aprobado.

Las reglas y los índices del módulo ya están en el repositorio y se publican
con el mismo flujo de GitHub Actions que el resto (`firebase-rules.yml`).

### Variables de entorno (opcionales)

| Variable | Para qué |
| --- | --- |
| `NEXT_PUBLIC_MAP_TILE_URL` | Servidor de teselas. Por defecto el público de OSM. |
| `NEXT_PUBLIC_MAP_ATTRIBUTION` | Atribución que se muestra en el mapa. |

El servidor público de OpenStreetMap se usa **por cortesía** y su política de
uso prohíbe el tráfico comercial intensivo. Mientras el volumen sea de un
comercio chico no hay problema; cuando crezca, se cambia la primera variable por
un proveedor propio o de pago y no hay que tocar una línea de código.

## El ciclo de un reparto

```
             ┌──────────► CANCELLED (con motivo)
             │
PENDING ──► ASSIGNED ──► IN_TRANSIT ──┬──► DELIVERED
   ▲            │                     └──► FAILED (con motivo)
   └────────────┘  (reasignar conserva el rastro)
```

| Estado | Qué significa |
| --- | --- |
| `PENDING` | Despachado, sin rider |
| `ASSIGNED` | Tiene rider; todavía no salió |
| `IN_TRANSIT` | El rider salió y su teléfono está marcando posición |
| `DELIVERED` | Entregado. Acá se calcula el costo |
| `FAILED` | No se pudo entregar; exige explicación |
| `CANCELLED` | Anulado antes de salir; exige motivo |

Quién puede mover qué:

- **Despachar, asignar, reasignar y anular**: `delivery.manage`, desde el panel.
- **Salir, marcar posición y cerrar**: el **rider asignado**, desde su vista. El
  servidor comprueba que el reparto sea suyo en cada operación — el permiso dice
  "puede repartir", no "puede repartir cualquier cosa".

Arrancar y cerrar **no** están en el panel a propósito: poner esos botones ahí
invitaría a "cerrar" repartos que nadie hizo.

## Los dos números del dinero

Se guardan separados porque responden preguntas distintas.

**Lo cobrado al cliente** (`amounts.charged`) se calcula sobre la distancia
**estimada**, antes de salir. Si el pedido online ya traía un envío cobrado, ese
manda: es el precio que el comprador aceptó, y no se le cambia porque el rider
tomó un desvío. Que el negocio absorba esa diferencia es exactamente lo que el
margen deja ver.

```
cobrado = tarifa base + (km estimados − km incluidos) × tarifa por km
```

**Lo que costó** (`amounts.cost`) se calcula al cerrar, sobre el recorrido
**real**:

```
costo = km recorridos × costo por km  +  pago al rider
pago al rider = fijo por entrega + km recorridos × pago por km
```

El pago al rider se guarda aparte (`amounts.riderPay`) porque no siempre sale
del mismo bolsillo: hay negocios donde el rider es empleado y su sueldo ya está
en la nómina, y otros donde se le liquida por entrega. Con las tarifas de pago
en cero, ese término desaparece.

Un reparto sin un metro recorrido no genera pago al rider: sin metros no hubo
viaje.

**El margen** es la resta, y puede ser negativo. Se muestra en la ficha del
reparto y sumado en la cabecera del módulo. Cobrar C$50 de envío y gastar C$70
en hacerlo es una pérdida que, sin este número, queda escondida dentro del total
de ventas.

### El gasto en la contabilidad

Con el registro automático activado, cerrar un reparto **entregado** crea un
gasto del ERP por el costo operativo, con clave de idempotencia derivada del
reparto: un doble clic no duplica el asiento.

Un reparto **fallido** calcula el costo igual —el combustible se gastó— pero
**no** asienta nada: son casos que hay que mirar a mano, y automatizarlos
ensuciaría la contabilidad.

## Cómo se mide la distancia

Este es el problema central del módulo, y la razón de que `src/lib/geo.ts` sea
un archivo puro con 25 pruebas propias.

**Un teléfono detenido no informa siempre la misma coordenada.** Oscila unos
metros en cada lectura. Con una marca cada 30 segundos, un rider esperando una
hora en un portón genera 120 lecturas que, sumadas sin criterio, "recorren" un
par de kilómetros que nadie hizo. Si ese número alimenta el costo por
kilómetro, el ERP registra un gasto inventado.

Por eso cada tramo se juzga antes de sumarse, y hay tres respuestas posibles:

| Veredicto | Cuándo | Qué pasa |
| --- | --- | --- |
| `jump` | La velocidad implicada supera 150 km/h | Se descarta: es un salto del GPS al recuperar señal |
| `noise` | El desplazamiento no supera el error que declara el GPS | Se descarta: no se puede afirmar que hubo movimiento |
| cuenta | Hay desplazamiento real | Se suma |

El umbral del ruido **suma** los dos errores declarados, no los promedia: cada
fijación puede desviarse su propio radio, así que dos lecturas de 15 m pueden
aparecer a 30 m una de otra sin que nadie se haya movido. Es un criterio
conservador a propósito — perder unos metros de caminata lenta es mucho menos
grave que cargarle al negocio un gasto que no existió.

Tres decisiones más, todas del lado del servidor:

- **La hora la pone el servidor**, no el dispositivo. Un reloj mal puesto
  desordenaría el rastro y falsearía las velocidades con las que se descartan
  los saltos.
- **Las lecturas imprecisas se rechazan** por encima del umbral configurado
  (100 m por defecto), y eso **no** es un error: el teléfono reintenta en el
  ciclo siguiente.
- **La última posición se actualiza igual** cuando el tramo no cuenta. El mapa
  tiene que mostrar dónde está el rider aunque esté detenido.

La estimación previa, en cambio, no pretende ser exacta: es la distancia en
línea recta multiplicada por un **factor de carretera** (1.4 por defecto en
trama urbana). Se declara como estimación y el costo nunca sale de ahí.

### El destino se marca a mano

No hay geocodificación, y es deliberado. Las direcciones centroamericanas
—"de donde fue el árbol de mango 2c al sur, casa de portón negro"— no las
resuelve ningún buscador de direcciones. Quien despacha toca el mapa y fija el
punto, que además queda con una **referencia visual** escrita para el rider.

## La vista del rider

Vive fuera del panel (`/reparto`) y es una sola columna pensada para un teléfono
sostenido con una mano en la calle: sin barra lateral, sin buscador y sin nada
que abra inventario o finanzas. Ese recorte no es estético — el teléfono de un
rider se presta, se pierde y se revende.

Cómo informa la posición, y por qué así:

- `watchPosition` queda escuchando y deja la lectura más fresca en memoria.
  Mantiene el GPS "caliente", que es lo que da precisión: pedir una posición
  desde frío devuelve una primera lectura mala de 100 m o más.
- Un temporizador manda al servidor **una** lectura cada `pingSeconds`.
  Escuchar y escribir son cosas distintas: `watchPosition` puede dispararse
  varias veces por segundo en movimiento, y eso serían miles de escrituras por
  viaje.
- Una lectura de más de dos ciclos de antigüedad **no se manda**: como la hora
  la sella el servidor al recibirla, enviar algo viejo lo ubicaría en el rastro
  como si fuera de ahora y dibujaría un salto que nunca ocurrió.

El navegador suspende los temporizadores con la pantalla apagada, así que la
vista pide un **Wake Lock** para mantenerla encendida y lo vuelve a pedir cada
vez que la pestaña reaparece (el sistema lo libera al ocultarla). Donde la API
no existe —Safari en iOS, sobre todo— se le avisa al rider en pantalla que deje
la pantalla prendida.

El botón **Abrir en el mapa** manda a OpenStreetMap y no a una app concreta: el
rider elige con qué navegar y el negocio no paga ningún SDK para que ese botón
exista.

## Permisos

| Permiso | Quién lo tiene | Para qué |
| --- | --- | --- |
| `delivery.view` | Admin, Gerente, Ventas, Bodega, Contador | Ver repartos, mapa y costos |
| `delivery.manage` | Admin, Gerente, Ventas | Despachar, asignar, anular, tarifar |
| `delivery.ride` | Admin, **Repartidor** | Vista de reparto: salir, marcar, cerrar |

El rol **Repartidor** tiene exactamente **un** permiso: `delivery.ride`. No
entra al panel — el layout lo redirige a su vista — y no puede ver inventario,
ventas ni finanzas. Mantener esa lista en uno solo es la garantía de que el
teléfono de un rider no sea una puerta al resto del negocio.

`delivery.ride` se comprueba por **permiso** y no por rol, para que el dueño de
un negocio chico que reparte él mismo no quede afuera.

## Rutas

### Panel

| Ruta | Permiso | Qué hace |
| --- | --- | --- |
| `/repartos` | `delivery.view` | Historial, filtros y totales del período |
| `/repartos/mapa` | `delivery.view` | Mapa en vivo con todos los riders |
| `/repartos/nuevo` | `delivery.manage` | Despachar: elegir documento, marcar destino, asignar |
| `/repartos/[id]` | `delivery.view` | Ficha: rastro, tiempos, dinero, línea de tiempo |
| `/repartos/tarifas` | `delivery.manage` | Punto de partida, tarifas y parámetros |

### Rider

| Ruta | Permiso | Qué hace |
| --- | --- | --- |
| `/reparto` | `delivery.ride` | Su cola de repartos, el más viejo primero |
| `/reparto/[id]` | `delivery.ride` | Reparto en curso: salir, seguir, cerrar |

### API

| Ruta | Permiso | Qué hace |
| --- | --- | --- |
| `GET /api/repartos/activos` | `delivery.view` | Repartos vivos para el mapa (JSON mínimo) |

Es una ruta y no una Server Action porque el mapa consulta cada pocos segundos y
una Server Action invalidaría la caché del panel en cada vuelta. Devuelve lo
mínimo que el mapa dibuja: no viajan notas, teléfonos ni importes.

## Costo en lecturas y escrituras

El módulo está escrito para que seguir a diez riders cueste diez lecturas y no
diez mil.

- **La última posición vive dentro del reparto** (`lastPoint`), no en una
  colección aparte. El mapa en vivo lee un documento por reparto activo.
- **El rastro completo es un solo documento** por reparto
  (`deliveryTracks/{deliveryId}`), y se pide únicamente al abrir una ficha. Con
  un documento por marca, un turno de ocho horas serían casi mil documentos por
  rider; así el rastro de un viaje de dos horas ocupa unos 10 KB, muy por debajo
  del límite de 1 MB por documento.
- **Cada ping es una transacción con dos escrituras** (el reparto y el rastro),
  y el rastro solo guarda las marcas que describen movimiento real. El ruido
  incrementa un contador y nada más.
- **Tope de 2000 marcas por rastro**: a 30 segundos por ping son unas 16 horas
  de viaje. El límite existe para que un teléfono olvidado con la app abierta no
  infle el documento sin freno.

## Qué no hace todavía

- **No traza la ruta por calles.** La estimación es geodésica por el factor de
  carretera, y el recorrido real sale del rastro. Un motor de rutas
  (OpenRouteService) daría una estimación mejor, pero el costo —que es el número
  que importa— ya se calcula con la distancia real y no lo necesita.
- **No optimiza el orden de varias entregas.** La cola del rider es por orden de
  llegada.
- **No avisa al cliente.** No hay enlace público de seguimiento ni notificación
  de "tu pedido salió".
- **No funciona sin conexión.** Si el teléfono pierde datos, las marcas de ese
  tramo no se guardan y el rastro queda con un hueco; el recorrido se retoma al
  volver la señal, sin sumar el salto.
- **No hay liquidación de riders.** El pago por entrega se calcula y se guarda,
  pero no existe una pantalla que lo acumule por rider y período.

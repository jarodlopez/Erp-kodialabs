import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  BookOpen,
  Boxes,
  Coins,
  FileBarChart,
  Landmark,
  Receipt,
  Rocket,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';

import { Card, PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';

export const metadata: Metadata = { title: 'Guía de uso' };

interface Section {
  id: string;
  title: string;
  icon: LucideIcon;
  content: ReactNode;
}

/* Ayudas de formato consistentes con el resto de la plataforma. */
function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">{children}</p>;
}
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--color-ink-muted)] marker:text-[var(--color-ink-subtle)]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}
function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--color-ink-muted)] marker:text-[var(--color-ink-subtle)]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] p-3 text-sm text-[var(--color-brand-700)]">
      💡 {children}
    </div>
  );
}
function Term({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`font-medium text-[var(--color-ink)] ${className ?? ''}`}>{children}</span>;
}

const SECTIONS: Section[] = [
  {
    id: 'introduccion',
    title: 'Introducción',
    icon: BookOpen,
    content: (
      <>
        <P>
          Esta plataforma es un ERP para administrar todo tu negocio: inventario, ventas, compras,
          gastos, dinero (caja y bancos), cuentas por cobrar y pagar, reportes y usuarios. Toda la
          información es real y las operaciones importantes se registran de forma atómica: por
          ejemplo, al confirmar una venta se descuenta el inventario, se registra el cobro y se crea
          la cuenta por cobrar en un solo paso, sin que queden datos a medias.
        </P>
        <Bullets
          items={[
            <>
              <Term>Multi-usuario con roles:</Term> cada persona ve y hace solo lo que su rol
              permite.
            </>,
            <>
              <Term>Todo queda auditado:</Term> cada operación sensible deja registro de quién y
              cuándo.
            </>,
            <>
              <Term>Funciona en el celular:</Term> está pensada para usarse desde el teléfono, ideal
              para el mostrador.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'primeros-pasos',
    title: 'Primeros pasos',
    icon: Rocket,
    content: (
      <>
        <P>
          Al crear tu organización se generan automáticamente una bodega principal, una caja, el
          impuesto por defecto y categorías de gasto. El panel de inicio te muestra una guía de 4
          pasos hasta que registres tu primera venta.
        </P>
        <Steps
          items={[
            <>
              <Term>Agrega tus productos</Term> en <Term>Inventario → Nuevo producto</Term> (nombre,
              precio de venta, código de barras y existencias iniciales si aplica).
            </>,
            <>
              <Term>Registra clientes y proveedores</Term> en las secciones correspondientes.
            </>,
            <>
              <Term>Registra tus compras</Term> para ingresar mercadería y que el sistema calcule el
              costo.
            </>,
            <>
              <Term>Haz tu primera venta</Term> desde el Punto de venta o desde Ventas.
            </>,
          ]}
        />
        <Tip>
          Antes de vender necesitas al menos una cuenta de dinero (caja o banco). Ya viene una caja
          creada; puedes agregar más en <Term>Caja y bancos</Term>.
        </Tip>
      </>
    ),
  },
  {
    id: 'pos',
    title: 'Punto de venta (POS)',
    icon: Store,
    content: (
      <>
        <P>
          Es la pantalla más rápida para vender de contado en el mostrador. Reutiliza el mismo motor
          que una venta normal, así que descuenta inventario y registra el cobro igual.
        </P>
        <Steps
          items={[
            <>Busca el producto por nombre/SKU, o toca <Term>Escanear</Term> para leer su código de barras con la cámara.</>,
            <>Ajusta las cantidades con los botones <Term>+ / −</Term> (o escribiendo el número).</>,
            <>Opcional: agrega un cliente y elige el método de pago y la cuenta de destino.</>,
            <>Si es efectivo, escribe el <Term>efectivo recibido</Term> y verás el <Term>cambio</Term> a devolver.</>,
            <>Toca <Term>Cobrar</Term>. La venta queda confirmada y el carrito se limpia para la siguiente.</>,
          ]}
        />
        <P>
          <Term>Factura y delivery:</Term> tras cobrar aparece un botón para abrir la{' '}
          <Term>Factura</Term> (imprimir o guardar como PDF). Si activas{' '}
          <Term>Es delivery</Term> y capturas la dirección, también podrás imprimir una{' '}
          <Term>Etiqueta de envío</Term> con el destinatario y la lista de empaque, para que el
          personal de almacén arme el paquete correctamente. Ambos documentos también están
          disponibles después desde la ficha de la venta.
        </P>
        <Tip>
          El POS es solo para ventas de contado. Para ventas a crédito, abonos parciales o guardar
          borradores, usa <Term>Ventas → Nueva venta</Term>.
        </Tip>
      </>
    ),
  },
  {
    id: 'ventas',
    title: 'Ventas',
    icon: ShoppingCart,
    content: (
      <>
        <P>
          Aquí registras ventas completas, con contado o crédito, y consultas su historial y estado.
        </P>
        <Bullets
          items={[
            <><Term>Contado:</Term> se cobra en el momento a la cuenta que elijas.</>,
            <><Term>Crédito:</Term> requiere un cliente; puedes registrar un abono inicial y el resto queda como cuenta por cobrar con fecha de vencimiento.</>,
            <><Term>Borrador:</Term> guarda la venta sin afectar inventario ni finanzas; la confirmas después.</>,
            <><Term>Anular / Devolver:</Term> desde la ficha de la venta puedes anularla o registrar una devolución, revirtiendo inventario y dinero.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'compras',
    title: 'Compras',
    icon: Truck,
    content: (
      <>
        <P>
          Registra la mercadería que compras a tus proveedores. Al recibir la compra, el sistema
          recalcula el <Term>costo promedio ponderado</Term> de cada producto (incluyendo flete y
          otros costos si los prorrateas).
        </P>
        <Steps
          items={[
            <>Crea la compra eligiendo proveedor y productos con sus costos.</>,
            <>Al <Term>recibir</Term> la mercadería, entran las existencias al inventario.</>,
            <>Registra el pago total o parcial; lo pendiente queda como <Term>cuenta por pagar</Term>.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'inventario',
    title: 'Inventario',
    icon: Boxes,
    content: (
      <>
        <P>
          El catálogo de productos con existencias, costo promedio y precios. Cada producto puede
          tener código de barras, categoría, unidad y stock mínimo para alertas.
        </P>
        <Bullets
          items={[
            <>
              <Term className="inline-flex items-center gap-1">
                <ScanLine className="inline h-3.5 w-3.5" /> Escanear:
              </Term>{' '}
              toca el botón <Term>Escanear</Term> para leer un código de barras con la cámara del
              celular y abrir la ficha del producto al instante. Si el código no existe, te lleva a
              crearlo.
            </>,
            <>
              <Term>Importar por CSV:</Term> el botón <Term>Importar</Term> te permite cargar muchos
              productos de una vez desde un archivo. Descarga la plantilla, complétala y súbela; el
              sistema valida cada fila y te informa de cualquier error.
            </>,
            <><Term>Movimientos (kardex):</Term> historial de cada entrada y salida de existencias.</>,
            <><Term>Ajustes:</Term> corrige existencias indicando siempre un motivo.</>,
            <><Term>Transferencias:</Term> mueve stock entre bodegas.</>,
            <><Term>Stock bajo:</Term> los productos en o por debajo del mínimo aparecen como alerta en el panel.</>,
          ]}
        />
        <Tip>
          El escaneo con cámara funciona mejor en <Term>Google Chrome en Android</Term>. En equipos
          sin cámara compatible, siempre puedes escribir el código manualmente.
        </Tip>
      </>
    ),
  },
  {
    id: 'gastos',
    title: 'Gastos',
    icon: Receipt,
    content: (
      <>
        <P>Registra los gastos operativos del negocio, con o sin pago inmediato.</P>
        <Bullets
          items={[
            <>Puedes pagar el gasto en el momento o dejarlo pendiente y pagarlo después.</>,
            <><Term>Gastos recurrentes:</Term> define gastos que se repiten (alquiler, servicios) y el sistema los genera automáticamente con una tarea diaria.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'relaciones',
    title: 'Clientes y proveedores',
    icon: UsersRound,
    content: (
      <>
        <P>
          Tu directorio comercial. Los clientes se usan en ventas a crédito y para dar seguimiento a
          lo que te deben; los proveedores en las compras y en lo que les debes.
        </P>
        <Bullets
          items={[
            <>Desde la ficha de un cliente ves su historial de ventas y su saldo por cobrar.</>,
            <>Desde la ficha de un proveedor ves sus compras y tu saldo por pagar.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'caja-bancos',
    title: 'Caja y bancos',
    icon: Wallet,
    content: (
      <>
        <P>
          Administra tus cuentas de dinero: caja, banco, tarjeta o billetera digital. Cada cobro,
          pago o transferencia se refleja en el saldo de la cuenta correspondiente.
        </P>
        <Bullets
          items={[
            <>Crea tantas cuentas como necesites y marca una como predeterminada.</>,
            <>Consulta el saldo y los movimientos de cada cuenta.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'cxc-cxp',
    title: 'Cuentas por cobrar y por pagar',
    icon: Coins,
    content: (
      <>
        <P>
          El control de créditos en ambos sentidos, con vencimientos y antigüedad de saldos.
        </P>
        <Bullets
          items={[
            <><Term>Por cobrar:</Term> lo que te deben tus clientes. Registra abonos y da seguimiento a los vencidos.</>,
            <><Term>Por pagar:</Term> lo que debes a proveedores. Registra pagos totales o parciales.</>,
            <>El panel de inicio te alerta de documentos vencidos o por vencer en los próximos 7 días.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'finanzas',
    title: 'Finanzas',
    icon: ArrowLeftRight,
    content: (
      <>
        <P>
          La visión del dinero del negocio. Todos los movimientos se registran en un libro mayor
          único, que es la fuente de verdad de tus finanzas.
        </P>
        <Bullets
          items={[
            <><Term>Transferencias internas:</Term> mueve dinero entre tus cuentas; no se cuentan como ingreso ni gasto.</>,
            <>Consulta el estado de resultados y el flujo de caja construidos desde tus operaciones reales.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'tienda',
    title: 'Tienda online',
    icon: Store,
    content: (
      <>
        <P>
          Vende por internet el mismo catálogo del ERP. La tienda tiene su propia dirección
          pública y se configura entera desde el panel, sin tocar código.
        </P>
        <Steps
          items={[
            <>
              <Term>Diseño:</Term> nombre, logo, color, moneda, zonas de envío y datos de pago.
              Elige también la etiqueta de variante: <Term>TALLA</Term> para ropa,{' '}
              <Term>MEDIDA</Term> para ferretería.
            </>,
            <>
              <Term>Vitrina:</Term> elige qué productos del inventario se publican y súbeles
              fotos. Si un producto se vende en varias tallas o medidas, agrégalas como
              variantes: cada una es otro producto tuyo, con su propio SKU y su existencia.
            </>,
            <>
              <Term>Publicar:</Term> la tienda nace en borrador y nadie puede verla. Cuando esté
              lista, cámbiala a publicada desde Diseño.
            </>,
            <>
              <Term>Pedidos:</Term> los pedidos llegan con su comprobante de pago. Revísalo y
              apruébalo: en ese momento se genera la venta, se descuenta el inventario y se
              registra el asiento.
            </>,
          ]}
        />
        <Tip>
          Un pedido pendiente no toca inventario ni dinero. Nada se mueve hasta que alguien lo
          aprueba, así que un pago falso no te descuadra el stock.
        </Tip>
        <Bullets
          items={[
            <>Si apruebas <Term>sin elegir una cuenta</Term>, la venta queda a crédito y aparece en cuentas por cobrar: es lo correcto cuando el cliente paga contra entrega.</>,
            <>El costo de envío se factura como una línea más, para que el total de la venta cuadre con lo que pagó el cliente.</>,
            <>Los <Term>cupones</Term> se crean en su propia pantalla y el descuento se traslada a la venta.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'reportes',
    title: 'Reportes',
    icon: FileBarChart,
    content: (
      <>
        <P>
          Centro de análisis con indicadores y reportes que puedes <Term>exportar a CSV y PDF</Term>.
        </P>
        <Bullets
          items={[
            <>Ventas por producto, por categoría y por periodo.</>,
            <>Rentabilidad, inventario valorizado y estados financieros.</>,
            <>Usa el selector de fechas para acotar cualquier reporte al periodo que necesites.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'usuarios-roles',
    title: 'Usuarios y roles',
    icon: Users,
    content: (
      <>
        <P>
          Invita a tu equipo y controla qué puede hacer cada quien. Hay 5 roles y más de 40 permisos
          granulares.
        </P>
        <Bullets
          items={[
            <><Term>Administrador:</Term> acceso total.</>,
            <><Term>Gerente, Ventas, Bodega, Contador:</Term> accesos acotados a su función.</>,
            <>Desde <Term>Roles y permisos</Term> revisas qué permite cada rol; desde <Term>Usuarios</Term> invitas personas y cambias su rol o estado.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'auditoria',
    title: 'Auditoría',
    icon: ShieldCheck,
    content: (
      <>
        <P>
          El registro inmutable de las operaciones sensibles: quién hizo qué y cuándo. Útil para
          control interno y para investigar cualquier discrepancia.
        </P>
      </>
    ),
  },
  {
    id: 'configuracion',
    title: 'Configuración',
    icon: Settings,
    content: (
      <>
        <P>
          Ajustes de la organización: nombre, moneda, impuestos, días de crédito por defecto y otras
          preferencias que afectan cómo se calculan y muestran las operaciones.
        </P>
      </>
    ),
  },
  {
    id: 'glosario',
    title: 'Glosario',
    icon: Landmark,
    content: (
      <>
        <Bullets
          items={[
            <><Term>Costo promedio ponderado:</Term> costo de cada producto recalculado con cada compra, para valorar el inventario y la utilidad de forma justa.</>,
            <><Term>Utilidad bruta:</Term> ventas menos el costo de lo vendido.</>,
            <><Term>Utilidad neta:</Term> utilidad bruta menos los gastos operativos.</>,
            <><Term>Cuenta por cobrar:</Term> dinero que un cliente te debe por una venta a crédito.</>,
            <><Term>Cuenta por pagar:</Term> dinero que debes a un proveedor por una compra a crédito.</>,
            <><Term>SKU:</Term> código interno único de cada producto.</>,
            <><Term>Kardex:</Term> historial detallado de entradas y salidas de un producto.</>,
          ]}
        />
      </>
    ),
  },
];

export default async function GuidePage() {
  await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  return (
    <>
      <PageHeader
        title="Guía de uso"
        description="Manual completo de la plataforma. Toca un tema para ir directo a su sección."
      />

      {/* Tabla de contenidos */}
      <Card className="mb-4 p-4">
        <nav aria-label="Contenido">
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" />
                    <span className="truncate">{section.title}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </Card>

      {/* Secciones */}
      <div className="space-y-4">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.id} id={section.id} className="scroll-mt-20 p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-[var(--color-ink)]">{section.title}</h2>
              </div>
              {section.content}
            </Card>
          );
        })}
      </div>
    </>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { formatStorePrice } from '@/lib/storefront';
import type { StoreSettings } from '@/types/store';
import { useCart } from '../cart';
import { ShopImage } from '../chrome';

/**
 * Carrito y checkout de la tienda.
 *
 * Reglas de dinero: todo lo que se pinta aquí es una PREVISUALIZACIÓN. El
 * precio, el descuento, el envío y el total definitivos los fija el servidor al
 * crear el pedido (`POST /api/tienda/{slug}/pedidos`), que recalcula desde el
 * catálogo publicado; el número que se cobra es el que devuelve esa respuesta y
 * es el que se muestra en la confirmación. Del carrito solo viajan `productId`
 * y cantidad.
 *
 * Decisión de maquetación: en escritorio son dos columnas —formulario a la
 * izquierda, resumen pegajoso a la derecha— y en móvil una sola con el resumen
 * AL FINAL, no plegado arriba. La razón es que el botón de confirmar tiene que
 * estar pegado al total: es el último instante en que el comprador decide, y
 * separarlos obliga a subir a comprobar cuánto va a pagar. Para que el importe
 * no desaparezca de vista mientras llena los datos, arriba queda una cinta
 * compacta con las unidades y el total, que además ancla al resumen.
 */

/** Foto del catálogo publicado para una opción vendible, resuelta en el servidor. */
export interface CheckoutStock {
  /** Unidades disponibles. `0` = agotado o retirado de la vitrina. */
  units: number;
  /** Precio vigente en centavos. Manda sobre el guardado en `localStorage`. */
  price: number;
}

interface ConfirmedOrder {
  orderId: string;
  number: string;
  /** Total que devolvió el servidor: es el que se cobra. */
  total: number;
  customerName: string;
  phone: string;
  address: string;
  zoneLabel: string | null;
  items: { title: string; variantLabel: string | null; quantity: number; amount: number }[];
  subtotal: number;
  discountCode: string | null;
  discountAmount: number;
  shippingCost: number;
}

type CouponState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; code: string; amount: number; percentOff: number | null }
  | { status: 'rejected'; reason: string };

/** Veredicto del servidor junto con el código y el carrito que lo produjeron. */
interface CheckedCoupon {
  code: string;
  cartKey: string;
  outcome: Extract<CouponState, { status: 'ok' } | { status: 'rejected' }>;
}

// --- Lectura defensiva de respuestas JSON ---------------------------------
// La API es propia, pero un `any` suelto acabaría propagándose por el estado.

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asFieldErrors(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  const result: Record<string, string> = {};
  for (const [key, message] of Object.entries(record)) {
    const text = asText(message);
    if (text) result[key] = text;
  }
  return result;
}

export function CheckoutForm({
  settings,
  stock,
}: {
  settings: StoreSettings;
  stock: Record<string, CheckoutStock>;
}) {
  const router = useRouter();
  const { lines, ready, setQuantity, remove, clear } = useCart();

  const symbol = settings.branding.currencySymbol;
  const base = `/t/${settings.slug}`;

  const [zoneId, setZoneId] = useState(settings.shippingZones[0]?.id ?? '');
  const [codeInput, setCodeInput] = useState('');
  /** Código que el comprador dio por bueno y que se prueba contra el servidor. */
  const [appliedCode, setAppliedCode] = useState('');
  /** Última respuesta del servidor, atada al código y al carrito que la pidieron. */
  const [checked, setChecked] = useState<CheckedCoupon | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [order, setOrder] = useState<ConfirmedOrder | null>(null);

  /**
   * Líneas del carrito contrastadas con la foto del catálogo: el precio
   * vigente gana al que quedó guardado en el navegador —un carrito puede tener
   * horas— y lo agotado se señala ANTES de llenar el formulario, en lugar de
   * que el comprador lo descubra con un pedido rechazado.
   */
  const priced = useMemo(
    () =>
      lines.map((line) => {
        const info = stock[line.productId];
        const unitPrice = info?.price ?? line.unitPrice;
        const units = info?.units ?? 0;
        return {
          ...line,
          unitPrice,
          amount: unitPrice * line.quantity,
          gone: !info || units <= 0,
          /** Unidades que quedan cuando el carrito pide más de las que hay. */
          shortfall: info && units > 0 && line.quantity > units ? units : null,
        };
      }),
    [lines, stock],
  );

  const subtotal = priced.reduce((acc, line) => acc + line.amount, 0);
  const units = priced.reduce((acc, line) => acc + line.quantity, 0);
  const unresolved = priced.some((line) => line.gone || line.shortfall !== null);

  const zone = settings.shippingZones.find((item) => item.id === zoneId) ?? null;
  const shippingCost = zone?.cost ?? 0;

  const discountsOn = settings.features.discounts;

  /** Firma del carrito: cambia con cualquier alta, baja o cambio de cantidad. */
  const cartKey = useMemo(
    () => lines.map((line) => `${line.productId}x${line.quantity}`).join('|'),
    [lines],
  );

  /**
   * El estado del cupón se DERIVA en lugar de guardarse: «validando» es no
   * tener todavía una respuesta para ESTE código y ESTE carrito. Así, cambiar
   * una cantidad invalida por sí solo el descuento anterior —un cupón con
   * compra mínima deja de valer al quitar una línea— sin sincronizar estados a
   * mano ni arrastrar un importe que ya no corresponde.
   */
  const coupon: CouponState =
    !discountsOn || !appliedCode || lines.length === 0
      ? { status: 'idle' }
      : checked && checked.code === appliedCode && checked.cartKey === cartKey
        ? checked.outcome
        : { status: 'checking' };

  const discountAmount = coupon.status === 'ok' ? Math.min(coupon.amount, subtotal) : 0;
  const total = Math.max(0, subtotal - discountAmount + shippingCost);

  /**
   * Validación del cupón en vivo contra el endpoint de previsualización, que
   * recalcula el subtotal en el servidor y no consume el uso del código. Lo
   * que devuelve es informativo: el importe definitivo lo fija el servidor al
   * crear el pedido.
   */
  useEffect(() => {
    if (!discountsOn || !appliedCode || lines.length === 0) return;

    const controller = new AbortController();

    void (async () => {
      // Las respuestas fuera de plazo se descartan por el `abort`, así que dos
      // cambios seguidos de cantidad no pueden dejar el descuento del anterior.
      const settle = (outcome: CheckedCoupon['outcome']) => {
        if (controller.signal.aborted) return;
        setChecked({ code: appliedCode, cartKey, outcome });
      };

      try {
        const response = await fetch(`/api/tienda/${settings.slug}/cupon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: appliedCode,
            items: lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
            })),
          }),
          signal: controller.signal,
        });

        const payload: unknown = await response.json().catch(() => null);
        const record = asRecord(payload);

        if (!response.ok) {
          settle({
            status: 'rejected',
            reason: asText(record?.error) ?? 'No pudimos validar el cupón.',
          });
          return;
        }

        if (record?.applies === true) {
          settle({
            status: 'ok',
            code: asText(record.code) ?? appliedCode,
            amount: asNumber(record.amount) ?? 0,
            percentOff: asNumber(record.percentOff),
          });
          return;
        }

        settle({
          status: 'rejected',
          reason: asText(record?.reason) ?? 'El cupón no aplica en este carrito.',
        });
      } catch {
        settle({
          status: 'rejected',
          reason: 'No pudimos validar el cupón. Revisa tu conexión.',
        });
      }
    })();

    return () => controller.abort();
  }, [appliedCode, cartKey, lines, discountsOn, settings.slug]);

  function applyCoupon() {
    setAppliedCode(codeInput.trim().toUpperCase());
  }

  function clearCoupon() {
    setCodeInput('');
    setAppliedCode('');
    setChecked(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || priced.length === 0 || unresolved) return;

    const form = new FormData(event.currentTarget);
    const customerName = String(form.get('name') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const address = String(form.get('address') ?? '').trim();

    setSending(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await fetch(`/api/tienda/${settings.slug}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: customerName,
            phone,
            email: String(form.get('email') ?? ''),
            document: String(form.get('document') ?? ''),
          },
          address,
          addressNotes: String(form.get('addressNotes') ?? ''),
          shippingZoneId: zoneId || null,
          // Solo se manda el cupón que el servidor ya dio por bueno: un código
          // rechazado tumbaría el pedido entero por un descuento que igual no
          // iba a aplicarse.
          discountCode: coupon.status === 'ok' ? coupon.code : null,
          notes: String(form.get('notes') ?? ''),
          items: priced.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          })),
        }),
      });

      const payload: unknown = await response.json().catch(() => null);
      const record = asRecord(payload);

      if (!response.ok) {
        // El mensaje del servidor se muestra tal cual —«nos quedamos sin
        // existencias de X», «el cupón está vencido»— y el formulario no se
        // desmonta, así que nada de lo escrito se pierde.
        setError(asText(record?.error) ?? 'No pudimos registrar tu pedido. Intenta de nuevo.');
        setFieldErrors(asFieldErrors(record?.fieldErrors));
        return;
      }

      setOrder({
        orderId: asText(record?.orderId) ?? '',
        number: asText(record?.number) ?? '',
        total: asNumber(record?.total) ?? total,
        customerName,
        phone,
        address,
        zoneLabel: zone?.label ?? null,
        items: priced.map((line) => ({
          title: line.title,
          variantLabel: line.variantLabel,
          quantity: line.quantity,
          amount: line.amount,
        })),
        subtotal,
        discountCode: coupon.status === 'ok' ? coupon.code : null,
        discountAmount,
        shippingCost,
      });
      clear();
    } catch {
      setError('No pudimos conectar con la tienda. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSending(false);
    }
  }

  // ---- Pedido confirmado -------------------------------------------------

  if (order) {
    return <OrderConfirmation settings={settings} order={order} />;
  }

  // ---- Carrito aún sin hidratar -----------------------------------------

  if (!ready) {
    return (
      <div className="px-4 py-24 text-center md:px-8">
        <p className="shop-mono text-xs tracking-[0.3em]" style={{ color: 'var(--shop-ink-subtle)' }}>
          CARGANDO TU CARRITO…
        </p>
      </div>
    );
  }

  // ---- Carrito vacío -----------------------------------------------------

  if (priced.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 px-4 py-24 text-center md:px-8">
        <span className="text-6xl md:text-7xl" aria-hidden="true">
          🛒
        </span>
        <p className="shop-display text-5xl md:text-6xl" style={{ color: 'var(--shop-ink-subtle)' }}>
          Carrito vacío
        </p>
        <p className="shop-mono text-xs tracking-[0.2em]" style={{ color: 'var(--shop-ink-subtle)' }}>
          NO HAY ARTÍCULOS PARA PAGAR
        </p>
        <Link href={base} className="shop-btn mt-2">
          ← Volver a la vitrina
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={base}
            className="shop-mono text-[11px] tracking-[0.2em] transition-colors hover:text-white"
            style={{ color: 'var(--shop-ink-subtle)' }}
          >
            ← SEGUIR COMPRANDO
          </Link>
          <h1 className="shop-display mt-2 text-5xl md:text-6xl">Checkout</h1>
        </div>

        {/* Cinta de importe: mantiene el total a la vista en móvil, donde el
            resumen queda al final. */}
        <a
          href="#resumen"
          className="shop-mono flex items-baseline gap-2 border px-3 py-2 text-xs tracking-[0.15em] lg:hidden"
          style={{ borderColor: 'var(--shop-line)', color: 'var(--shop-ink-muted)' }}
        >
          {units} ART.
          <span style={{ color: 'var(--accent)' }}>{formatStorePrice(total, symbol)}</span>
        </a>
      </div>

      <form onSubmit={onSubmit} className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]" noValidate>
        <div className="space-y-10">
          <section className="space-y-4">
            <h2 className="shop-section-title">Tus datos</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="name"
                label="Nombre completo"
                error={fieldErrors['customer.name']}
                autoComplete="name"
                maxLength={120}
                required
              />
              <Field
                id="phone"
                label="Teléfono / WhatsApp"
                error={fieldErrors['customer.phone']}
                autoComplete="tel"
                inputMode="tel"
                maxLength={30}
                required
              />
              <Field
                id="email"
                label="Correo (opcional)"
                error={fieldErrors['customer.email']}
                type="email"
                autoComplete="email"
                maxLength={120}
              />
              <Field
                id="document"
                label="Cédula / RUC (opcional)"
                error={fieldErrors['customer.document']}
                maxLength={40}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="shop-section-title">Entrega</h2>

            {/* Pocas zonas se eligen como en la plantilla, con fichas de acento que
                muestran el costo; a partir de siete el muro de botones deja de
                leerse y gana la lista. */}
            {settings.shippingZones.length > 6 ? (
              <div>
                <label className="shop-label" htmlFor="zone">
                  Zona de envío
                </label>
                <select
                  id="zone"
                  className="shop-select"
                  value={zoneId}
                  onChange={(event) => setZoneId(event.target.value)}
                >
                  {settings.shippingZones.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} — {item.cost === 0 ? 'gratis' : formatStorePrice(item.cost, symbol)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              settings.shippingZones.length > 0 && (
                <fieldset>
                  <legend className="shop-label">Zona de envío</legend>
                  <div className="flex flex-wrap gap-2">
                    {settings.shippingZones.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setZoneId(item.id)}
                        data-active={item.id === zoneId ? 'true' : undefined}
                        aria-pressed={item.id === zoneId}
                        className="shop-btn-outline flex-1 flex-col gap-0 px-4 py-3"
                        style={{ minWidth: '9rem' }}
                      >
                        <span>{item.label}</span>
                        <span className="shop-mono text-[11px] font-normal tracking-normal">
                          {item.cost === 0 ? 'GRATIS' : formatStorePrice(item.cost, symbol)}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )
            )}

            <div>
              <label className="shop-label" htmlFor="address">
                Dirección exacta
              </label>
              <textarea
                id="address"
                name="address"
                className="shop-textarea"
                rows={3}
                required
                maxLength={400}
                autoComplete="street-address"
                placeholder="Barrio, calle, número de casa…"
              />
              <FieldError message={fieldErrors.address} />
            </div>

            <Field
              id="addressNotes"
              label="Referencias para llegar (opcional)"
              error={fieldErrors.addressNotes}
              maxLength={300}
              placeholder="Portón negro, frente al parque…"
            />

            <Field
              id="notes"
              label="Nota para el pedido (opcional)"
              error={fieldErrors.notes}
              maxLength={500}
            />
          </section>
        </div>

        <aside
          id="resumen"
          className="space-y-5 border p-5 lg:sticky lg:top-28"
          style={{ borderColor: 'var(--shop-line)', background: 'var(--shop-surface)' }}
        >
          <h2 className="shop-display text-3xl">{settings.branding.cartTitle}</h2>

          <ul className="space-y-4">
            {priced.map((line) => (
              <li key={line.productId} className="flex gap-3">
                <div
                  className="h-20 w-16 shrink-0 overflow-hidden border"
                  style={{ borderColor: 'var(--shop-line-soft)', background: 'var(--shop-surface-2)' }}
                >
                  <ShopImage src={line.imageUrl} alt={line.title} width={160} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="shop-display truncate text-lg leading-tight">{line.title}</p>
                  {line.variantLabel && (
                    <p
                      className="shop-mono text-[10px] tracking-[0.15em]"
                      style={{ color: 'var(--shop-ink-subtle)' }}
                    >
                      {settings.branding.variantLabel}: {line.variantLabel}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className="flex items-center border"
                      style={{ borderColor: 'var(--shop-line)' }}
                    >
                      <button
                        type="button"
                        className="px-2 py-1 text-sm leading-none"
                        style={{ color: 'var(--shop-ink-muted)' }}
                        onClick={() => setQuantity(line.productId, line.quantity - 1)}
                        aria-label={`Quitar una unidad de ${line.title}`}
                      >
                        −
                      </button>
                      <span className="shop-mono w-7 text-center text-sm">{line.quantity}</span>
                      <button
                        type="button"
                        className="px-2 py-1 text-sm leading-none disabled:opacity-30"
                        style={{ color: 'var(--shop-ink-muted)' }}
                        onClick={() => setQuantity(line.productId, line.quantity + 1)}
                        disabled={line.gone || (stock[line.productId]?.units ?? 0) <= line.quantity}
                        aria-label={`Agregar una unidad de ${line.title}`}
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(line.productId)}
                      className="shop-mono text-[10px] tracking-[0.15em] underline"
                      style={{ color: 'var(--shop-ink-subtle)' }}
                    >
                      QUITAR
                    </button>
                  </div>

                  {line.gone && (
                    <p className="shop-mono mt-1 text-[10px] tracking-[0.1em]" style={{ color: '#ff6b6b' }}>
                      AGOTADO · QUÍTALO PARA CONTINUAR
                    </p>
                  )}
                  {!line.gone && line.shortfall !== null && (
                    <p
                      className="shop-mono mt-1 flex flex-wrap items-center gap-2 text-[10px] tracking-[0.1em]"
                      style={{ color: '#ff6b6b' }}
                    >
                      {/* El número solo se dice si el comercio muestra existencias. */}
                      {settings.features.showStock
                        ? `SOLO QUEDAN ${line.shortfall}`
                        : 'NO HAY TANTAS UNIDADES'}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setQuantity(line.productId, shortfallOf(line))}
                      >
                        AJUSTAR
                      </button>
                    </p>
                  )}
                </div>

                <p className="shop-mono shrink-0 text-sm">
                  {formatStorePrice(line.amount, symbol)}
                </p>
              </li>
            ))}
          </ul>

          {discountsOn && (
            <div className="border-t pt-4" style={{ borderColor: 'var(--shop-line)' }}>
              <label className="shop-label" htmlFor="discount">
                Cupón
              </label>

              {coupon.status === 'ok' ? (
                <div
                  className="flex items-center justify-between gap-3 border px-3 py-2"
                  style={{ borderColor: 'var(--accent)', background: 'rgb(var(--accent-rgb) / 0.08)' }}
                >
                  <div>
                    <p className="shop-display text-xl" style={{ color: 'var(--accent)' }}>
                      {coupon.code}
                    </p>
                    <p className="shop-mono text-[10px] tracking-[0.15em]" style={{ color: 'var(--shop-ink-muted)' }}>
                      {coupon.percentOff !== null
                        ? `${coupon.percentOff}% OFF`
                        : `${formatStorePrice(discountAmount, symbol)} OFF`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearCoupon}
                    className="shop-mono text-[10px] tracking-[0.15em] underline"
                    style={{ color: 'var(--shop-ink-subtle)' }}
                  >
                    QUITAR
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    id="discount"
                    className="shop-input shop-mono flex-1 tracking-[0.15em]"
                    value={codeInput}
                    onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
                    onBlur={applyCoupon}
                    placeholder="CODIGO"
                    maxLength={24}
                    autoComplete="off"
                    aria-describedby="cupon-estado"
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    className="shop-btn-outline shrink-0"
                    disabled={coupon.status === 'checking' || codeInput.trim().length === 0}
                  >
                    {coupon.status === 'checking' ? '…' : 'Aplicar'}
                  </button>
                </div>
              )}

              <p
                id="cupon-estado"
                aria-live="polite"
                className="shop-mono mt-2 text-[10px] leading-relaxed tracking-[0.1em]"
                style={{
                  color: coupon.status === 'rejected' ? '#ff6b6b' : 'var(--shop-ink-subtle)',
                }}
              >
                {coupon.status === 'checking' && 'VALIDANDO CÓDIGO…'}
                {coupon.status === 'rejected' && coupon.reason.toUpperCase()}
                {coupon.status === 'ok' &&
                  `DESCUENTO APLICADO: ${formatStorePrice(discountAmount, symbol)}`}
                {coupon.status === 'idle' && 'SE VALIDA AL SALIR DEL CAMPO O AL PULSAR APLICAR.'}
              </p>
            </div>
          )}

          <dl
            className="space-y-2 border-t pt-4 text-sm"
            style={{ borderColor: 'var(--shop-line)' }}
            aria-live="polite"
          >
            <div className="flex justify-between" style={{ color: 'var(--shop-ink-muted)' }}>
              <dt>Subtotal</dt>
              <dd className="shop-mono">{formatStorePrice(subtotal, symbol)}</dd>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between" style={{ color: 'var(--accent)' }}>
                <dt>Descuento{coupon.status === 'ok' ? ` (${coupon.code})` : ''}</dt>
                <dd className="shop-mono">− {formatStorePrice(discountAmount, symbol)}</dd>
              </div>
            )}
            <div className="flex justify-between" style={{ color: 'var(--shop-ink-muted)' }}>
              <dt>Envío{zone ? ` · ${zone.label}` : ''}</dt>
              <dd className="shop-mono">
                {shippingCost === 0 ? 'Gratis' : formatStorePrice(shippingCost, symbol)}
              </dd>
            </div>
            <div
              className="flex items-end justify-between border-t pt-3"
              style={{ borderColor: 'var(--shop-line)' }}
            >
              <dt className="shop-display text-xl">Total</dt>
              <dd className="shop-mono text-2xl" style={{ color: 'var(--accent)' }}>
                {formatStorePrice(total, symbol)}
              </dd>
            </div>
          </dl>

          {error && (
            <div
              role="alert"
              className="border p-3 text-sm leading-relaxed"
              style={{ borderColor: '#ff6b6b', background: 'rgb(255 107 107 / 0.08)', color: '#ffb3b3' }}
            >
              <p className="shop-mono mb-1 text-[10px] tracking-[0.2em]">NO SE PUDO CONFIRMAR</p>
              {error}
              {/* La disponibilidad que se pintó es la del momento en que se
                  abrió el checkout. Recargar los datos del servidor conserva lo
                  que el comprador ya escribió, porque el formulario no se
                  desmonta. */}
              <button
                type="button"
                onClick={() => router.refresh()}
                className="shop-mono mt-2 block text-[10px] tracking-[0.15em] underline"
              >
                ACTUALIZAR PRECIOS Y DISPONIBILIDAD
              </button>
            </div>
          )}

          {unresolved && (
            <p className="shop-mono text-[10px] leading-relaxed tracking-[0.1em]" style={{ color: '#ff6b6b' }}>
              AJUSTA LAS LÍNEAS MARCADAS PARA CONTINUAR.
            </p>
          )}

          <button type="submit" className="shop-btn w-full" disabled={sending || unresolved}>
            {sending ? 'Enviando…' : 'Confirmar pedido'}
          </button>

          <p className="text-xs leading-relaxed" style={{ color: 'var(--shop-ink-subtle)' }}>
            Al confirmar recibirás el número de pedido y los datos para pagar. La tienda revisa el
            comprobante antes de despachar.
          </p>
        </aside>
      </form>
    </div>
  );
}

/** Unidades a las que hay que bajar una línea cuando el carrito pide de más. */
function shortfallOf(line: { shortfall: number | null; quantity: number }): number {
  return line.shortfall ?? line.quantity;
}

// ---------------------------------------------------------------------------
// Confirmación
// ---------------------------------------------------------------------------

function OrderConfirmation({
  settings,
  order,
}: {
  settings: StoreSettings;
  order: ConfirmedOrder;
}) {
  const symbol = settings.branding.currencySymbol;
  const base = `/t/${settings.slug}`;

  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptSent, setReceiptSent] = useState(false);
  const [uploading, setUploading] = useState(false);

  const whatsapp = settings.branding.whatsapp;

  async function onUploadReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading) return;

    const form = new FormData(event.currentTarget);
    form.append('orderId', order.orderId);

    setUploading(true);
    setReceiptError(null);

    try {
      const response = await fetch(`/api/tienda/${settings.slug}/comprobante`, {
        method: 'POST',
        body: form,
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setReceiptError(asText(asRecord(payload)?.error) ?? 'No pudimos subir tu comprobante.');
        return;
      }
      setReceiptSent(true);
    } catch {
      setReceiptError('No pudimos subir tu comprobante. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 pb-16 pt-8 md:px-8">
      <div
        className="border p-6 text-center"
        style={{ borderColor: 'var(--accent)', background: 'rgb(var(--accent-rgb) / 0.06)' }}
      >
        <p className="shop-eyebrow">Pedido recibido</p>
        <p className="shop-display mt-2 text-6xl md:text-7xl" style={{ color: 'var(--accent)' }}>
          #{order.number}
        </p>
        <p className="shop-label mt-4">Total a pagar</p>
        <p className="shop-mono text-3xl">{formatStorePrice(order.total, symbol)}</p>
      </div>

      {settings.paymentInstructions.length === 0 && (
        <p
          className="border p-4 text-sm leading-relaxed"
          style={{ borderColor: 'var(--shop-line)', color: 'var(--shop-ink-muted)' }}
        >
          {settings.branding.name} te confirma los datos de pago
          {settings.branding.whatsapp ? ' por WhatsApp' : ''} con el número{' '}
          <span className="shop-mono">#{order.number}</span>.
        </p>
      )}

      {settings.paymentInstructions.length > 0 && (
        <section className="border p-5" style={{ borderColor: 'var(--shop-line)' }}>
          <h2 className="shop-section-title mb-4 text-xl">Cómo pagar</h2>
          <ul className="space-y-4">
            {settings.paymentInstructions.map((instruction) => (
              <li
                key={instruction.id}
                className="space-y-2 border p-4"
                style={{ borderColor: 'var(--shop-line-soft)', background: 'var(--shop-surface-2)' }}
              >
                <p className="shop-display text-xl">{instruction.label}</p>
                <div className="flex items-center justify-between gap-3">
                  <p className="shop-mono break-all text-lg" style={{ color: 'var(--accent)' }}>
                    {instruction.detail}
                  </p>
                  <CopyButton value={instruction.detail} label={instruction.label} />
                </div>
                {instruction.notes && (
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--shop-ink-muted)' }}>
                    {instruction.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {receiptSent ? (
        <div className="border p-5 text-center" style={{ borderColor: 'var(--accent)' }}>
          <p className="shop-display text-3xl" style={{ color: 'var(--accent)' }}>
            Comprobante recibido
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--shop-ink-muted)' }}>
            {settings.branding.name} revisa tu pago y te confirma el pedido{' '}
            {whatsapp ? 'por WhatsApp' : 'por el medio que dejaste'}. Guarda el número{' '}
            <span className="shop-mono">#{order.number}</span> para cualquier consulta.
          </p>
        </div>
      ) : (
        <form
          onSubmit={onUploadReceipt}
          className="space-y-4 border p-5"
          style={{ borderColor: 'var(--shop-line)' }}
        >
          <h2 className="shop-section-title text-xl">Sube tu comprobante</h2>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--shop-ink-muted)' }}>
            Transfiere el total y adjunta la captura. Sin comprobante el pedido queda esperando.
          </p>

          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed p-6 text-center transition-colors"
            style={{ borderColor: 'var(--shop-line)' }}
          >
            <span className="text-3xl" aria-hidden="true">
              {receiptName ? '📄' : '📎'}
            </span>
            <span
              className="shop-mono text-[11px] tracking-[0.15em]"
              style={{ color: receiptName ? 'var(--accent)' : 'var(--shop-ink-subtle)' }}
            >
              {receiptName ? receiptName.toUpperCase() : 'TOCA PARA ADJUNTAR LA CAPTURA'}
            </span>
            <input
              className="sr-only"
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={(event) => setReceiptName(event.target.files?.[0]?.name ?? null)}
            />
          </label>

          <div>
            <label className="shop-label" htmlFor="reference">
              Número de referencia (opcional)
            </label>
            <input id="reference" className="shop-input shop-mono" name="reference" maxLength={80} />
          </div>

          {receiptError && (
            <p role="alert" className="text-sm" style={{ color: '#ff6b6b' }}>
              {receiptError}
            </p>
          )}

          <button type="submit" className="shop-btn w-full" disabled={uploading}>
            {uploading ? 'Subiendo…' : 'Enviar comprobante'}
          </button>
        </form>
      )}

      {whatsapp && (
        <a
          href={orderWhatsappHref(whatsapp, settings.branding.name, order, symbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="shop-btn w-full"
          style={{ background: '#25D366', borderColor: '#25D366', color: '#000' }}
        >
          Enviar el pedido por WhatsApp
        </a>
      )}

      <Link href={base} className="shop-btn shop-btn-outline w-full justify-center py-3">
        Seguir comprando
      </Link>
    </div>
  );
}

/**
 * Copia al portapapeles el dato que hay que transferir. Si el navegador no lo
 * permite (contexto no seguro), el número sigue visible y seleccionable: el
 * botón solo deja de confirmar.
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="shop-btn-outline shrink-0"
      aria-label={`Copiar ${label}`}
    >
      {copied ? '¡Copiado!' : failed ? 'Copia manual' : 'Copiar'}
    </button>
  );
}

/**
 * Mensaje de WhatsApp con el pedido ya escrito: es como cierran la venta estas
 * tiendas. El total es el que devolvió el servidor; el desglose es el que vio
 * el comprador.
 *
 * `whatsappHref` de `@/lib/storefront` solo arma el mensaje de un producto, así
 * que el del pedido se compone aquí.
 */
function orderWhatsappHref(
  phone: string,
  brandName: string,
  order: ConfirmedOrder,
  symbol: string,
): string {
  const rows = [
    `*PEDIDO #${order.number}* · ${brandName}`,
    '',
    `Cliente: ${order.customerName}`,
    `Teléfono: ${order.phone}`,
    order.zoneLabel ? `Zona: ${order.zoneLabel}` : null,
    `Dirección: ${order.address}`,
    '',
    '*PRODUCTOS*',
    ...order.items.map(
      (item) =>
        `▪️ ${item.quantity} x ${item.title}${
          item.variantLabel ? ` (${item.variantLabel})` : ''
        } — ${formatStorePrice(item.amount, symbol)}`,
    ),
    '',
    `Subtotal: ${formatStorePrice(order.subtotal, symbol)}`,
    order.discountAmount > 0
      ? `Descuento (${order.discountCode ?? ''}): -${formatStorePrice(order.discountAmount, symbol)}`
      : null,
    `Envío: ${
      order.shippingCost === 0 ? 'Gratis' : formatStorePrice(order.shippingCost, symbol)
    }`,
    `*TOTAL: ${formatStorePrice(order.total, symbol)}*`,
    '',
    'Ya hice el pedido en la tienda. Aquí les mando el comprobante.',
  ].filter((row): row is string => row !== null);

  return `https://wa.me/${phone}?text=${encodeURIComponent(rows.join('\n'))}`;
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

function Field({
  id,
  label,
  error,
  type = 'text',
  ...rest
}: {
  id: string;
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="shop-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        className="shop-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs" style={{ color: '#ff6b6b' }}>
      {message}
    </p>
  );
}

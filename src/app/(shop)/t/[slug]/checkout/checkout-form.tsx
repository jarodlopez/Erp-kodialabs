'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { formatStorePrice } from '@/lib/storefront';
import type { StoreSettings } from '@/types/store';
import { useCart } from '../cart';
import { ShopImage } from '../chrome';

/**
 * Checkout de la tienda.
 *
 * Los totales que se pintan aquí son una previsualización: el servidor
 * recalcula precios, envío, cupón y total al recibir el pedido, y lo que
 * devuelve es lo que se cobra. El comprobante se sube después de tener el
 * número de pedido, que es lo que permite atarlo a un pedido concreto.
 */

interface ConfirmedOrder {
  orderId: string;
  number: string;
  total: number;
}

export function CheckoutForm({ settings }: { settings: StoreSettings }) {
  const { lines, subtotal, ready, setQuantity, remove, clear } = useCart();
  const symbol = settings.branding.currencySymbol;

  const [zoneId, setZoneId] = useState(settings.shippingZones[0]?.id ?? '');
  const [discountCode, setDiscountCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [order, setOrder] = useState<ConfirmedOrder | null>(null);

  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptSent, setReceiptSent] = useState(false);
  const [uploading, setUploading] = useState(false);

  const shippingCost = useMemo(
    () => settings.shippingZones.find((zone) => zone.id === zoneId)?.cost ?? 0,
    [settings.shippingZones, zoneId],
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || lines.length === 0) return;

    const form = new FormData(event.currentTarget);
    setSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/tienda/${settings.slug}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: String(form.get('name') ?? ''),
            phone: String(form.get('phone') ?? ''),
            email: String(form.get('email') ?? ''),
            document: String(form.get('document') ?? ''),
          },
          address: String(form.get('address') ?? ''),
          addressNotes: String(form.get('addressNotes') ?? ''),
          shippingZoneId: zoneId || null,
          discountCode: settings.features.discounts ? discountCode.trim() || null : null,
          notes: String(form.get('notes') ?? ''),
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          })),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error ?? 'No pudimos registrar tu pedido. Intenta de nuevo.');
        return;
      }

      setOrder({ orderId: payload.orderId, number: payload.number, total: payload.total });
      clear();
    } catch {
      setError('No pudimos conectar con la tienda. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSending(false);
    }
  }

  async function onUploadReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || uploading) return;

    const form = new FormData(event.currentTarget);
    form.append('orderId', order.orderId);

    setUploading(true);
    setReceiptError(null);

    try {
      const response = await fetch(`/api/tienda/${settings.slug}/comprobante`, {
        method: 'POST',
        body: form,
      });
      const payload = await response.json();

      if (!response.ok) {
        setReceiptError(payload?.error ?? 'No pudimos subir tu comprobante.');
        return;
      }
      setReceiptSent(true);
    } catch {
      setReceiptError('No pudimos subir tu comprobante. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  // ---- Pedido confirmado -------------------------------------------------

  if (order) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="border p-6 text-center" style={{ borderColor: 'var(--accent)' }}>
          <p className="shop-eyebrow">Pedido recibido</p>
          <p className="shop-display mt-2 text-4xl" style={{ color: 'var(--accent)' }}>
            #{order.number}
          </p>
          <p className="mt-3 text-sm" style={{ color: 'var(--shop-ink-muted)' }}>
            Total a pagar: <strong>{formatStorePrice(order.total, symbol)}</strong>
          </p>
        </div>

        {settings.paymentInstructions.length > 0 && (
          <div className="border p-5" style={{ borderColor: 'var(--shop-line)' }}>
            <p className="shop-eyebrow mb-3">Paga con</p>
            <ul className="space-y-3">
              {settings.paymentInstructions.map((instruction) => (
                <li key={instruction.id}>
                  <p className="text-sm font-bold">{instruction.label}</p>
                  <p className="text-sm" style={{ color: 'var(--accent)' }}>
                    {instruction.detail}
                  </p>
                  {instruction.notes && (
                    <p className="text-xs" style={{ color: 'var(--shop-ink-subtle)' }}>
                      {instruction.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {receiptSent ? (
          <p
            className="border p-4 text-center text-sm"
            style={{ borderColor: 'var(--shop-line)', color: 'var(--shop-ink-muted)' }}
          >
            Recibimos tu comprobante. Te confirmamos el pedido en cuanto lo revisemos.
          </p>
        ) : (
          <form onSubmit={onUploadReceipt} className="space-y-3 border p-5" style={{ borderColor: 'var(--shop-line)' }}>
            <p className="shop-eyebrow">Sube tu comprobante</p>
            <input
              className="shop-input"
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
            <input
              className="shop-input"
              name="reference"
              placeholder="Número de referencia (opcional)"
              maxLength={80}
            />
            {receiptError && (
              <p className="text-sm" style={{ color: '#ff6b6b' }}>
                {receiptError}
              </p>
            )}
            <button type="submit" className="shop-btn w-full" disabled={uploading}>
              {uploading ? 'Subiendo…' : 'Enviar comprobante'}
            </button>
          </form>
        )}

        <Link href={`/t/${settings.slug}`} className="shop-btn shop-btn-outline w-full">
          Seguir comprando
        </Link>
      </div>
    );
  }

  // ---- Carrito vacío -----------------------------------------------------

  if (ready && lines.length === 0) {
    return (
      <div className="space-y-6 py-16 text-center">
        <p className="shop-display text-3xl">Tu carrito está vacío</p>
        <Link href={`/t/${settings.slug}`} className="shop-btn">
          Ver productos
        </Link>
      </div>
    );
  }

  const total = subtotal + shippingCost;

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_380px]" noValidate>
      <div className="space-y-6">
        <section className="space-y-4">
          <h2 className="shop-display text-2xl">Tus datos</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="shop-label" htmlFor="name">
                Nombre completo
              </label>
              <input id="name" name="name" className="shop-input" required maxLength={120} />
            </div>
            <div>
              <label className="shop-label" htmlFor="phone">
                Teléfono / WhatsApp
              </label>
              <input
                id="phone"
                name="phone"
                className="shop-input"
                required
                inputMode="tel"
                maxLength={30}
              />
            </div>
            <div>
              <label className="shop-label" htmlFor="email">
                Correo (opcional)
              </label>
              <input id="email" name="email" type="email" className="shop-input" maxLength={120} />
            </div>
            <div>
              <label className="shop-label" htmlFor="document">
                Cédula / RUC (opcional)
              </label>
              <input id="document" name="document" className="shop-input" maxLength={40} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="shop-display text-2xl">Entrega</h2>

          {settings.shippingZones.length > 0 && (
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
                {settings.shippingZones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.label} —{' '}
                    {zone.cost === 0 ? 'gratis' : formatStorePrice(zone.cost, symbol)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="shop-label" htmlFor="address">
              Dirección
            </label>
            <textarea
              id="address"
              name="address"
              className="shop-textarea"
              rows={3}
              required
              maxLength={400}
            />
          </div>

          <div>
            <label className="shop-label" htmlFor="addressNotes">
              Referencias para llegar (opcional)
            </label>
            <input id="addressNotes" name="addressNotes" className="shop-input" maxLength={300} />
          </div>

          <div>
            <label className="shop-label" htmlFor="notes">
              Nota para el pedido (opcional)
            </label>
            <input id="notes" name="notes" className="shop-input" maxLength={500} />
          </div>
        </section>
      </div>

      <aside
        className="h-fit space-y-4 border p-5"
        style={{ borderColor: 'var(--shop-line)', background: 'var(--shop-surface)' }}
      >
        <h2 className="shop-display text-xl">{settings.branding.cartTitle}</h2>

        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.productId} className="flex gap-3">
              <div className="h-16 w-14 shrink-0 overflow-hidden" style={{ background: 'var(--shop-surface-2)' }}>
                <ShopImage src={line.imageUrl} alt={line.title} width={400} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold uppercase">{line.title}</p>
                {line.variantLabel && (
                  <p className="text-xs" style={{ color: 'var(--shop-ink-subtle)' }}>
                    {settings.branding.variantLabel}: {line.variantLabel}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) => setQuantity(line.productId, Number(event.target.value))}
                    className="shop-input w-16 px-2 py-1 text-sm"
                    aria-label={`Cantidad de ${line.title}`}
                  />
                  <button
                    type="button"
                    onClick={() => remove(line.productId)}
                    className="text-xs underline"
                    style={{ color: 'var(--shop-ink-subtle)' }}
                  >
                    Quitar
                  </button>
                </div>
              </div>
              <p className="text-sm font-bold">
                {formatStorePrice(line.unitPrice * line.quantity, symbol)}
              </p>
            </li>
          ))}
        </ul>

        {settings.features.discounts && (
          <div>
            <label className="shop-label" htmlFor="discount">
              Cupón
            </label>
            <input
              id="discount"
              className="shop-input"
              value={discountCode}
              onChange={(event) => setDiscountCode(event.target.value.toUpperCase())}
              placeholder="CODIGO"
              maxLength={24}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--shop-ink-subtle)' }}>
              El descuento se aplica al confirmar el pedido.
            </p>
          </div>
        )}

        <dl className="space-y-1 border-t pt-3 text-sm" style={{ borderColor: 'var(--shop-line)' }}>
          <div className="flex justify-between" style={{ color: 'var(--shop-ink-muted)' }}>
            <dt>Subtotal</dt>
            <dd>{formatStorePrice(subtotal, symbol)}</dd>
          </div>
          <div className="flex justify-between" style={{ color: 'var(--shop-ink-muted)' }}>
            <dt>Envío</dt>
            <dd>{shippingCost === 0 ? 'Gratis' : formatStorePrice(shippingCost, symbol)}</dd>
          </div>
          <div className="flex justify-between pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd style={{ color: 'var(--accent)' }}>{formatStorePrice(total, symbol)}</dd>
          </div>
        </dl>

        {error && (
          <p className="text-sm" style={{ color: '#ff6b6b' }}>
            {error}
          </p>
        )}

        <button type="submit" className="shop-btn w-full" disabled={sending || lines.length === 0}>
          {sending ? 'Enviando…' : 'Confirmar pedido'}
        </button>

        <p className="text-xs" style={{ color: 'var(--shop-ink-subtle)' }}>
          Al confirmar recibirás el número de pedido y los datos para pagar.
        </p>
      </aside>
    </form>
  );
}

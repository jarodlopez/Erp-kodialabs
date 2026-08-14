'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Minus, Plus, ScanLine, Trash2, Truck, UserRound, X } from 'lucide-react';

import { findProductByBarcodeAction } from '@/app/actions/catalog';
import { createSaleAction } from '@/app/actions/sales';
import { BarcodeScanner } from '@/components/domain/barcode-scanner';
import { PartyPicker, type PartyOption } from '@/components/domain/party-picker';
import { ProductPicker } from '@/components/domain/product-picker';
import { Button, Card, CardHeader, EmptyState, Field, Input, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatMoney, toMinorUnits, toScaledQty } from '@/lib/money';
import { priceDocument } from '@/lib/pricing';
import { newIdempotencyKey, toDateInput } from '@/lib/utils';
import type { Product } from '@/types/catalog';
import type { FinancialAccount } from '@/types/finance';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';
import type { Settings } from '@/types/organization';

interface Line {
  product: Product;
  quantity: number;
}

/**
 * Terminal de punto de venta: pensado para vender rápido de contado. Reutiliza
 * el mismo backend que la venta normal (`createSaleAction` con `confirm`), por
 * lo que descuenta inventario, registra el cobro y la auditoría igual que
 * cualquier venta.
 */
export function PosTerminal({
  accounts,
  settings,
}: {
  accounts: FinancialAccount[];
  settings: Settings;
}) {
  const router = useRouter();
  const toast = useToast();
  const currency = settings.currency;

  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<PartyOption | null>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '',
  );
  const [method, setMethod] = useState('CASH');
  const [received, setReceived] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Llave de idempotencia ESTABLE para la venta en curso: si el cobro falla por
  // red y se reintenta, se usa la misma llave y el servidor no duplica la venta.
  // Se rota solo tras un cobro exitoso, para la siguiente venta.
  const idemKeyRef = useRef<string>('');
  if (!idemKeyRef.current) idemKeyRef.current = newIdempotencyKey();

  // Delivery (envío a domicilio)
  const [isDelivery, setIsDelivery] = useState(false);
  const [delAddress, setDelAddress] = useState('');
  const [delRecipient, setDelRecipient] = useState('');
  const [delPhone, setDelPhone] = useState('');
  const [delNotes, setDelNotes] = useState('');

  // Última venta cobrada, para ofrecer factura / etiqueta.
  const [lastSale, setLastSale] = useState<{
    id: string;
    number: string;
    isDelivery: boolean;
  } | null>(null);

  const totals = useMemo(() => {
    if (lines.length === 0) return null;
    try {
      return priceDocument(
        lines.map((line) => ({
          quantity: toScaledQty(line.quantity),
          unitPrice: line.product.salePrice,
          discount: 0,
          taxRate: line.product.taxRate ?? 0,
          unitCost: line.product.averageCost ?? 0,
        })),
        { taxMode: settings.taxMode, globalDiscount: 0 },
      );
    } catch {
      return null;
    }
  }, [lines, settings.taxMode]);

  const totalMinor = totals?.totals.total ?? 0;
  const totalMajor = totalMinor / 100;
  const receivedNum = Number(received) || 0;
  const change = method === 'CASH' && received ? receivedNum - totalMajor : null;

  const addProduct = (product: Product) => {
    setLines((current) => {
      const existing = current.find((l) => l.product.id === product.id);
      if (existing) {
        return current.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const setQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setLines((current) => current.filter((l) => l.product.id !== productId));
      return;
    }
    setLines((current) =>
      current.map((l) => (l.product.id === productId ? { ...l, quantity } : l)),
    );
  };

  async function handleScan(code: string) {
    setScanning(false);
    const result = await findProductByBarcodeAction(code);
    if (result.ok && result.data) {
      addProduct(result.data);
      toast.success('Producto agregado', result.data.name);
    } else {
      toast.error('Sin coincidencia', `Ningún producto tiene el código ${code}.`);
    }
  }

  async function charge() {
    if (loading) return;
    if (lines.length === 0) {
      toast.error('Carrito vacío', 'Agrega al menos un producto.');
      return;
    }
    if (!accountId) {
      toast.error('Cuenta requerida', 'Selecciona dónde se recibe el pago.');
      return;
    }
    if (change !== null && change < 0) {
      toast.error('Efectivo insuficiente', 'El efectivo recibido es menor que el total.');
      return;
    }
    if (isDelivery && !delAddress.trim()) {
      toast.error('Falta la dirección', 'Escribe la dirección de entrega del delivery.');
      return;
    }

    setLoading(true);
    const result = await createSaleAction(
      {
        customerId: customer?.id ?? null,
        date: toDateInput(),
        type: 'CASH',
        items: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          unitPrice: line.product.salePrice / 100,
          discount: 0,
        })),
        globalDiscount: 0,
        notes: '',
        dueDate: null,
        delivery: isDelivery
          ? {
              recipient: delRecipient.trim() || null,
              address: delAddress.trim(),
              phone: delPhone.trim() || null,
              notes: delNotes.trim() || null,
            }
          : null,
        payment: { accountId, amount: totalMajor, method, reference: null },
        idempotencyKey: idemKeyRef.current,
      },
      { confirm: true },
    );

    if (!result.ok) {
      setLoading(false);
      toast.error('No se pudo cobrar', result.error.message);
      return;
    }

    toast.success(
      `Venta ${result.data.number} cobrada`,
      change && change > 0 ? `Cambio: ${formatMoney(toMinorUnits(change), currency)}` : 'Inventario y caja actualizados.',
    );
    // Venta exitosa: se rota la llave para la próxima venta.
    idemKeyRef.current = newIdempotencyKey();
    // Se limpia para la siguiente venta; el cajero permanece en la terminal.
    setLastSale({ id: result.data.saleId, number: result.data.number, isDelivery });
    setLines([]);
    setCustomer(null);
    setShowCustomer(false);
    setReceived('');
    setIsDelivery(false);
    setDelAddress('');
    setDelRecipient('');
    setDelPhone('');
    setDelNotes('');
    setLoading(false);
    router.refresh();
  }

  return (
    <>
      {lastSale && (
        <Card className="mb-4 border-[var(--color-positive-200)] bg-[var(--color-positive-50)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--color-positive-700)]">
              ✓ Venta {lastSale.number} cobrada.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={`/factura/${lastSale.id}`} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">
                  <FileText className="h-4 w-4" /> Factura
                </Button>
              </a>
              {lastSale.isDelivery && (
                <a href={`/etiqueta/${lastSale.id}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary" size="sm">
                    <Truck className="h-4 w-4" /> Etiqueta de envío
                  </Button>
                </a>
              )}
              <Button variant="ghost" size="sm" onClick={() => setLastSale(null)}>
                Nueva venta
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 pb-28 lg:grid-cols-3 lg:pb-0">
      {/* Productos */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <div className="border-b border-[var(--color-border)] p-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <ProductPicker
                  onSelect={addProduct}
                  currency={currency}
                  excludeIds={[]}
                  placeholder="Buscar producto por nombre o SKU..."
                />
              </div>
              <Button variant="secondary" onClick={() => setScanning(true)} aria-label="Escanear código">
                <ScanLine className="h-4 w-4" /> Escanear
              </Button>
            </div>
          </div>

          {lines.length === 0 ? (
            <EmptyState
              title="Carrito vacío"
              description="Busca un producto o escanea su código de barras para empezar a vender."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {lines.map((line) => {
                const insufficient =
                  line.product.tracksInventory &&
                  !settings.allowNegativeStock &&
                  toScaledQty(line.quantity) > line.product.stock;
                return (
                  <li key={line.product.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-ink)]">
                        {line.product.name}
                      </p>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {formatMoney(line.product.salePrice, currency)} c/u
                        {insufficient ? ' · ⚠ stock insuficiente' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setQty(line.product.id, line.quantity - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-ink-muted)] hover:bg-[var(--color-canvas)]"
                        aria-label="Menos"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={line.quantity}
                        onChange={(event) => setQty(line.product.id, Number(event.target.value))}
                        className="h-8 w-14 rounded-lg border border-[var(--color-border)] text-center text-sm tabular"
                        aria-label={`Cantidad de ${line.product.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => setQty(line.product.id, line.quantity + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-ink-muted)] hover:bg-[var(--color-canvas)]"
                        aria-label="Más"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="w-24 shrink-0 text-right text-sm font-semibold tabular">
                      {formatMoney(line.product.salePrice * toScaledQty(line.quantity) / 1000, currency)}
                    </div>

                    <button
                      type="button"
                      onClick={() => setQty(line.product.id, 0)}
                      className="rounded-lg p-1.5 text-[var(--color-ink-subtle)] hover:bg-[var(--color-danger-50)] hover:text-[var(--color-danger-700)]"
                      aria-label={`Quitar ${line.product.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Cobro */}
      <div className="space-y-4">
        <Card>
          <CardHeader title="Cobro" />
          <div className="space-y-4 p-4">
            {/* Cliente opcional */}
            {showCustomer ? (
              <Field label="Cliente">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <PartyPicker kind="customer" value={customer} onSelect={setCustomer} allowEmpty />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomer(null);
                      setShowCustomer(false);
                    }}
                    className="mt-2 rounded-lg p-1 text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]"
                    aria-label="Quitar cliente"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </Field>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setShowCustomer(true)}>
                <UserRound className="h-4 w-4" /> Agregar cliente (opcional)
              </Button>
            )}

            <Field label="Cuenta de destino" required>
              <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Método de pago">
              <Select value={method} onChange={(event) => setMethod(event.target.value)}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            {method === 'CASH' && (
              <Field label="Efectivo recibido" hint="Opcional. Calcula el cambio.">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={received}
                  onChange={(event) => setReceived(event.target.value)}
                  placeholder="0.00"
                />
              </Field>
            )}

            {/* Delivery */}
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                <input
                  type="checkbox"
                  checked={isDelivery}
                  onChange={(event) => setIsDelivery(event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-border-strong)] text-[var(--color-brand-500)]"
                />
                <Truck className="h-4 w-4 text-[var(--color-ink-subtle)]" /> Es delivery (envío a
                domicilio)
              </label>

              {isDelivery && (
                <div className="mt-3 space-y-3">
                  <Field label="Dirección de entrega" required>
                    <Input
                      value={delAddress}
                      onChange={(event) => setDelAddress(event.target.value)}
                      placeholder="Barrio, calle, número, referencias..."
                    />
                  </Field>
                  <Field label="Recibe (opcional)">
                    <Input
                      value={delRecipient}
                      onChange={(event) => setDelRecipient(event.target.value)}
                      placeholder="Nombre de quien recibe"
                    />
                  </Field>
                  <Field label="Teléfono (opcional)">
                    <Input
                      value={delPhone}
                      inputMode="tel"
                      onChange={(event) => setDelPhone(event.target.value)}
                      placeholder="Para coordinar la entrega"
                    />
                  </Field>
                  <Field label="Indicaciones (opcional)">
                    <Input
                      value={delNotes}
                      onChange={(event) => setDelNotes(event.target.value)}
                      placeholder="Ej. tocar el timbre, dejar con el portero..."
                    />
                  </Field>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] p-4">
            {/* Total protagonista sobre banda cálida */}
            <div className="warm-hero rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-ink-subtle)]">Artículos</span>
                <span className="text-sm tabular">
                  {lines.reduce((acc, l) => acc + l.quantity, 0)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-sm font-semibold text-[var(--color-ink-muted)]">Total</span>
                <span className="text-3xl font-semibold tracking-tight tabular text-[var(--color-ink)]">
                  {formatMoney(totalMinor, currency)}
                </span>
              </div>
              {change !== null && (
                <div
                  className={
                    change < 0
                      ? 'mt-1 flex items-center justify-between text-sm font-medium text-[var(--color-danger-700)]'
                      : 'mt-1 flex items-center justify-between text-sm font-medium text-[var(--color-positive-700)]'
                  }
                >
                  <span>Cambio</span>
                  <span className="tabular">{formatMoney(toMinorUnits(change), currency)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 pt-0">
            <Button
              className="brand-gradient w-full border-0 py-3 text-base"
              onClick={charge}
              loading={loading}
              disabled={lines.length === 0}
            >
              Cobrar {lines.length > 0 ? formatMoney(totalMinor, currency) : ''}
            </Button>
          </div>
        </Card>
      </div>

        <BarcodeScanner
          open={scanning}
          onClose={() => setScanning(false)}
          onDetect={handleScan}
          title="Escanear producto"
        />
      </div>

      {/* Barra de cobro fija en móvil (sobre la navegación inferior) */}
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-[var(--color-border)] bg-white/95 p-3 shadow-[0_-8px_24px_-12px_rgba(16,24,40,0.25)] backdrop-blur lg:hidden">
          <Button className="brand-gradient w-full border-0 py-3 text-base" onClick={charge} loading={loading}>
            Cobrar · {lines.reduce((a, l) => a + l.quantity, 0)} art. ·{' '}
            {formatMoney(totalMinor, currency)}
          </Button>
        </div>
      )}
    </>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, ScanLine, Trash2, UserRound, X } from 'lucide-react';

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
        payment: { accountId, amount: totalMajor, method, reference: null },
        idempotencyKey: newIdempotencyKey(),
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
    // Se limpia para la siguiente venta; el cajero permanece en la terminal.
    setLines([]);
    setCustomer(null);
    setShowCustomer(false);
    setReceived('');
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
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
          </div>

          <div className="space-y-2 border-t border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-ink-subtle)]">Artículos</span>
              <span className="text-sm tabular">
                {lines.reduce((acc, l) => acc + l.quantity, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-semibold tabular">
                {formatMoney(totalMinor, currency)}
              </span>
            </div>
            {change !== null && (
              <div
                className={
                  change < 0
                    ? 'flex items-center justify-between text-sm text-[var(--color-danger-700)]'
                    : 'flex items-center justify-between text-sm text-[var(--color-positive-700)]'
                }
              >
                <span>Cambio</span>
                <span className="tabular">{formatMoney(toMinorUnits(change), currency)}</span>
              </div>
            )}
          </div>

          <div className="p-4 pt-0">
            <Button
              className="w-full py-3 text-base"
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
  );
}

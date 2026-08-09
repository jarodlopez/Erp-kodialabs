'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { createSaleAction } from '@/app/actions/sales';
import { PartyPicker, type PartyOption } from '@/components/domain/party-picker';
import { ProductPicker } from '@/components/domain/product-picker';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatMoney, toMinorUnits, toScaledQty } from '@/lib/money';
import { priceDocument } from '@/lib/pricing';
import { newIdempotencyKey, toDateInput } from '@/lib/utils';
import type { FinancialAccount } from '@/types/finance';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';
import type { Settings } from '@/types/organization';
import type { Product } from '@/types/catalog';

interface Line {
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export function SaleEditor({
  accounts,
  settings,
}: {
  accounts: FinancialAccount[];
  settings: Settings;
}) {
  const router = useRouter();
  const toast = useToast();

  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<PartyOption | null>(null);
  const [type, setType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [date, setDate] = useState(toDateInput());
  const [dueDate, setDueDate] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState(accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '');
  const [method, setMethod] = useState('CASH');
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const currency = settings.currency;

  /**
   * Vista previa de totales calculada con el MISMO módulo que usa el servidor
   * (`priceDocument`), de modo que lo que ve el usuario coincide exactamente
   * con lo que se guardará.
   */
  const totals = useMemo(() => {
    if (lines.length === 0) return null;
    try {
      return priceDocument(
        lines.map((line) => ({
          quantity: toScaledQty(line.quantity),
          unitPrice: toMinorUnits(line.unitPrice),
          discount: toMinorUnits(line.discount),
          taxRate: line.product.taxRate ?? 0,
          unitCost: line.product.averageCost ?? 0,
        })),
        { taxMode: settings.taxMode, globalDiscount: toMinorUnits(globalDiscount) },
      );
    } catch {
      return null;
    }
  }, [lines, globalDiscount, settings.taxMode]);

  const total = totals?.totals.total ?? 0;

  const addProduct = (product: Product) => {
    setLines((current) => {
      const existing = current.find((l) => l.product.id === product.id);
      if (existing) {
        return current.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...current,
        {
          product,
          quantity: 1,
          unitPrice: product.salePrice / 100,
          discount: 0,
        },
      ];
    });
  };

  const updateLine = (productId: string, patch: Partial<Line>) => {
    setLines((current) =>
      current.map((line) => (line.product.id === productId ? { ...line, ...patch } : line)),
    );
  };

  const removeLine = (productId: string) => {
    setLines((current) => current.filter((line) => line.product.id !== productId));
  };

  async function submit(confirm: boolean) {
    if (loading) return;

    if (lines.length === 0) {
      toast.error('Agrega productos', 'La venta debe incluir al menos un producto.');
      return;
    }
    if (type === 'CREDIT' && !customer) {
      toast.error('Cliente requerido', 'Una venta a crédito necesita un cliente registrado.');
      return;
    }

    const paidAmount =
      type === 'CASH' ? total / 100 : partialAmount ? Number(partialAmount) : 0;

    if (confirm && type === 'CASH' && !accountId) {
      toast.error('Cuenta requerida', 'Selecciona la cuenta donde se recibe el pago.');
      return;
    }

    setLoading(true);

    const result = await createSaleAction(
      {
        customerId: customer?.id ?? null,
        date,
        type,
        items: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
        })),
        globalDiscount,
        notes,
        dueDate: type === 'CREDIT' ? dueDate || null : null,
        payment:
          confirm && paidAmount > 0 && accountId
            ? { accountId, amount: paidAmount, method, reference: null }
            : null,
        idempotencyKey: newIdempotencyKey(),
      },
      { confirm },
    );

    if (!result.ok) {
      setLoading(false);
      toast.error('No se pudo registrar la venta', result.error.message);
      return;
    }

    toast.success(
      confirm ? `Venta ${result.data.number} confirmada` : `Borrador ${result.data.number} guardado`,
      confirm ? 'Inventario y finanzas actualizados.' : 'Puedes confirmarla más tarde.',
    );
    router.push(`/ventas/${result.data.saleId}`);
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="Productos" description="Busca por nombre o SKU y ajusta cantidades." />
          <div className="border-b border-[var(--color-border)] p-4">
            <ProductPicker
              onSelect={addProduct}
              currency={currency}
              excludeIds={lines.map((l) => l.product.id)}
            />
          </div>

          {lines.length === 0 ? (
            <EmptyState
              title="Sin productos"
              description="Agrega al menos un producto para poder registrar la venta."
            />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {lines.map((line, index) => {
                const lineTotal = totals?.lines[index];
                const insufficient =
                  line.product.tracksInventory &&
                  !settings.allowNegativeStock &&
                  toScaledQty(line.quantity) > line.product.stock;

                return (
                  <div key={line.product.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--color-ink)]">
                          {line.product.name}
                        </p>
                        <p className="text-xs text-[var(--color-ink-subtle)]">
                          {line.product.sku} · Disponible:{' '}
                          {(line.product.stock / 1000).toLocaleString('es-NI')}
                        </p>
                        {insufficient && (
                          <Badge tone="danger" className="mt-1">
                            Inventario insuficiente
                          </Badge>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(line.product.id)}
                        className="rounded-lg p-1.5 text-[var(--color-ink-subtle)] transition-colors hover:bg-[var(--color-danger-50)] hover:text-[var(--color-danger-700)]"
                        aria-label={`Quitar ${line.product.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <Field label="Cantidad">
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(line.product.id, { quantity: Number(event.target.value) })
                          }
                          invalid={insufficient}
                        />
                      </Field>
                      <Field label="Precio unitario">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateLine(line.product.id, { unitPrice: Number(event.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Descuento">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.discount}
                          onChange={(event) =>
                            updateLine(line.product.id, { discount: Number(event.target.value) })
                          }
                        />
                      </Field>
                      <div className="flex flex-col justify-end pb-2 text-right">
                        <span className="text-xs text-[var(--color-ink-subtle)]">Total línea</span>
                        <span className="text-base font-semibold tabular">
                          {formatMoney(lineTotal?.total ?? 0, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Notas" />
          <div className="p-4">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Observaciones internas o para el cliente..."
            />
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Datos de la venta" />
          <div className="space-y-4 p-4">
            <Field label="Cliente" hint="Déjalo vacío para una venta ocasional de contado.">
              <PartyPicker kind="customer" value={customer} onSelect={setCustomer} allowEmpty />
            </Field>

            <Field label="Fecha" required>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>

            <Field label="Condición de pago" required>
              <Select
                value={type}
                onChange={(event) => setType(event.target.value as 'CASH' | 'CREDIT')}
              >
                <option value="CASH">Contado</option>
                <option value="CREDIT">Crédito</option>
              </Select>
            </Field>

            {type === 'CREDIT' && (
              <Field
                label="Fecha de vencimiento"
                hint={`Por defecto: ${settings.defaultCreditDays} días.`}
              >
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
            )}

            <Field label="Descuento global">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={globalDiscount}
                onChange={(event) => setGlobalDiscount(Number(event.target.value))}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Cobro" />
          <div className="space-y-4 p-4">
            <Field label="Cuenta de destino" required={type === 'CASH'}>
              <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">Sin cobro ahora</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} — {formatMoney(account.currentBalance, currency)}
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

            {type === 'CREDIT' && (
              <Field label="Abono inicial" hint="Opcional. El resto queda como cuenta por cobrar.">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={partialAmount}
                  onChange={(event) => setPartialAmount(event.target.value)}
                  placeholder="0.00"
                />
              </Field>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Resumen" />
          <dl className="space-y-2 p-4 text-sm">
            <SummaryLine label="Subtotal" value={totals?.totals.subtotal ?? 0} currency={currency} />
            <SummaryLine
              label="Descuentos"
              value={-(totals?.totals.discount ?? 0)}
              currency={currency}
            />
            <SummaryLine label="Impuestos" value={totals?.totals.tax ?? 0} currency={currency} />
            <div className="border-t border-[var(--color-border)] pt-2">
              <div className="flex items-center justify-between">
                <dt className="font-semibold">Total</dt>
                <dd className="text-xl font-semibold tabular">{formatMoney(total, currency)}</dd>
              </div>
            </div>
            <div className="pt-1 text-xs text-[var(--color-ink-subtle)]">
              Costo estimado: {formatMoney(totals?.totals.costOfGoodsSold ?? 0, currency)} · Utilidad:{' '}
              {formatMoney(totals?.totals.grossProfit ?? 0, currency)}
            </div>
          </dl>

          <div className="flex flex-col gap-2 border-t border-[var(--color-border)] p-4">
            <Button onClick={() => submit(true)} loading={loading} disabled={lines.length === 0}>
              Confirmar venta
            </Button>
            <Button
              variant="secondary"
              onClick={() => submit(false)}
              disabled={loading || lines.length === 0}
            >
              Guardar como borrador
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--color-ink-subtle)]">{label}</dt>
      <dd className="tabular">{formatMoney(value, currency)}</dd>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  Coins,
  CreditCard,
  Hash,
  Package,
  Percent,
  ShoppingBag,
  StickyNote,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react';

import { createPurchaseAction } from '@/app/actions/purchases';
import { PartyPicker, type PartyOption } from '@/components/domain/party-picker';
import { ProductPicker } from '@/components/domain/product-picker';
import {
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
import { landedUnitCost, priceDocument } from '@/lib/pricing';
import { newIdempotencyKey, toDateInput } from '@/lib/utils';
import type { Product } from '@/types/catalog';
import type { FinancialAccount } from '@/types/finance';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';
import type { Settings } from '@/types/organization';

interface Line {
  product: Product;
  quantity: number;
  unitCost: number;
  discount: number;
}

export function PurchaseEditor({
  accounts,
  settings,
}: {
  accounts: FinancialAccount[];
  settings: Settings;
}) {
  const router = useRouter();
  const toast = useToast();

  const [lines, setLines] = useState<Line[]>([]);
  const [supplier, setSupplier] = useState<PartyOption | null>(null);
  const [type, setType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [date, setDate] = useState(toDateInput());
  const [dueDate, setDueDate] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [otherCosts, setOtherCosts] = useState(0);
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '',
  );
  const [method, setMethod] = useState('CASH');
  const [partialAmount, setPartialAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const currency = settings.currency;

  const priced = useMemo(() => {
    if (lines.length === 0) return null;
    try {
      return priceDocument(
        lines.map((line) => ({
          quantity: toScaledQty(line.quantity),
          unitPrice: toMinorUnits(line.unitCost),
          discount: toMinorUnits(line.discount),
          taxRate: line.product.taxRate ?? 0,
          unitCost: toMinorUnits(line.unitCost),
        })),
        {
          taxMode: settings.taxMode,
          globalDiscount: toMinorUnits(globalDiscount),
          additionalCosts: toMinorUnits(shipping) + toMinorUnits(otherCosts),
        },
      );
    } catch {
      return null;
    }
  }, [lines, globalDiscount, shipping, otherCosts, settings.taxMode]);

  const total =
    (priced?.totals.total ?? 0) + toMinorUnits(shipping) + toMinorUnits(otherCosts);

  const addProduct = (product: Product) => {
    setLines((current) => {
      if (current.some((l) => l.product.id === product.id)) return current;
      return [
        ...current,
        { product, quantity: 1, unitCost: product.cost / 100, discount: 0 },
      ];
    });
  };

  const updateLine = (productId: string, patch: Partial<Line>) => {
    setLines((current) =>
      current.map((line) => (line.product.id === productId ? { ...line, ...patch } : line)),
    );
  };

  async function submit(receive: boolean) {
    if (loading) return;

    if (!supplier) {
      toast.error('Proveedor requerido', 'Selecciona el proveedor de la compra.');
      return;
    }
    if (lines.length === 0) {
      toast.error('Agrega productos', 'La compra debe incluir al menos un producto.');
      return;
    }

    const paidAmount = type === 'CASH' ? total / 100 : partialAmount ? Number(partialAmount) : 0;

    setLoading(true);
    const result = await createPurchaseAction(
      {
        supplierId: supplier.id,
        invoiceNumber,
        date,
        type,
        items: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          unitCost: line.unitCost,
          discount: line.discount,
        })),
        globalDiscount,
        shipping,
        otherCosts,
        notes,
        dueDate: type === 'CREDIT' ? dueDate || null : null,
        payment:
          receive && paidAmount > 0 && accountId
            ? { accountId, amount: paidAmount, method, reference: null }
            : null,
        idempotencyKey: newIdempotencyKey(),
      },
      { receive },
    );

    if (!result.ok) {
      setLoading(false);
      toast.error('No se pudo registrar la compra', result.error.message);
      return;
    }

    toast.success(
      receive ? `Compra ${result.data.number} recibida` : `Borrador ${result.data.number} guardado`,
      receive ? 'Inventario y costo promedio actualizados.' : 'Podrás recibirla más tarde.',
    );
    router.push(`/compras/${result.data.purchaseId}`);
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader
            title="Productos" icon={<Package />}
            description="El costo de cada línea alimentará el costo promedio ponderado."
          />
          <div className="border-b border-[var(--color-border)] p-4">
            <ProductPicker
              onSelect={addProduct}
              currency={currency}
              excludeIds={lines.map((l) => l.product.id)}
              placeholder="Buscar producto a comprar..."
            />
          </div>

          {lines.length === 0 ? (
            <EmptyState
              title="Sin productos"
              description="Agrega los productos que estás comprando al proveedor."
            />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {lines.map((line, index) => {
                const pricedLine = priced?.lines[index];
                const landed = pricedLine
                  ? landedUnitCost(pricedLine.totalCost, pricedLine.quantity)
                  : 0;
                return (
                  <div key={line.product.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{line.product.name}</p>
                        <p className="text-xs text-[var(--color-ink-subtle)]">
                          {line.product.sku} · Costo promedio actual:{' '}
                          {formatMoney(line.product.averageCost, currency)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setLines((current) => current.filter((l) => l.product.id !== line.product.id))
                        }
                        className="rounded-lg p-1.5 text-[var(--color-ink-subtle)] hover:bg-[var(--color-danger-50)] hover:text-[var(--color-danger-700)]"
                        aria-label={`Quitar ${line.product.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <Field label="Cantidad" icon={<Package />}>
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(line.product.id, { quantity: Number(event.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Costo unitario" icon={<Coins />}>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unitCost}
                          onChange={(event) =>
                            updateLine(line.product.id, { unitCost: Number(event.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Descuento" icon={<Percent />}>
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
                        <span className="text-xs text-[var(--color-ink-subtle)]">
                          Costo final (con flete)
                        </span>
                        <span className="text-base font-semibold tabular">
                          {formatMoney(landed, currency)}
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
          <CardHeader
            title="Costos adicionales" icon={<Coins />}
            description="Se prorratean proporcionalmente entre las líneas y se capitalizan en el costo."
          />
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <Field label="Flete" icon={<Truck />}>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={shipping}
                onChange={(event) => setShipping(Number(event.target.value))}
              />
            </Field>
            <Field label="Otros costos" icon={<Coins />}>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={otherCosts}
                onChange={(event) => setOtherCosts(Number(event.target.value))}
              />
            </Field>
            <Field label="Descuento global" icon={<Percent />}>
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
          <CardHeader title="Notas" icon={<StickyNote />} />
          <div className="p-4">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Datos de la compra" icon={<ShoppingBag />} />
          <div className="space-y-4 p-4">
            <Field label="Proveedor" icon={<Truck />} required>
              <PartyPicker kind="supplier" value={supplier} onSelect={setSupplier} />
            </Field>

            <Field label="N.º de factura del proveedor" icon={<Hash />}>
              <Input
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                placeholder="F-12345"
              />
            </Field>

            <Field label="Fecha" icon={<CalendarDays />} required>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>

            <Field label="Condición de pago" icon={<CreditCard />} required>
              <Select
                value={type}
                onChange={(event) => setType(event.target.value as 'CASH' | 'CREDIT')}
              >
                <option value="CASH">Contado</option>
                <option value="CREDIT">Crédito</option>
              </Select>
            </Field>

            {type === 'CREDIT' && (
              <Field label="Fecha de vencimiento" icon={<CalendarDays />}>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pago" icon={<Banknote />} />
          <div className="space-y-4 p-4">
            <Field label="Cuenta de origen" icon={<Wallet />}>
              <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">Sin pago ahora</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} — {formatMoney(account.currentBalance, currency)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Método de pago" icon={<CreditCard />}>
              <Select value={method} onChange={(event) => setMethod(event.target.value)}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            {type === 'CREDIT' && (
              <Field label="Abono inicial" icon={<Banknote />} hint="El resto queda como cuenta por pagar.">
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
          <CardHeader title="Resumen" icon={<Banknote />} />
          <dl className="space-y-2 p-4 text-sm">
            <SummaryLine label="Subtotal" value={priced?.totals.subtotal ?? 0} currency={currency} />
            <SummaryLine
              label="Descuentos"
              value={-(priced?.totals.discount ?? 0)}
              currency={currency}
            />
            <SummaryLine label="Impuestos" value={priced?.totals.tax ?? 0} currency={currency} />
            <SummaryLine label="Flete" value={toMinorUnits(shipping)} currency={currency} />
            <SummaryLine label="Otros costos" value={toMinorUnits(otherCosts)} currency={currency} />
            <div className="border-t border-[var(--color-border)] pt-2">
              <div className="flex items-center justify-between">
                <dt className="font-semibold">Total</dt>
                <dd className="text-xl font-semibold tabular">{formatMoney(total, currency)}</dd>
              </div>
            </div>
          </dl>

          <div className="flex flex-col gap-2 border-t border-[var(--color-border)] p-4">
            <Button onClick={() => submit(true)} loading={loading} disabled={lines.length === 0}>
              Recibir e ingresar al inventario
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

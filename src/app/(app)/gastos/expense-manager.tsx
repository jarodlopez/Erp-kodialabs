'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlignLeft,
  Banknote,
  CalendarDays,
  CreditCard,
  Layers,
  Percent,
  Plus,
  StickyNote,
  Truck,
  Wallet,
} from 'lucide-react';

import { createExpenseAction } from '@/app/actions/expenses';
import { PartyPicker, type PartyOption } from '@/components/domain/party-picker';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatMoney, percentToBasisPoints } from '@/lib/money';
import { newIdempotencyKey, toDateInput } from '@/lib/utils';
import type { ExpenseCategory } from '@/types/expenses';
import type { FinancialAccount } from '@/types/finance';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';

export function ExpenseManager({
  categories,
  accounts,
  currency,
}: {
  categories: ExpenseCategory[];
  accounts: FinancialAccount[];
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [payNow, setPayNow] = useState(true);
  const [supplier, setSupplier] = useState<PartyOption | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    setLoading(true);
    setErrors({});

    const result = await createExpenseAction({
      categoryId: String(form.get('categoryId') ?? ''),
      description: String(form.get('description') ?? ''),
      supplierId: supplier?.id ?? null,
      amount: Number(form.get('amount') ?? 0),
      taxRate: percentToBasisPoints(Number(form.get('taxRatePercent') ?? 0)),
      date: String(form.get('date') ?? toDateInput()),
      payNow,
      accountId: payNow ? String(form.get('accountId') ?? '') : null,
      method: String(form.get('method') ?? 'CASH'),
      dueDate: payNow ? null : String(form.get('dueDate') ?? ''),
      notes: String(form.get('notes') ?? ''),
      idempotencyKey: newIdempotencyKey(),
    });

    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo registrar el gasto', result.error.message);
      return;
    }

    toast.success(
      `Gasto ${result.data.number} registrado`,
      `Total: ${formatMoney(result.data.total, currency)}`,
    );
    setOpen(false);
    setSupplier(null);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Registrar gasto
      </Button>

      <Modal open={open} onClose={() => !loading && setOpen(false)} title="Registrar gasto">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoría" icon={<Layers />} htmlFor="categoryId" required error={errors.categoryId}>
              <Select id="categoryId" name="categoryId" required>
                <option value="">Selecciona una categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Fecha" icon={<CalendarDays />} htmlFor="date" required error={errors.date}>
              <Input id="date" name="date" type="date" defaultValue={toDateInput()} required />
            </Field>
          </div>

          <Field label="Descripción" icon={<AlignLeft />} htmlFor="description" required error={errors.description}>
            <Input
              id="description"
              name="description"
              placeholder="Alquiler del local — agosto"
              required
            />
          </Field>

          <Field label="Proveedor" icon={<Truck />} hint="Opcional. Si el gasto queda a crédito genera cuenta por pagar.">
            <PartyPicker kind="supplier" value={supplier} onSelect={setSupplier} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Importe" icon={<Banknote />} htmlFor="amount" required error={errors.amount}>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                invalid={Boolean(errors.amount)}
              />
            </Field>
            <Field label="Impuesto (%)" icon={<Percent />} htmlFor="taxRatePercent">
              <Input
                id="taxRatePercent"
                name="taxRatePercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={0}
              />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg bg-[var(--color-surface-muted)] p-3">
            <input
              type="checkbox"
              checked={payNow}
              onChange={(event) => setPayNow(event.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium">Pagado ahora</span>
              <span className="block text-xs text-[var(--color-ink-subtle)]">
                Se registra la salida de dinero de la cuenta seleccionada. Si lo desmarcas, el gasto
                queda pendiente de pago.
              </span>
            </span>
          </label>

          {payNow ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cuenta de pago" icon={<Wallet />} htmlFor="accountId" required error={errors.accountId}>
                <Select
                  id="accountId"
                  name="accountId"
                  defaultValue={accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? ''}
                  required
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} — {formatMoney(account.currentBalance, currency)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Método" icon={<CreditCard />} htmlFor="method">
                <Select id="method" name="method" defaultValue="CASH">
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : (
            <Field label="Fecha de vencimiento" icon={<CalendarDays />} htmlFor="dueDate">
              <Input id="dueDate" name="dueDate" type="date" defaultValue={toDateInput()} />
            </Field>
          )}

          <Field label="Notas" icon={<StickyNote />} htmlFor="notes">
            <Textarea id="notes" name="notes" />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Registrar gasto
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

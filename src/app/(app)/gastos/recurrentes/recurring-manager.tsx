'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';

import { saveRecurringExpenseAction } from '@/app/actions/expenses';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatMoney, percentToBasisPoints, toMajorUnits, basisPointsToPercent } from '@/lib/money';
import { toDateInput } from '@/lib/utils';
import type { ExpenseCategory, RecurringExpense } from '@/types/expenses';
import { RECURRING_FREQUENCY_LABELS } from '@/types/expenses';
import type { FinancialAccount } from '@/types/finance';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';

export function RecurringManager({
  categories,
  accounts,
  currency,
  item,
}: {
  categories: ExpenseCategory[];
  accounts: FinancialAccount[];
  currency: string;
  item?: RecurringExpense;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    setLoading(true);
    setErrors({});

    const result = await saveRecurringExpenseAction(
      {
        description: String(form.get('description') ?? ''),
        categoryId: String(form.get('categoryId') ?? ''),
        amount: Number(form.get('amount') ?? 0),
        taxRate: percentToBasisPoints(Number(form.get('taxRatePercent') ?? 0)),
        frequency: String(form.get('frequency') ?? 'MONTHLY'),
        nextDate: String(form.get('nextDate') ?? toDateInput()),
        endDate: String(form.get('endDate') ?? ''),
        accountId: String(form.get('accountId') ?? ''),
        method: String(form.get('method') ?? 'CASH'),
        autoPay: form.get('autoPay') === 'on',
        status: String(form.get('status') ?? 'ACTIVE'),
      },
      item?.id,
    );

    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar', result.error.message);
      return;
    }

    toast.success(item ? 'Gasto recurrente actualizado' : 'Gasto recurrente creado');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {item ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo recurrente
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={item ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'}
        description="El sistema generará el gasto automáticamente en cada vencimiento."
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Descripción" htmlFor="description" required error={errors.description}>
            <Input
              id="description"
              name="description"
              defaultValue={item?.description}
              placeholder="Alquiler del local"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoría" htmlFor="categoryId" required error={errors.categoryId}>
              <Select id="categoryId" name="categoryId" defaultValue={item?.categoryId ?? ''} required>
                <option value="">Selecciona</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Frecuencia" htmlFor="frequency" required>
              <Select id="frequency" name="frequency" defaultValue={item?.frequency ?? 'MONTHLY'}>
                {Object.entries(RECURRING_FREQUENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Importe" htmlFor="amount" required error={errors.amount}>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={item ? toMajorUnits(item.amount) : ''}
                required
              />
            </Field>
            <Field label="Impuesto (%)" htmlFor="taxRatePercent">
              <Input
                id="taxRatePercent"
                name="taxRatePercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={basisPointsToPercent(item?.taxRate ?? 0)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Próxima generación" htmlFor="nextDate" required error={errors.nextDate}>
              <Input
                id="nextDate"
                name="nextDate"
                type="date"
                defaultValue={item ? toDateInput(item.nextDate) : toDateInput()}
                required
              />
            </Field>
            <Field label="Finaliza el" htmlFor="endDate" hint="Opcional.">
              <Input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={item?.endDate ? toDateInput(item.endDate) : ''}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cuenta de pago" htmlFor="accountId">
              <Select id="accountId" name="accountId" defaultValue={item?.accountId ?? ''}>
                <option value="">Sin cuenta (queda pendiente)</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} — {formatMoney(account.currentBalance, currency)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Método" htmlFor="method">
              <Select id="method" name="method" defaultValue={item?.method ?? 'CASH'}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg bg-[var(--color-surface-muted)] p-3">
            <input
              type="checkbox"
              name="autoPay"
              defaultChecked={item?.autoPay ?? false}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium">Pagar automáticamente</span>
              <span className="block text-xs text-[var(--color-ink-subtle)]">
                Al generarse, el gasto se marca como pagado y se descuenta de la cuenta indicada.
              </span>
            </span>
          </label>

          <Field label="Estado" htmlFor="status">
            <Select id="status" name="status" defaultValue={item?.status ?? 'ACTIVE'}>
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Pausado</option>
            </Select>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

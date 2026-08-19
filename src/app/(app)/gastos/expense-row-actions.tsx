'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Ban,
  Banknote,
  CalendarDays,
  CreditCard,
  Hash,
  MessageSquare,
  Wallet,
} from 'lucide-react';

import { cancelExpenseAction, payExpenseAction } from '@/app/actions/expenses';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatMoney, toMajorUnits } from '@/lib/money';
import { toDateInput } from '@/lib/utils';
import type { Expense } from '@/types/expenses';
import type { FinancialAccount, PaymentMethod } from '@/types/finance';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';

export function ExpenseRowActions({
  expense,
  accounts,
  currency,
  canPay,
  canCancel,
}: {
  expense: Expense;
  accounts: FinancialAccount[];
  currency: string;
  canPay: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<'none' | 'pay' | 'cancel'>('none');
  const [loading, setLoading] = useState(false);

  if (expense.status === 'CANCELLED') {
    return <span className="text-xs text-[var(--color-ink-subtle)]">Anulado</span>;
  }

  async function pay(formData: FormData) {
    setLoading(true);
    const result = await payExpenseAction({
      expenseId: expense.id,
      accountId: String(formData.get('accountId') ?? ''),
      amount: Number(formData.get('amount') ?? 0),
      method: String(formData.get('method') ?? 'CASH') as PaymentMethod,
      date: String(formData.get('date') ?? toDateInput()),
      reference: String(formData.get('reference') ?? ''),
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo registrar el pago', result.error.message);
      return;
    }
    toast.success('Pago registrado');
    setDialog('none');
    router.refresh();
  }

  async function cancel(formData: FormData) {
    setLoading(true);
    const result = await cancelExpenseAction({
      id: expense.id,
      reason: String(formData.get('reason') ?? ''),
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo anular el gasto', result.error.message);
      return;
    }
    toast.success('Gasto anulado', 'Se revirtieron los movimientos financieros.');
    setDialog('none');
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      {canPay && expense.dueAmount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setDialog('pay')}>
          <Wallet className="h-3.5 w-3.5" /> Pagar
        </Button>
      )}
      {canCancel && (
        <Button variant="ghost" size="sm" onClick={() => setDialog('cancel')}>
          <Ban className="h-3.5 w-3.5" /> Anular
        </Button>
      )}

      <Modal
        open={dialog === 'pay'}
        onClose={() => !loading && setDialog('none')}
        title="Pagar gasto"
        description={`${expense.number} · Pendiente: ${formatMoney(expense.dueAmount, currency)}`}
        size="sm"
      >
        <form action={pay} className="space-y-4">
          <Field label="Cuenta de pago" icon={<Wallet />} required>
            <Select
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
          <Field label="Importe" icon={<Banknote />} required>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={toMajorUnits(expense.dueAmount)}
              defaultValue={toMajorUnits(expense.dueAmount)}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Método" icon={<CreditCard />}>
              <Select name="method" defaultValue="CASH">
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha" icon={<CalendarDays />}>
              <Input name="date" type="date" defaultValue={toDateInput()} />
            </Field>
          </div>
          <Field label="Referencia" icon={<Hash />}>
            <Input name="reference" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialog('none')} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Registrar pago
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === 'cancel'}
        onClose={() => !loading && setDialog('none')}
        title="Anular gasto"
        size="sm"
      >
        <form action={cancel} className="space-y-4">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Se revertirán los pagos registrados y se cancelará la cuenta por pagar asociada. El gasto
            se conserva con estado anulado.
          </p>
          <Field label="Motivo" icon={<MessageSquare />} required>
            <Textarea name="reason" required />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialog('none')} disabled={loading}>
              Cerrar
            </Button>
            <Button type="submit" variant="danger" loading={loading}>
              Anular gasto
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

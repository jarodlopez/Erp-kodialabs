'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Banknote,
  CalendarDays,
  CreditCard,
  Hash,
  Wallet,
} from 'lucide-react';

import { collectReceivableAction, payPayableAction } from '@/app/actions/finance';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatMoney, toMajorUnits } from '@/lib/money';
import { newIdempotencyKey, toDateInput } from '@/lib/utils';
import type { FinancialAccount } from '@/types/finance';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';

/**
 * Diálogo de cobro (CxC) o pago (CxP). Comparte la misma interfaz porque el
 * flujo es simétrico: importe, cuenta, método y fecha.
 */
export function CollectDialog({
  kind,
  documentId,
  reference,
  partyName,
  remainingAmount,
  accounts,
  currency,
}: {
  kind: 'receivable' | 'payable';
  documentId: string;
  reference: string;
  partyName: string;
  remainingAmount: number;
  accounts: FinancialAccount[];
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setLoading(true);

    const payload = {
      accountId: String(formData.get('accountId') ?? ''),
      amount: Number(formData.get('amount') ?? 0),
      method: String(formData.get('method') ?? 'CASH'),
      date: String(formData.get('date') ?? toDateInput()),
      reference: String(formData.get('reference') ?? ''),
      idempotencyKey: newIdempotencyKey(),
    };

    const result =
      kind === 'receivable'
        ? await collectReceivableAction({ ...payload, receivableId: documentId })
        : await payPayableAction({ ...payload, payableId: documentId });

    setLoading(false);

    if (!result.ok) {
      toast.error(
        kind === 'receivable' ? 'No se pudo registrar el cobro' : 'No se pudo registrar el pago',
        result.error.message,
      );
      return;
    }

    toast.success(
      kind === 'receivable' ? 'Cobro registrado' : 'Pago registrado',
      `Saldo restante: ${formatMoney(result.data.remainingAmount, currency)}`,
    );
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Wallet className="h-3.5 w-3.5" /> {kind === 'receivable' ? 'Cobrar' : 'Pagar'}
      </Button>

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={kind === 'receivable' ? 'Registrar cobro' : 'Registrar pago'}
        description={`${reference} · ${partyName} · Pendiente: ${formatMoney(remainingAmount, currency)}`}
        size="sm"
      >
        <form action={submit} className="space-y-4">
          <Field label={kind === 'receivable' ? 'Cuenta de destino' : 'Cuenta de origen'} required>
            <Select
              name="accountId"
              required
              defaultValue={accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? ''}
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
              max={toMajorUnits(remainingAmount)}
              defaultValue={toMajorUnits(remainingAmount)}
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
            <Input name="reference" placeholder="N.º de recibo, transferencia..." />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              {kind === 'receivable' ? 'Registrar cobro' : 'Registrar pago'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

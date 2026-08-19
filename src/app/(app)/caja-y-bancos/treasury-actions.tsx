'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeftRight,
  Banknote,
  CalendarDays,
  Hash,
  Landmark,
  MapPin,
  MessageSquare,
  Plus,
  Shapes,
  SlidersHorizontal,
  StickyNote,
  Type,
  Wallet,
} from 'lucide-react';

import {
  adjustAccountAction,
  createAccountAction,
  transferAction,
} from '@/app/actions/finance';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/money';
import { newIdempotencyKey, toDateInput } from '@/lib/utils';
import { ACCOUNT_TYPE_LABELS, type FinancialAccount } from '@/types/finance';

export function TreasuryActions({
  accounts,
  currency,
  canCreate,
  canTransfer,
  canAdjust,
}: {
  accounts: FinancialAccount[];
  currency: string;
  canCreate: boolean;
  canTransfer: boolean;
  canAdjust: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<'none' | 'account' | 'transfer' | 'adjust'>('none');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function createAccount(formData: FormData) {
    setLoading(true);
    setErrors({});
    const result = await createAccountAction({
      name: String(formData.get('name') ?? ''),
      type: String(formData.get('type') ?? 'CASH'),
      bankName: String(formData.get('bankName') ?? ''),
      accountNumber: String(formData.get('accountNumber') ?? ''),
      initialBalance: Number(formData.get('initialBalance') ?? 0),
      isDefault: formData.get('isDefault') === 'on',
      notes: String(formData.get('notes') ?? ''),
    });
    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo crear la cuenta', result.error.message);
      return;
    }
    toast.success('Cuenta creada');
    setDialog('none');
    router.refresh();
  }

  async function transfer(formData: FormData) {
    setLoading(true);
    setErrors({});
    const result = await transferAction({
      sourceAccountId: String(formData.get('sourceAccountId') ?? ''),
      destinationAccountId: String(formData.get('destinationAccountId') ?? ''),
      amount: Number(formData.get('amount') ?? 0),
      date: String(formData.get('date') ?? toDateInput()),
      reference: String(formData.get('reference') ?? ''),
      notes: String(formData.get('notes') ?? ''),
      idempotencyKey: newIdempotencyKey(),
    });
    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo transferir', result.error.message);
      return;
    }
    toast.success(
      `Transferencia ${result.data.number} registrada`,
      'No se contabiliza como ingreso ni como gasto.',
    );
    setDialog('none');
    router.refresh();
  }

  async function adjust(formData: FormData) {
    setLoading(true);
    setErrors({});
    const result = await adjustAccountAction({
      accountId: String(formData.get('accountId') ?? ''),
      amount: Number(formData.get('amount') ?? 0),
      direction: String(formData.get('direction') ?? 'IN'),
      reason: String(formData.get('reason') ?? ''),
      date: String(formData.get('date') ?? toDateInput()),
    });
    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo ajustar', result.error.message);
      return;
    }
    toast.success('Ajuste registrado', 'Queda documentado en la auditoría.');
    setDialog('none');
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canAdjust && accounts.length > 0 && (
        <Button variant="secondary" onClick={() => setDialog('adjust')}>
          <SlidersHorizontal className="h-4 w-4" /> Ajuste
        </Button>
      )}
      {canTransfer && accounts.length > 1 && (
        <Button variant="secondary" onClick={() => setDialog('transfer')}>
          <ArrowLeftRight className="h-4 w-4" /> Transferir
        </Button>
      )}
      {canCreate && (
        <Button onClick={() => setDialog('account')}>
          <Plus className="h-4 w-4" /> Nueva cuenta
        </Button>
      )}

      <Modal
        open={dialog === 'account'}
        onClose={() => !loading && setDialog('none')}
        title="Nueva cuenta financiera"
        size="sm"
      >
        <form action={createAccount} className="space-y-4">
          <Field label="Nombre" icon={<Type />} required error={errors.name}>
            <Input name="name" placeholder="Caja general, BAC córdobas..." required />
          </Field>
          <Field label="Tipo" icon={<Shapes />} required>
            <Select name="type" defaultValue="CASH">
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Banco" icon={<Landmark />}>
              <Input name="bankName" />
            </Field>
            <Field label="N.º de cuenta" icon={<Hash />}>
              <Input name="accountNumber" />
            </Field>
          </div>
          <Field
            label="Saldo inicial"
            error={errors.initialBalance}
            hint="Se registra como asiento de apertura en el libro mayor."
          >
            <Input name="initialBalance" type="number" step="0.01" min="0" defaultValue={0} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefault" className="h-4 w-4" />
            Usar como cuenta predeterminada
          </label>
          <Field label="Notas" icon={<StickyNote />}>
            <Textarea name="notes" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialog('none')} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Crear cuenta
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === 'transfer'}
        onClose={() => !loading && setDialog('none')}
        title="Transferencia entre cuentas"
        description="Mueve dinero entre cuentas propias. No afecta ingresos ni gastos."
        size="sm"
      >
        <form action={transfer} className="space-y-4">
          <Field label="Desde" required>
            <Select name="sourceAccountId" required defaultValue={accounts[0]?.id}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {formatMoney(account.currentBalance, currency)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hacia" required error={errors.destinationAccountId}>
            <Select name="destinationAccountId" required defaultValue={accounts[1]?.id}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {formatMoney(account.currentBalance, currency)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Importe" icon={<Banknote />} required error={errors.amount}>
              <Input name="amount" type="number" step="0.01" min="0.01" required />
            </Field>
            <Field label="Fecha" icon={<CalendarDays />} required>
              <Input name="date" type="date" defaultValue={toDateInput()} required />
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
              Transferir
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === 'adjust'}
        onClose={() => !loading && setDialog('none')}
        title="Ajuste de saldo"
        description="Úsalo solo para conciliaciones. Queda auditado con tu usuario."
        size="sm"
      >
        <form action={adjust} className="space-y-4">
          <Field label="Cuenta" icon={<Wallet />} required>
            <Select name="accountId" required defaultValue={accounts[0]?.id}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {formatMoney(account.currentBalance, currency)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dirección" icon={<MapPin />} required>
              <Select name="direction" defaultValue="IN">
                <option value="IN">Aumentar saldo</option>
                <option value="OUT">Disminuir saldo</option>
              </Select>
            </Field>
            <Field label="Importe" icon={<Banknote />} required error={errors.amount}>
              <Input name="amount" type="number" step="0.01" min="0.01" required />
            </Field>
          </div>
          <Field label="Fecha" icon={<CalendarDays />} required>
            <Input name="date" type="date" defaultValue={toDateInput()} required />
          </Field>
          <Field label="Motivo" icon={<MessageSquare />} required error={errors.reason}>
            <Textarea name="reason" required placeholder="Diferencia de arqueo, corrección..." />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialog('none')} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Aplicar ajuste
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

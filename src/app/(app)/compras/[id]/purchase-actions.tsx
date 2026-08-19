'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  Ban,
  Banknote,
  CalendarDays,
  CreditCard,
  Hash,
  MessageSquare,
  PackageCheck,
  RotateCcw,
  Wallet,
} from 'lucide-react';

import {
  cancelPurchaseAction,
  receivePurchaseAction,
  registerPurchasePaymentAction,
} from '@/app/actions/purchases';
import { createPurchaseReturnAction } from '@/app/actions/inventory';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatMoney, toMajorUnits } from '@/lib/money';
import { newIdempotencyKey, toDateInput } from '@/lib/utils';
import type { FinancialAccount } from '@/types/finance';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';
import type { Purchase } from '@/types/purchases';

export function PurchaseActions({
  purchase,
  accounts,
  currency,
  permissions,
}: {
  purchase: Purchase;
  accounts: FinancialAccount[];
  currency: string;
  permissions: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<'none' | 'receive' | 'payment' | 'cancel' | 'return'>('none');
  const [loading, setLoading] = useState(false);

  // Llaves de idempotencia estables por operación (se rotan tras cada éxito).
  const receiveKeyRef = useRef<string>('');
  if (!receiveKeyRef.current) receiveKeyRef.current = newIdempotencyKey();
  const payKeyRef = useRef<string>('');
  if (!payKeyRef.current) payKeyRef.current = newIdempotencyKey();

  const defaultAccount = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '';
  const isActive = ['RECEIVED', 'PARTIAL', 'PAID', 'RETURNED'].includes(purchase.status);

  async function receive(formData: FormData) {
    setLoading(true);
    const amount = Number(formData.get('amount') ?? 0);
    const accountId = String(formData.get('accountId') ?? '');

    const result = await receivePurchaseAction(
      purchase.id,
      amount > 0 && accountId
        ? {
            accountId,
            amount,
            method: String(formData.get('method') ?? 'CASH') as never,
            reference: null,
          }
        : null,
      receiveKeyRef.current,
    );
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo recibir la compra', result.error.message);
      return;
    }
    receiveKeyRef.current = newIdempotencyKey();
    toast.success('Compra recibida', 'Inventario y costo promedio actualizados.');
    setDialog('none');
    router.refresh();
  }

  async function pay(formData: FormData) {
    setLoading(true);
    const result = await registerPurchasePaymentAction({
      purchaseId: purchase.id,
      accountId: String(formData.get('accountId') ?? ''),
      amount: Number(formData.get('amount') ?? 0),
      method: String(formData.get('method') ?? 'CASH'),
      date: String(formData.get('date') ?? toDateInput()),
      reference: String(formData.get('reference') ?? ''),
      idempotencyKey: payKeyRef.current,
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo registrar el pago', result.error.message);
      return;
    }
    payKeyRef.current = newIdempotencyKey();
    toast.success('Pago registrado');
    setDialog('none');
    router.refresh();
  }

  async function cancel(formData: FormData) {
    setLoading(true);
    const result = await cancelPurchaseAction({
      id: purchase.id,
      reason: String(formData.get('reason') ?? ''),
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo anular la compra', result.error.message);
      return;
    }
    toast.success('Compra anulada', 'Inventario y pagos revertidos.');
    setDialog('none');
    router.refresh();
  }

  async function createReturn(formData: FormData) {
    const items = purchase.items
      .map((item) => ({
        productId: item.productId,
        quantity: Number(formData.get(`qty_${item.productId}`) ?? 0),
      }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      toast.error('Selecciona productos', 'Indica al menos una cantidad a devolver.');
      return;
    }

    setLoading(true);
    const result = await createPurchaseReturnAction({
      referenceId: purchase.id,
      date: String(formData.get('date') ?? toDateInput()),
      items,
      refundMode: String(formData.get('refundMode') ?? 'CREDIT_NOTE'),
      accountId: String(formData.get('accountId') ?? ''),
      reason: String(formData.get('reason') ?? ''),
      idempotencyKey: newIdempotencyKey(),
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo registrar la devolución', result.error.message);
      return;
    }
    toast.success(`Devolución ${result.data.number} registrada`);
    setDialog('none');
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {purchase.status === 'DRAFT' && permissions.includes('purchases.receive') && (
        <Button onClick={() => setDialog('receive')}>
          <PackageCheck className="h-4 w-4" /> Recibir compra
        </Button>
      )}

      {isActive && purchase.dueAmount > 0 && permissions.includes('payables.pay') && (
        <Button onClick={() => setDialog('payment')}>
          <Wallet className="h-4 w-4" /> Registrar pago
        </Button>
      )}

      {isActive && permissions.includes('purchases.return') && purchase.status !== 'RETURNED' && (
        <Button variant="secondary" onClick={() => setDialog('return')}>
          <RotateCcw className="h-4 w-4" /> Devolver
        </Button>
      )}

      {purchase.status !== 'CANCELLED' && permissions.includes('purchases.cancel') && (
        <Button variant="secondary" onClick={() => setDialog('cancel')}>
          <Ban className="h-4 w-4" /> Anular
        </Button>
      )}

      <Modal
        open={dialog === 'receive'}
        onClose={() => !loading && setDialog('none')}
        title="Recibir compra"
        description="Se incrementará el inventario y se recalculará el costo promedio."
        size="sm"
      >
        <form action={receive} className="space-y-4">
          <Field label="Cuenta de pago" icon={<Wallet />}>
            <Select name="accountId" defaultValue={purchase.type === 'CASH' ? defaultAccount : ''}>
              <option value="">Sin pago ahora</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {formatMoney(account.currentBalance, currency)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Importe pagado" icon={<Banknote />}>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={purchase.type === 'CASH' ? toMajorUnits(purchase.total) : 0}
            />
          </Field>
          <Field label="Método" icon={<CreditCard />}>
            <Select name="method" defaultValue="CASH">
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialog('none')} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Recibir
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === 'payment'}
        onClose={() => !loading && setDialog('none')}
        title="Registrar pago a proveedor"
        description={`Saldo pendiente: ${formatMoney(purchase.dueAmount, currency)}`}
        size="sm"
      >
        <form action={pay} className="space-y-4">
          <Field label="Cuenta de origen" icon={<Wallet />} required>
            <Select name="accountId" defaultValue={defaultAccount} required>
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
              max={toMajorUnits(purchase.dueAmount)}
              defaultValue={toMajorUnits(purchase.dueAmount)}
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
        open={dialog === 'return'}
        onClose={() => !loading && setDialog('none')}
        title="Devolución a proveedor"
        description="El inventario sale de existencias y se recupera el valor."
      >
        <form action={createReturn} className="space-y-4">
          <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
            {purchase.items.map((item) => {
              const available = (item.quantity - (item.returnedQuantity ?? 0)) / 1000;
              return (
                <div key={item.productId} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-[var(--color-ink-subtle)]">
                      {item.sku} · Disponible: {available.toLocaleString('es-NI')}
                    </p>
                  </div>
                  <Input
                    name={`qty_${item.productId}`}
                    type="number"
                    step="0.001"
                    min="0"
                    max={available}
                    defaultValue={0}
                    className="w-28"
                    disabled={available <= 0}
                    aria-label={`Cantidad a devolver de ${item.name}`}
                  />
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Forma de reintegro" icon={<CreditCard />} required>
              <Select
                name="refundMode"
                defaultValue={purchase.dueAmount > 0 ? 'CREDIT_NOTE' : 'CASH_REFUND'}
              >
                <option value="CREDIT_NOTE">Reducir cuenta por pagar</option>
                <option value="CASH_REFUND">Reembolso en efectivo</option>
              </Select>
            </Field>
            <Field label="Cuenta" icon={<Wallet />}>
              <Select name="accountId" defaultValue={defaultAccount}>
                <option value="">No aplica</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Fecha" icon={<CalendarDays />}>
            <Input name="date" type="date" defaultValue={toDateInput()} />
          </Field>
          <Field label="Motivo" icon={<MessageSquare />} required>
            <Textarea name="reason" required />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialog('none')} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Registrar devolución
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === 'cancel'}
        onClose={() => !loading && setDialog('none')}
        title="Anular compra"
        size="sm"
      >
        <form action={cancel} className="space-y-4">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Se retirará del inventario la mercadería recibida, se reversarán los pagos y se cancelará
            la cuenta por pagar.
          </p>
          <Field label="Motivo" icon={<MessageSquare />} required>
            <Textarea name="reason" required />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialog('none')} disabled={loading}>
              Cerrar
            </Button>
            <Button type="submit" variant="danger" loading={loading}>
              Anular compra
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

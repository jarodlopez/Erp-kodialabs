'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Ban, CheckCircle2, RotateCcw, Trash2, Wallet } from 'lucide-react';

import {
  cancelSaleAction,
  confirmSaleAction,
  deleteSaleDraftAction,
  registerSalePaymentAction,
} from '@/app/actions/sales';
import { createSaleReturnAction } from '@/app/actions/inventory';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatMoney, toMajorUnits } from '@/lib/money';
import { newIdempotencyKey, toDateInput } from '@/lib/utils';
import type { FinancialAccount } from '@/types/finance';
import { PAYMENT_METHOD_LABELS } from '@/types/finance';
import type { Sale } from '@/types/sales';

export function SaleActions({
  sale,
  accounts,
  currency,
  permissions,
}: {
  sale: Sale;
  accounts: FinancialAccount[];
  currency: string;
  permissions: string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [dialog, setDialog] = useState<
    'none' | 'confirm' | 'payment' | 'cancel' | 'return' | 'delete'
  >('none');
  const [loading, setLoading] = useState(false);

  // Llaves de idempotencia estables por operación (se rotan tras cada éxito),
  // para que un reintento por red no genere una confirmación o cobro duplicado.
  const confirmKeyRef = useRef<string>('');
  if (!confirmKeyRef.current) confirmKeyRef.current = newIdempotencyKey();
  const paymentKeyRef = useRef<string>('');
  if (!paymentKeyRef.current) paymentKeyRef.current = newIdempotencyKey();

  const canCollect = permissions.includes('receivables.collect');
  const canCancel = permissions.includes('sales.cancel');
  const canReturn = permissions.includes('sales.return');

  const defaultAccount = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '';

  async function confirmDraft(formData: FormData) {
    setLoading(true);
    const amount = Number(formData.get('amount') ?? 0);
    const accountId = String(formData.get('accountId') ?? '');
    const result = await confirmSaleAction(
      sale.id,
      amount > 0 && accountId
        ? {
            accountId,
            amount,
            method: String(formData.get('method') ?? 'CASH') as never,
            reference: null,
          }
        : null,
      confirmKeyRef.current,
    );
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo confirmar la venta', result.error.message);
      return;
    }
    confirmKeyRef.current = newIdempotencyKey();
    toast.success('Venta confirmada', 'Inventario y finanzas actualizados.');
    setDialog('none');
    router.refresh();
  }

  async function registerPayment(formData: FormData) {
    setLoading(true);
    const result = await registerSalePaymentAction({
      saleId: sale.id,
      accountId: String(formData.get('accountId') ?? ''),
      amount: Number(formData.get('amount') ?? 0),
      method: String(formData.get('method') ?? 'CASH'),
      date: String(formData.get('date') ?? toDateInput()),
      reference: String(formData.get('reference') ?? ''),
      idempotencyKey: paymentKeyRef.current,
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo registrar el cobro', result.error.message);
      return;
    }
    paymentKeyRef.current = newIdempotencyKey();
    toast.success('Cobro registrado', `Total cobrado: ${formatMoney(result.data.paidAmount, currency)}`);
    setDialog('none');
    router.refresh();
  }

  async function cancelSale(formData: FormData) {
    setLoading(true);
    const result = await cancelSaleAction({
      id: sale.id,
      reason: String(formData.get('reason') ?? ''),
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo anular la venta', result.error.message);
      return;
    }
    toast.success('Venta anulada', 'Se revirtieron inventario y movimientos financieros.');
    setDialog('none');
    router.refresh();
  }

  async function deleteDraft() {
    setLoading(true);
    const result = await deleteSaleDraftAction(sale.id);
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo eliminar', result.error.message);
      return;
    }
    toast.success('Borrador eliminado', `Se eliminó el borrador ${sale.number}.`);
    setDialog('none');
    router.push('/ventas');
    router.refresh();
  }

  async function createReturn(formData: FormData) {
    const items = sale.items
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
    const result = await createSaleReturnAction({
      referenceId: sale.id,
      date: String(formData.get('date') ?? toDateInput()),
      items,
      refundMode: String(formData.get('refundMode') ?? 'CASH_REFUND'),
      accountId: String(formData.get('accountId') ?? ''),
      reason: String(formData.get('reason') ?? ''),
      idempotencyKey: newIdempotencyKey(),
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo registrar la devolución', result.error.message);
      return;
    }
    toast.success(
      `Devolución ${result.data.number} registrada`,
      `Valor devuelto: ${formatMoney(result.data.total, currency)}`,
    );
    setDialog('none');
    router.refresh();
  }

  const isActive = ['CONFIRMED', 'PARTIAL', 'PAID', 'RETURNED'].includes(sale.status);

  return (
    <div className="flex flex-wrap gap-2">
      {sale.status === 'DRAFT' && (
        <Button onClick={() => setDialog('confirm')}>
          <CheckCircle2 className="h-4 w-4" /> Confirmar venta
        </Button>
      )}

      {sale.status === 'DRAFT' && canCancel && (
        <Button variant="secondary" onClick={() => setDialog('delete')}>
          <Trash2 className="h-4 w-4" /> Eliminar borrador
        </Button>
      )}

      {isActive && sale.dueAmount > 0 && canCollect && (
        <Button onClick={() => setDialog('payment')}>
          <Wallet className="h-4 w-4" /> Registrar cobro
        </Button>
      )}

      {isActive && canReturn && sale.status !== 'RETURNED' && (
        <Button variant="secondary" onClick={() => setDialog('return')}>
          <RotateCcw className="h-4 w-4" /> Devolución
        </Button>
      )}

      {sale.status !== 'CANCELLED' && canCancel && (
        <Button variant="secondary" onClick={() => setDialog('cancel')}>
          <Ban className="h-4 w-4" /> Anular
        </Button>
      )}

      {/* -------------------------- Confirmar borrador ------------------------- */}
      <Modal
        open={dialog === 'confirm'}
        onClose={() => !loading && setDialog('none')}
        title="Confirmar venta"
        description={`Se descontará inventario por ${sale.items.length} producto(s).`}
        size="sm"
      >
        <form action={confirmDraft} className="space-y-4">
          <Field label="Cuenta de cobro" hint="Déjalo vacío para dejar la venta pendiente de cobro.">
            <Select name="accountId" defaultValue={sale.type === 'CASH' ? defaultAccount : ''}>
              <option value="">Sin cobro ahora</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Importe cobrado">
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={sale.type === 'CASH' ? toMajorUnits(sale.total) : 0}
            />
          </Field>

          <Field label="Método de pago">
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
              Confirmar
            </Button>
          </div>
        </form>
      </Modal>

      {/* ----------------------------- Cobro ----------------------------------- */}
      <Modal
        open={dialog === 'payment'}
        onClose={() => !loading && setDialog('none')}
        title="Registrar cobro"
        description={`Saldo pendiente: ${formatMoney(sale.dueAmount, currency)}`}
        size="sm"
      >
        <form action={registerPayment} className="space-y-4">
          <Field label="Cuenta de destino" required>
            <Select name="accountId" defaultValue={defaultAccount} required>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {formatMoney(account.currentBalance, currency)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Importe" required>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={toMajorUnits(sale.dueAmount)}
              defaultValue={toMajorUnits(sale.dueAmount)}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Método">
              <Select name="method" defaultValue="CASH">
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha">
              <Input name="date" type="date" defaultValue={toDateInput()} />
            </Field>
          </div>

          <Field label="Referencia">
            <Input name="reference" placeholder="N.º de transferencia, cheque..." />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialog('none')} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Registrar cobro
            </Button>
          </div>
        </form>
      </Modal>

      {/* --------------------------- Devolución -------------------------------- */}
      <Modal
        open={dialog === 'return'}
        onClose={() => !loading && setDialog('none')}
        title="Devolución de venta"
        description="El inventario vuelve a existencias y el valor se reintegra o se descuenta de la deuda."
      >
        <form action={createReturn} className="space-y-4">
          <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
            {sale.items.map((item) => {
              const available = (item.quantity - (item.returnedQuantity ?? 0)) / 1000;
              return (
                <div key={item.productId} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-[var(--color-ink-subtle)]">
                      {item.sku} · Disponible para devolver: {available.toLocaleString('es-NI')}
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
            <Field label="Forma de reintegro" required>
              <Select name="refundMode" defaultValue={sale.dueAmount > 0 ? 'CREDIT_NOTE' : 'CASH_REFUND'}>
                <option value="CASH_REFUND">Devolver dinero</option>
                <option value="CREDIT_NOTE">Reducir deuda (nota de crédito)</option>
              </Select>
            </Field>
            <Field label="Cuenta">
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

          <Field label="Fecha">
            <Input name="date" type="date" defaultValue={toDateInput()} />
          </Field>

          <Field label="Motivo" required>
            <Textarea name="reason" required placeholder="Producto defectuoso, error en el pedido..." />
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

      {/* ----------------------------- Anulación ------------------------------- */}
      <Modal
        open={dialog === 'cancel'}
        onClose={() => !loading && setDialog('none')}
        title="Anular venta"
        size="sm"
      >
        <form action={cancelSale} className="space-y-4">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Se revertirá el inventario, se reversarán los cobros registrados y se cancelará la cuenta
            por cobrar. La venta se conserva con estado <strong>Anulada</strong>.
          </p>
          <Field label="Motivo de la anulación" required>
            <Textarea name="reason" required placeholder="Explica por qué se anula esta venta." />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialog('none')} disabled={loading}>
              Cerrar
            </Button>
            <Button type="submit" variant="danger" loading={loading}>
              Anular venta
            </Button>
          </div>
        </form>
      </Modal>

      {/* -------------------------- Eliminar borrador -------------------------- */}
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => !loading && setDialog('none')}
        onConfirm={deleteDraft}
        title="Eliminar borrador"
        confirmLabel="Eliminar"
        loading={loading}
        message={
          <>
            El borrador <strong>{sale.number}</strong> se eliminará de forma permanente. Un borrador
            no afectó inventario ni finanzas, por lo que no hay nada que revertir. Esta acción no se
            puede deshacer.
          </>
        }
      />
    </div>
  );
}

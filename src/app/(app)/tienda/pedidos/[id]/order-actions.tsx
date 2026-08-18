'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

import { approveStoreOrderAction, rejectStoreOrderAction } from '@/app/actions/store';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/money';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/types/finance';

/**
 * Aprobación y rechazo de un pedido online.
 *
 * Aprobar genera la venta del ERP: descuenta inventario, escribe el asiento y
 * —si se elige una cuenta— registra el cobro. Sin cuenta, la venta queda a
 * crédito y el pedido pasa a cuentas por cobrar, que es lo correcto cuando el
 * cliente paga contra entrega.
 */
export function StoreOrderActions({
  orderId,
  orderNumber,
  total,
  currency,
  accounts,
  defaultAccountId,
  hasReceipt,
}: {
  orderId: string;
  orderNumber: string;
  total: number;
  currency: string;
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
  hasReceipt: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const initialAccount =
    defaultAccountId && accounts.some((account) => account.id === defaultAccountId)
      ? defaultAccountId
      : accounts[0]?.id ?? '';

  async function onApprove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    setLoading(true);
    setErrors({});

    const result = await approveStoreOrderAction({
      orderId,
      accountId: String(form.get('accountId') ?? ''),
      method: String(form.get('method') ?? 'TRANSFER'),
      reference: String(form.get('reference') ?? ''),
      note: String(form.get('note') ?? ''),
    });

    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo aprobar el pedido', result.error.message);
      return;
    }

    toast.success(`Venta ${result.data.saleNumber} generada`, 'Se descontó inventario y se registró el asiento.');
    setApproving(false);
    router.refresh();
  }

  async function onReject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    setLoading(true);
    setErrors({});

    const result = await rejectStoreOrderAction({
      orderId,
      note: String(form.get('note') ?? ''),
    });

    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo rechazar el pedido', result.error.message);
      return;
    }

    toast.success('Pedido rechazado');
    setRejecting(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setApproving(true)}>
          <CheckCircle2 className="h-4 w-4" /> Aprobar y facturar
        </Button>
        <Button variant="secondary" onClick={() => setRejecting(true)}>
          <XCircle className="h-4 w-4" /> Rechazar
        </Button>
      </div>

      <Modal
        open={approving}
        onClose={() => !loading && setApproving(false)}
        title={`Aprobar pedido ${orderNumber}`}
        description={`Se generará una venta confirmada por ${formatMoney(total, currency)}.`}
      >
        <form onSubmit={onApprove} className="space-y-4" noValidate>
          {!hasReceipt && (
            <p className="rounded-lg border border-[var(--color-warning-200)] bg-[var(--color-warning-50)] px-3 py-2 text-sm text-[var(--color-warning-700)]">
              Este pedido no tiene comprobante adjunto. Confirmá el pago antes de aprobarlo.
            </p>
          )}

          <Field
            label="Cuenta donde entró el dinero"
            htmlFor="accountId"
            error={errors.accountId}
            hint="Dejala vacía si el cliente paga contra entrega: la venta quedará a crédito."
          >
            <Select id="accountId" name="accountId" defaultValue={initialAccount}>
              <option value="">Sin cobro (venta a crédito)</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Método de pago" htmlFor="method" error={errors.method}>
              <Select id="method" name="method" defaultValue="TRANSFER">
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value as PaymentMethod}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Referencia" htmlFor="reference" error={errors.reference}>
              <Input id="reference" name="reference" maxLength={80} placeholder="N.º de transacción" />
            </Field>
          </div>

          <Field label="Nota interna" htmlFor="note" error={errors.note}>
            <Textarea id="note" name="note" rows={2} maxLength={300} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setApproving(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Aprobar y generar venta
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={rejecting}
        onClose={() => !loading && setRejecting(false)}
        title={`Rechazar pedido ${orderNumber}`}
        description="No se genera venta ni se toca el inventario. Si el pedido usó un cupón, se libera el uso."
        size="sm"
      >
        <form onSubmit={onReject} className="space-y-4" noValidate>
          <Field label="Motivo" htmlFor="note" required error={errors.note}>
            <Textarea
              id="note"
              name="note"
              rows={3}
              required
              maxLength={300}
              placeholder="Pago no confirmado, cliente canceló, datos incompletos…"
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRejecting(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="danger" loading={loading}>
              Rechazar pedido
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

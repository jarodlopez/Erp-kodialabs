'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Ban,
  MessageSquare,
  UserCheck,
  UserRound,
} from 'lucide-react';

import { assignDeliveryAction, cancelDeliveryAction } from '@/app/actions/delivery';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import type { RiderSummary } from '@/types/delivery';

/**
 * Acciones del despacho sobre un reparto vivo: reasignar y anular.
 *
 * Arrancar el viaje y cerrarlo NO están acá a propósito: los hace el rider
 * desde su vista, porque es quien está en la calle y porque el servidor exige
 * que sea el rider asignado. Poner esos botones en el panel invitaría a
 * "cerrar" repartos que nadie hizo.
 */
export function DeliveryActions({
  deliveryId,
  riders,
  currentRiderId,
}: {
  deliveryId: string;
  riders: RiderSummary[];
  currentRiderId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [riderId, setRiderId] = useState(currentRiderId ?? '');
  const [note, setNote] = useState('');

  async function onAssign() {
    if (loading || !riderId) return;
    setLoading(true);
    const result = await assignDeliveryAction({ deliveryId, riderId });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo asignar', result.error.message);
      return;
    }
    toast.success('Rider asignado');
    setAssignOpen(false);
    router.refresh();
  }

  async function onCancel() {
    if (loading) return;
    setLoading(true);
    const result = await cancelDeliveryAction({ deliveryId, note });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo anular', result.error.message);
      return;
    }
    toast.success('Reparto anulado');
    setCancelOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAssignOpen(true)}>
        <UserCheck className="mr-1.5 h-4 w-4" />
        {currentRiderId ? 'Reasignar' : 'Asignar rider'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
        <Ban className="mr-1.5 h-4 w-4" /> Anular
      </Button>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={currentRiderId ? 'Reasignar reparto' : 'Asignar rider'}
        description="Reasignar conserva el recorrido ya registrado: no se pierde nada de lo andado."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={onAssign} loading={loading} disabled={!riderId}>
              Asignar
            </Button>
          </>
        }
      >
        {riders.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No hay usuarios con permiso para repartir. Creá uno con el rol Repartidor en Usuarios.
          </p>
        ) : (
          <Field label="Rider" icon={<UserRound />} htmlFor="riderId" hint="Primero quien tiene menos repartos encima.">
            <Select
              id="riderId"
              value={riderId}
              onChange={(event) => setRiderId(event.target.value)}
            >
              <option value="">Elegí un rider</option>
              {riders.map((rider) => (
                <option key={rider.userId} value={rider.userId}>
                  {rider.name} · {rider.activeCount} activo(s)
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Anular reparto"
        description="El documento de origen no se toca: la venta o el pedido siguen como estaban."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={loading}>
              Volver
            </Button>
            <Button variant="danger" onClick={onCancel} loading={loading} disabled={!note.trim()}>
              Anular reparto
            </Button>
          </>
        }
      >
        <Field label="Motivo" icon={<MessageSquare />} htmlFor="note" required>
          <Textarea
            id="note"
            rows={3}
            maxLength={300}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="El cliente reprogramó para mañana."
          />
        </Field>
      </Modal>
    </>
  );
}

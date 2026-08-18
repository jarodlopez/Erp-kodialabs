import Link from 'next/link';
import { Bike } from 'lucide-react';

import { PERMISSIONS, type Permission } from '@/lib/rbac';
import { deliveryRepository } from '@/lib/repositories/delivery';
import { DELIVERY_STATUS_LABELS, type DeliverySource } from '@/types/delivery';

/**
 * Puente entre un documento y su reparto.
 *
 * Vive en la ficha de la venta y del pedido, que es donde alguien decide
 * mandar la mercadería: obligar a ir a otro módulo, buscar el número y
 * despachar desde cero es el tipo de fricción que hace que la función quede sin
 * usar. Si el reparto ya existe muestra su estado en lugar de ofrecer crear
 * otro, porque el servidor rechaza el duplicado y es mejor decirlo antes.
 *
 * Una sola lectura por ficha. No se renderiza nada para quien no tiene permiso
 * de reparto.
 */
export async function DeliveryLink({
  organizationId,
  source,
  sourceId,
  permissions,
}: {
  organizationId: string;
  source: DeliverySource;
  sourceId: string;
  permissions: Permission[];
}) {
  if (!permissions.includes(PERMISSIONS.DELIVERY_VIEW)) return null;

  const existing = await deliveryRepository.findBySource(organizationId, sourceId);

  if (existing) {
    return (
      <Link
        href={`/repartos/${existing.id}`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-canvas)]"
      >
        <Bike className="h-4 w-4" /> Reparto {existing.number} ·{' '}
        <span className="text-[var(--color-ink-subtle)]">
          {DELIVERY_STATUS_LABELS[existing.status]}
        </span>
      </Link>
    );
  }

  if (!permissions.includes(PERMISSIONS.DELIVERY_MANAGE)) return null;

  const query = source === 'SALE' ? `venta=${sourceId}` : `pedido=${sourceId}`;
  return (
    <Link
      href={`/repartos/nuevo?${query}`}
      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-canvas)]"
    >
      <Bike className="h-4 w-4" /> Crear reparto
    </Link>
  );
}

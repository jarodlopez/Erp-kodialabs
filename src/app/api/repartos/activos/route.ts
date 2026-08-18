import { NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/session';
import { logError, toAppError } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/rbac';
import { deliveryRepository } from '@/lib/repositories/delivery';
import { ACTIVE_DELIVERY_STATUSES } from '@/types/delivery';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Repartos vivos para el mapa en vivo.
 *
 * Existe como ruta y no como Server Action porque el mapa consulta cada pocos
 * segundos y una Server Action invalidaría la caché del panel en cada vuelta.
 * Devuelve lo MÍNIMO que el mapa dibuja: no viajan notas, teléfonos ni
 * importes, que no se pintan y no tienen por qué salir del servidor.
 *
 * Una lectura por reparto activo, gracias a que la última posición vive dentro
 * del propio documento del reparto.
 */
export async function GET() {
  try {
    const session = await requirePermission(PERMISSIONS.DELIVERY_VIEW);
    const active = await deliveryRepository.active(
      session.organizationId,
      ACTIVE_DELIVERY_STATUSES,
    );

    return NextResponse.json(
      {
        at: new Date().toISOString(),
        deliveries: active.map((delivery) => ({
          id: delivery.id,
          number: delivery.number,
          status: delivery.status,
          customerName: delivery.customerName,
          address: delivery.destination.address,
          riderName: delivery.riderName,
          origin: delivery.origin,
          destination: delivery.destination.point,
          lastPoint: delivery.lastPoint,
          traveled: delivery.distances.traveled,
          estimated: delivery.distances.estimated,
        })),
      },
      // Sin caché en ningún tramo: el sentido de esta ruta es dar el estado de
      // hace segundos, no el de la última vez que alguien preguntó.
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const appError = toAppError(error);
    logError('delivery.active', error);
    return NextResponse.json({ error: appError.message }, { status: appError.httpStatus });
  }
}

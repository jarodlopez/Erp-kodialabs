import { Badge } from '@/components/ui/primitives';
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from '@/types/delivery';

const TONE: Record<DeliveryStatus, 'neutral' | 'warning' | 'positive' | 'danger' | 'brand'> = {
  PENDING: 'warning',
  ASSIGNED: 'brand',
  IN_TRANSIT: 'brand',
  DELIVERED: 'positive',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return <Badge tone={TONE[status]}>{DELIVERY_STATUS_LABELS[status]}</Badge>;
}

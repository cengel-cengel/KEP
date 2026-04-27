import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import type { ShipmentStatus } from '@/types/shipment';

const TONE: Record<ShipmentStatus, 'gold' | 'info' | 'warning' | 'success' | 'error' | 'neutral'> = {
  erfasst: 'gold',
  abgeholt: 'info',
  in_transit: 'warning',
  zugestellt: 'success',
  klaerung: 'error',
  storniert: 'neutral',
};

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const t = useTranslations('PortalCommon.status');
  return (
    <Badge tone={TONE[status]} dot>
      {t(status)}
    </Badge>
  );
}

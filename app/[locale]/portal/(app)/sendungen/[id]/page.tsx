import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShipmentStatusBadge } from '@/components/portal/ShipmentStatusBadge';
import { getMockShipmentById } from '@/mocks/shipments';

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const shipment = getMockShipmentById(id);
  if (!shipment) notFound();

  return <Stub trackingNumber={shipment.trackingNumber} status={shipment.status} />;
}

function Stub({
  trackingNumber,
  status,
}: {
  trackingNumber: string;
  status: import('@/types/shipment').ShipmentStatus;
}) {
  const t = useTranslations('PortalNavigation');
  return (
    <div className="rounded-2xl bg-white p-8 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-mono text-xl font-semibold text-brand">{trackingNumber}</h1>
        <ShipmentStatusBadge status={status} />
      </div>
      <p className="mt-4 text-sm text-slate-600">
        Detailansicht ({t('shipments')}) wird im nächsten Sprint freigeschaltet.
      </p>
    </div>
  );
}

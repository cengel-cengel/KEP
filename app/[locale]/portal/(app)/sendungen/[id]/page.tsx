import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/Badge';
import { ShipmentDetailTabs } from '@/components/portal/ShipmentDetail/Tabs';
import { OverviewTab } from '@/components/portal/ShipmentDetail/OverviewTab';
import { TrackingTab } from '@/components/portal/ShipmentDetail/TrackingTab';
import { DocumentsTab } from '@/components/portal/ShipmentDetail/DocumentsTab';
import { PackagesTab } from '@/components/portal/ShipmentDetail/PackagesTab';
import { ShipmentStatusBadge } from '@/components/portal/ShipmentStatusBadge';
import { ActionBar } from '@/components/portal/ShipmentDetail/ActionBar';
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

  const t = await getTranslations({ locale, namespace: 'PortalShipmentDetail' });

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-500">
        <Link href="/portal/sendungen" className="hover:text-brand transition">
          {t('breadcrumb_label')}
        </Link>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
        <span className="font-mono text-brand">{shipment.trackingNumber}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="font-mono text-2xl font-semibold text-brand">
            {shipment.trackingNumber}
          </h1>
          <ShipmentStatusBadge status={shipment.status} />
          {shipment.options.adr && (
            <Badge tone="warning" dot>
              ADR
            </Badge>
          )}
        </div>
        <ActionBar trackingNumber={shipment.trackingNumber} />
      </div>

      <ShipmentDetailTabs
        overview={<OverviewTab shipment={shipment} />}
        tracking={<TrackingTab shipment={shipment} />}
        documents={<DocumentsTab />}
        packages={<PackagesTab shipment={shipment} />}
      />
    </div>
  );
}

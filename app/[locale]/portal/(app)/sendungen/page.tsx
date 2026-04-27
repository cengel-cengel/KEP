import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { ShipmentListClient } from '@/components/portal/ShipmentListClient';
import { getMockShipments } from '@/mocks/shipments';
import { buildLocaleMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'PortalShipments' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('subtitle'),
    pathname: '/portal/sendungen',
    noIndex: true,
  });
}

export default async function PortalShipmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const shipments = getMockShipments();

  return (
    <div className="space-y-6">
      <PageHeader />
      <ShipmentListClient shipments={shipments} />
    </div>
  );
}

function PageHeader() {
  const t = useTranslations('PortalShipments');
  return (
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-2xl font-semibold text-brand">{t('page_title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
      </div>
      <Button asChild leftIcon={<Plus className="h-4 w-4" />}>
        <Link href="/portal/sendungen/neu">{t('new_shipment_button')}</Link>
      </Button>
    </div>
  );
}

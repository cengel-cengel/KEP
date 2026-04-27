import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';

export default async function NewShipmentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ComingSoon />;
}

function ComingSoon() {
  const t = useTranslations('PortalNavigation');
  return (
    <div className="rounded-2xl bg-white p-8 ring-1 ring-slate-200">
      <h1 className="text-2xl font-semibold text-brand">{t('new_shipment')}</h1>
      <p className="mt-2 text-sm text-slate-600">
        Diese Seite wird im nächsten Sprint freigeschaltet.
      </p>
    </div>
  );
}

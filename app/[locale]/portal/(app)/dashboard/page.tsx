import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, FileText, Package, Plus, Truck, Users } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { KpiCard } from '@/components/portal/KpiCard';
import { ShipmentTable } from '@/components/portal/ShipmentTable';
import { getMockShipments } from '@/mocks/shipments';
import { getSession } from '@/lib/session';
import { buildLocaleMetadata } from '@/lib/seo';
import type { Shipment } from '@/types/shipment';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'PortalDashboard' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_title'),
    pathname: '/portal/dashboard',
    noIndex: true,
  });
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  const shipments = getMockShipments();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  const totalThisMonth = shipments.filter(
    (s) => new Date(s.createdAt) >= startOfMonth,
  ).length;
  const inTransit = shipments.filter((s) => s.status === 'in_transit').length;
  const deliveredThisMonth = shipments.filter(
    (s) => s.status === 'zugestellt' && new Date(s.createdAt) >= startOfMonth,
  ).length;
  const last7d = shipments.filter((s) => new Date(s.createdAt) >= sevenDaysAgo).length;

  return (
    <div className="space-y-6 lg:space-y-8">
      <Welcome firstName={session?.firstName ?? ''} />
      <KpiGrid
        totalThisMonth={totalThisMonth}
        inTransit={inTransit}
        deliveredThisMonth={deliveredThisMonth}
        last7d={last7d}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <RecentShipmentsCard shipments={shipments.slice(0, 5)} />
        <QuickActions />
      </div>
    </div>
  );
}

function Welcome({ firstName }: { firstName: string }) {
  const t = useTranslations('PortalDashboard');
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-700 p-6 text-white sm:p-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">
        {t('welcome_back', { firstName: firstName || '—' })}
      </h1>
      <p className="mt-1 text-brand-100">{t('welcome_subtitle')}</p>
    </div>
  );
}

interface KpiGridProps {
  totalThisMonth: number;
  inTransit: number;
  deliveredThisMonth: number;
  last7d: number;
}

function KpiGrid({ totalThisMonth, inTransit, deliveredThisMonth, last7d }: KpiGridProps) {
  const t = useTranslations('PortalDashboard');
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard icon={Package} label={t('kpi_total')} value={totalThisMonth} tone="brand" />
      <KpiCard icon={Truck} label={t('kpi_in_transit')} value={inTransit} tone="warning" />
      <KpiCard icon={Package} label={t('kpi_delivered')} value={deliveredThisMonth} tone="success" />
      <KpiCard icon={FileText} label={t('kpi_recent_7d')} value={last7d} tone="gold" />
    </div>
  );
}

function RecentShipmentsCard({ shipments }: { shipments: ReadonlyArray<Shipment> }) {
  const t = useTranslations('PortalDashboard');
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-brand">{t('recent_title')}</h2>
        <Button asChild variant="ghost" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
          <Link href="/portal/sendungen">{t('recent_view_all')}</Link>
        </Button>
      </div>
      <div className="mt-4">
        <ShipmentTable shipments={shipments} />
      </div>
    </section>
  );
}

function QuickActions() {
  const t = useTranslations('PortalDashboard');
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-brand">{t('actions_title')}</h2>
      <div className="mt-4 space-y-2">
        <Button asChild className="w-full justify-start" leftIcon={<Plus className="h-4 w-4" />}>
          <Link href="/portal/sendungen/neu">{t('action_new_shipment')}</Link>
        </Button>
        <Button asChild variant="outline" className="w-full justify-start" leftIcon={<Users className="h-4 w-4" />}>
          <Link href="/portal/profil">{t('action_address_book')}</Link>
        </Button>
        <Button asChild variant="outline" className="w-full justify-start" leftIcon={<FileText className="h-4 w-4" />}>
          <Link href="/portal/dokumente">{t('action_documents')}</Link>
        </Button>
      </div>
    </section>
  );
}

import { useTranslations } from 'next-intl';
import { Mail } from 'lucide-react';
import type { MasterDataView } from './types';

export function MasterDataSection({ data }: { data: MasterDataView }) {
  const t = useTranslations('PortalProfile.section_master');

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand">{t('title')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <a
          href={`mailto:disposition@ked-global-logistics.de?subject=${encodeURIComponent('Stammdatenänderung')}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          {t('contact_dispatcher')}
        </a>
      </header>

      <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Row label={t('company')} value={data.company} />
        <Row label={t('customer_number')} value={data.customerNumber} mono />
        <Row label={t('street')} value={data.street} />
        <Row label={t('zip_city')} value={`${data.zip} ${data.city}`} />
        <Row label={t('country')} value={data.country} />
        <Row label={t('ust_id')} value={data.ustId} mono />
        <Row label={t('industry')} value={data.industry} />
        <Row label={t('customer_since')} value={data.customerSince} />
      </dl>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

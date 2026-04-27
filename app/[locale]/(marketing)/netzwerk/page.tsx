import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, Building2, Mail, MapPin, Network, Phone } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Section, SectionHeader } from '@/components/ui/Section';
import { PageHero } from '@/components/marketing/PageHero';
import { ROUTES, SITE } from '@/lib/constants';
import { buildLocaleMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'NetworkPage' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/netzwerk',
    keywords:
      locale === 'en'
        ? ['Network', 'UK Logistics', 'Witham', 'Stoke', 'England Logistics', 'Stuttgart freight forwarder', 'line service']
        : ['Netzwerk', 'UK Logistik', 'Witham', 'Stoke', 'England Logistics', 'Stuttgart Spedition', 'Linienverkehr'],
  });
}

interface LineRow {
  route: string;
  frequency: string;
  transit: string;
  cutoff: string;
}

interface PartnerItem {
  name: string;
  country: string;
  description: string;
}

const HUB_KEYS = ['witham', 'stoke'] as const;
type HubKey = (typeof HUB_KEYS)[number];

const STAT_KEYS = ['hall_area', 'gates', 'daily_shipments', 'employees'] as const;

export default async function NetworkPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <NetworkHero />
      <StuttgartSection />
      <UkPartnerSection />
      <LinesSection />
      <PartnersSection />
      <NetworkCta />
    </>
  );
}

function NetworkHero() {
  const t = useTranslations('NetworkPage');
  return (
    <PageHero
      eyebrow={t('hero_eyebrow')}
      title={t('hero_title')}
      description={t('hero_subtitle')}
    />
  );
}

function StuttgartSection() {
  const t = useTranslations('NetworkPage');
  const tStats = useTranslations('NetworkPage.hq_stats');

  return (
    <Section tone="white" spacing="lg">
      <Container>
        <article id="stuttgart" className="grid scroll-mt-24 items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <Image
              src="/images/network-hub.jpg"
              alt={t('hq_image_alt')}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
              {t('hq_eyebrow')}
            </p>
            <h2 className="mt-3 text-display-md text-brand text-balance">
              {t('hq_title')}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              {t('hq_description')}
            </p>

            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200">
              {STAT_KEYS.map((key) => (
                <div key={key} className="bg-white p-5">
                  <p className="text-2xl font-bold text-brand">{tStats(`${key}.value`)}</p>
                  <p className="mt-1 text-xs text-slate-600">{tStats(`${key}.label`)}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-xl ring-1 ring-slate-200 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('hq_address_label')}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  <span className="text-slate-700">
                    {SITE.address.street}, {SITE.address.zip} {SITE.address.city}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  <a href={`tel:${SITE.phone}`} className="text-slate-700 hover:text-brand">
                    {SITE.phoneDisplay}
                  </a>
                </li>
                <li className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  <a href={`mailto:${SITE.email}`} className="text-slate-700 hover:text-brand">
                    {SITE.email}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </article>
      </Container>
    </Section>
  );
}

function UkPartnerSection() {
  const t = useTranslations('NetworkPage');

  return (
    <Section tone="slate" spacing="lg">
      <Container>
        <SectionHeader
          eyebrow={t('partner_eyebrow')}
          title={t('partner_title')}
          description={t('partner_intro')}
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {HUB_KEYS.map((hub) => (
            <HubCard key={hub} hubKey={hub} />
          ))}
        </div>
      </Container>
    </Section>
  );
}

function HubCard({ hubKey }: { hubKey: HubKey }) {
  const t = useTranslations(`NetworkPage.${hubKey}`);

  return (
    <article
      id={hubKey}
      className="flex scroll-mt-24 flex-col rounded-2xl bg-white p-8 ring-1 ring-slate-200"
    >
      <Badge tone="info" dot>
        {t('eyebrow')}
      </Badge>
      <h3 className="mt-4 text-2xl font-semibold text-brand">{t('name')}</h3>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-500">
        <MapPin className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
        {t('location')}
      </p>
      <p className="mt-4 leading-relaxed text-slate-600">{t('description')}</p>

      <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-6 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('coverage_label')}
          </dt>
          <dd className="mt-1.5 text-slate-700">{t('coverage')}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('transit_label')}
          </dt>
          <dd className="mt-1.5 text-slate-700">{t('transit')}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('frequency_label')}
          </dt>
          <dd className="mt-1.5 text-slate-700">{t('frequency')}</dd>
        </div>
      </dl>
    </article>
  );
}

function LinesSection() {
  const t = useTranslations('NetworkPage');
  const tCols = useTranslations('NetworkPage.lines_columns');
  const lines = (t.raw('lines') as ReadonlyArray<LineRow>) ?? [];

  return (
    <Section tone="white" spacing="lg">
      <Container>
        <SectionHeader
          eyebrow={t('lines_eyebrow')}
          title={t('lines_title')}
          description={t('lines_description')}
        />

        {/* Mobile: Cards */}
        <ul className="mt-12 grid gap-4 sm:hidden">
          {lines.map((line) => (
            <li key={line.route} className="rounded-xl ring-1 ring-slate-200 p-5">
              <p className="font-semibold text-brand">{line.route}</p>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <dt className="text-slate-500">{tCols('frequency')}</dt>
                  <dd className="font-medium text-slate-700">{line.frequency}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{tCols('transit')}</dt>
                  <dd className="font-medium text-slate-700">{line.transit}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{tCols('cutoff')}</dt>
                  <dd className="font-medium text-slate-700">{line.cutoff}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        {/* Desktop: Tabelle */}
        <div className="mt-12 hidden overflow-hidden rounded-xl ring-1 ring-slate-200 sm:block">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {tCols('route')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {tCols('frequency')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {tCols('transit')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {tCols('cutoff')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {lines.map((line) => (
                <tr key={line.route} className="transition hover:bg-slate-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-brand">
                    {line.route}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                    {line.frequency}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                    {line.transit}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                    {line.cutoff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
    </Section>
  );
}

function PartnersSection() {
  const t = useTranslations('NetworkPage');
  const partners = (t.raw('partners') as ReadonlyArray<PartnerItem>) ?? [];

  return (
    <Section tone="slate" spacing="lg">
      <Container>
        <SectionHeader
          eyebrow={t('partners_eyebrow')}
          title={t('partners_title')}
          description={t('partners_description')}
        />

        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {partners.map((partner) => (
            <li
              key={partner.name}
              className="flex flex-col rounded-xl bg-white p-6 ring-1 ring-slate-200"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-brand-50 text-brand">
                <Network className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-brand">{partner.name}</h3>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gold-700">
                <Building2 className="h-3 w-3" aria-hidden="true" />
                {partner.country}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                {partner.description}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-xs italic text-slate-500">
          {t('partners_disclaimer')}
        </p>
      </Container>
    </Section>
  );
}

function NetworkCta() {
  const t = useTranslations('NetworkPage');

  return (
    <Section tone="gradient" spacing="lg">
      <Container>
        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              {t('cta_eyebrow')}
            </p>
            <h2 className="mt-3 text-display-md text-balance text-white">{t('cta_title')}</h2>
            <p className="mt-4 text-lg text-brand-100">{t('cta_description')}</p>
          </div>
          <Button asChild variant="secondary" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
            <Link href={ROUTES.kontakt}>{t('cta_button')}</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}

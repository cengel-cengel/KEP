import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  MapPin,
  PackageCheck,
  Phone,
  QrCode,
  Radar,
  Shield,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Hero } from '@/components/marketing/Hero';
import { StatsStrip } from '@/components/marketing/StatsStrip';
import { ServiceCard } from '@/components/marketing/ServiceCard';
import { CtaBlock } from '@/components/marketing/CtaBlock';
import {
  LOCATION_KEYS,
  ROUTES,
  SERVICE_IMAGES,
  SERVICE_KEYS,
  SITE,
  TRUST_KEYS,
  type ServiceKey,
} from '@/lib/constants';
import { buildLocaleMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Landing' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/',
  });
}

const FEATURE_ICONS = {
  tracking: Radar,
  documents: FileText,
  qr: QrCode,
  portal: Shield,
} as const;

const TRUST_ICONS = {
  adsp: CheckCircle2,
  ids: CheckCircle2,
  aeo: CheckCircle2,
  iso: PackageCheck,
} as const;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const tServices = await getTranslations({ locale, namespace: 'Services.items' });
  const serviceJsonLd = SERVICE_KEYS.map((key) => ({
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: tServices(`${key}.title`),
    description: tServices(`${key}.long`),
    provider: { '@id': `${SITE.url}/#organization` },
    areaServed:
      key === 'uk'
        ? { '@type': 'Country', name: 'United Kingdom' }
        : { '@type': 'Country', name: 'Germany' },
  }));

  return (
    <>
      <Hero />
      <StatsStrip />
      <ServicesSection />
      <LocationsSection />
      <TechSection />
      <TrustSection />
      <CtaBlock />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
    </>
  );
}

function ServicesSection() {
  const t = useTranslations('Services');

  return (
    <Section tone="white" spacing="lg">
      <Container>
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <SectionHeader
            eyebrow={t('section_eyebrow')}
            title={t('section_title')}
            description={t('section_description')}
          />
          <Button asChild variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />}>
            <Link href={ROUTES.leistungen}>{t('see_all')}</Link>
          </Button>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICE_KEYS.map((key) => (
            <ServiceCard
              key={key}
              title={t(`items.${key}.title`)}
              description={t(`items.${key}.short`)}
              image={SERVICE_IMAGES[key as ServiceKey]}
              imageAlt={t(`items.${key}.alt`)}
              href="/leistungen"
              hash={key}
            />
          ))}
        </div>
      </Container>
    </Section>
  );
}

function LocationsSection() {
  const t = useTranslations('Locations');

  return (
    <Section tone="slate" spacing="lg">
      <Container>
        <SectionHeader
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('description')}
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {LOCATION_KEYS.map((key) => (
            <article
              key={key}
              className="flex flex-col rounded-xl bg-white p-8 ring-1 ring-slate-200"
            >
              <Badge tone={key === 'stuttgart' ? 'gold' : 'info'} dot>
                {t(`items.${key}.label`)}
              </Badge>
              <h3 className="mt-4 text-2xl font-semibold text-brand">
                {t(`items.${key}.name`)}
              </h3>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {t(`items.${key}.role`)}
              </p>
              <p className="mt-4 leading-relaxed text-slate-600">
                {t(`items.${key}.description`)}
              </p>

              <dl className="mt-6 space-y-3 border-t border-slate-100 pt-6 text-sm">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  <span className="text-slate-700">{t(`items.${key}.address`)}</span>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  <span className="text-slate-700">{t(`items.${key}.phone`)}</span>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function TechSection() {
  const t = useTranslations('Tech');
  const featureKeys = ['tracking', 'documents', 'qr', 'portal'] as const;

  return (
    <Section tone="white" spacing="lg">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-slate-200 lg:order-1">
            <Image
              src="/images/team-disposition.jpg"
              alt={t('image_alt')}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
              {t('eyebrow')}
            </p>
            <h2 className="mt-3 text-display-md text-brand text-balance">{t('title')}</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">{t('description')}</p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {featureKeys.map((key) => {
                const Icon = FEATURE_ICONS[key];
                return (
                  <li key={key} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-medium text-brand">{t(`features.${key}.title`)}</p>
                      <p className="mt-0.5 text-sm text-slate-600">{t(`features.${key}.description`)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-8">
              <Button asChild variant="outline" rightIcon={<ArrowRight className="h-4 w-4" />}>
                <Link href={ROUTES.portal.login}>{t('cta')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

function TrustSection() {
  const t = useTranslations('Trust');

  return (
    <Section tone="slate" spacing="md">
      <Container>
        <div className="flex flex-col items-center gap-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
            {t('label')}
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-600">
            {TRUST_KEYS.map((key) => {
              const Icon = TRUST_ICONS[key];
              return (
                <li key={key} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-gold" aria-hidden="true" />
                  {t(`items.${key}`)}
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </Section>
  );
}

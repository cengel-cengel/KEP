import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Container } from '@/components/ui/Container';
import { Section, SectionHeader } from '@/components/ui/Section';
import { PageHero } from '@/components/marketing/PageHero';
import { CtaBlock } from '@/components/marketing/CtaBlock';
import { FaqAccordion } from '@/components/marketing/FaqAccordion';
import {
  SERVICE_IMAGES,
  SERVICE_KEYS,
  SITE,
  type ServiceKey,
} from '@/lib/constants';
import { buildLocaleMetadata } from '@/lib/seo';
import { JsonLd, buildBreadcrumbList } from '@/components/shared/JsonLd';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ServicesPage' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/leistungen',
  });
}

interface FaqItem {
  q: string;
  a: string;
}

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'ServicesPage' });
  const tNav = await getTranslations({ locale, namespace: 'Navigation' });
  const faq = (t.raw('faq') as ReadonlyArray<FaqItem>) ?? [];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((q) => ({
      '@type': 'Question',
      name: q.q,
      acceptedAnswer: { '@type': 'Answer', text: q.a },
    })),
  };

  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: tNav('services'), url: `${SITE.url}/${locale === 'en' ? 'en/services' : 'leistungen'}` },
  ]);

  return (
    <>
      <PageHero
        eyebrow={t('hero_eyebrow')}
        title={t('hero_title')}
        description={t('hero_subtitle')}
      />

      <JsonLd data={faqJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />

      <Section tone="white" spacing="none">
        <Container>
          <div className="space-y-24 py-20 sm:space-y-32 sm:py-24">
            {SERVICE_KEYS.map((key, idx) => (
              <ServiceBlock key={key} serviceKey={key} reverse={idx % 2 === 1} />
            ))}
          </div>
        </Container>
      </Section>

      <CustomsSection />

      <Section tone="slate" spacing="lg">
        <Container size="md">
          <SectionHeader
            eyebrow={t('faq_eyebrow')}
            title={t('faq_title')}
            description={t('faq_description')}
            align="center"
            className="mx-auto"
          />
          <div className="mt-12">
            <FaqAccordion items={faq} />
          </div>
        </Container>
      </Section>

      <CtaBlock />
    </>
  );
}

function ServiceBlock({
  serviceKey,
  reverse,
}: {
  serviceKey: ServiceKey;
  reverse: boolean;
}) {
  const tServices = useTranslations('Services');
  const tPage = useTranslations('ServicesPage');
  const offer = (tPage.raw(`details.${serviceKey}.offer`) as string[]) ?? [];
  const benefits = (tPage.raw(`details.${serviceKey}.benefits`) as string[]) ?? [];

  return (
    <article
      id={serviceKey}
      className="grid scroll-mt-24 items-center gap-12 lg:grid-cols-2 lg:gap-16"
    >
      <div
        className={cn(
          'relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-slate-200',
          '3xl:aspect-[3/2] 4xl:aspect-[16/10]',
          'mx-auto w-full max-w-[720px] 3xl:max-w-[820px]',
          reverse && 'lg:order-2',
        )}
      >
        <Image
          src={SERVICE_IMAGES[serviceKey]}
          alt={tServices(`items.${serviceKey}.alt`)}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, (max-width: 1920px) 50vw, 820px"
          className="object-cover"
        />
      </div>

      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
          {tServices(`items.${serviceKey}.title`)}
        </p>
        <h2 className="mt-3 text-display-md text-brand text-balance">
          {tServices(`items.${serviceKey}.short`)}
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">
          {tPage(`details.${serviceKey}.intro`)}
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <DetailList label={tPage('block_offer_label')} items={offer} />
          <DetailList label={tPage('block_benefits_label')} items={benefits} />
        </div>

        <dl className="mt-8 grid gap-6 sm:grid-cols-2 border-t border-slate-200 pt-6 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {tPage('block_for_label')}
            </dt>
            <dd className="mt-2 text-slate-700">
              {tPage(`details.${serviceKey}.for`)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {tPage('block_transit_label')}
            </dt>
            <dd className="mt-2 text-slate-700">
              {tPage(`details.${serviceKey}.transit`)}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function DetailList({ label, items }: { label: string; items: ReadonlyArray<string> }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CustomsHighlight {
  title: string;
  items: string[];
}

function CustomsSection() {
  const t = useTranslations('ServicesPage');
  const highlights = (t.raw('customs_highlights') as CustomsHighlight[]) ?? [];
  const trustItems = (t.raw('customs_trust') as string[]) ?? [];

  return (
    <Section tone="slate" spacing="lg" id="customs" className="scroll-mt-24">
      <Container>
        <div className="flex flex-col items-start gap-3 text-center sm:items-center">
          <Badge tone="gold" dot>
            {t('customs_eyebrow')}
          </Badge>
          <h2 className="text-display-md text-balance text-brand">
            {t('customs_title')}
          </h2>
          <p className="max-w-3xl text-lg leading-relaxed text-slate-600">
            {t('customs_subtitle')}
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {highlights.map((h) => (
            <article
              key={h.title}
              className="rounded-xl bg-white p-6 ring-1 ring-slate-200"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="text-lg font-semibold text-brand">{h.title}</h3>
              </div>
              <ul className="mt-4 space-y-2">
                {h.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" aria-hidden="true" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('customs_trust_title')}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {trustItems.map((item) => (
              <li key={item}>
                <span className="inline-flex items-center rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex justify-center">
          <Button asChild rightIcon={<ArrowRight className="h-4 w-4" />}>
            <Link href="/kontakt">{t('customs_cta')}</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}

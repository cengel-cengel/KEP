import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Container } from '@/components/ui/Container';
import { Section, SectionHeader } from '@/components/ui/Section';
import { PageHero } from '@/components/marketing/PageHero';
import { CtaBlock } from '@/components/marketing/CtaBlock';
import { FaqAccordion } from '@/components/marketing/FaqAccordion';
import {
  SERVICE_IMAGES,
  SERVICE_KEYS,
  type ServiceKey,
} from '@/lib/constants';
import { buildLocaleMetadata } from '@/lib/seo';

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
  const faq = (t.raw('faq') as ReadonlyArray<FaqItem>) ?? [];

  return (
    <>
      <PageHero
        eyebrow={t('hero_eyebrow')}
        title={t('hero_title')}
        description={t('hero_subtitle')}
      />

      <Section tone="white" spacing="none">
        <Container>
          <div className="space-y-24 py-20 sm:space-y-32 sm:py-24">
            {SERVICE_KEYS.map((key, idx) => (
              <ServiceBlock key={key} serviceKey={key} reverse={idx % 2 === 1} />
            ))}
          </div>
        </Container>
      </Section>

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

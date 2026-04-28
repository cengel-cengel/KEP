import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Container } from '@/components/ui/Container';
import { Section, SectionHeader } from '@/components/ui/Section';
import { PageHero } from '@/components/marketing/PageHero';
import { CtaBlock } from '@/components/marketing/CtaBlock';
import { INDUSTRY_IMAGES, INDUSTRY_KEYS, type IndustryKey } from '@/lib/constants';
import { buildLocaleMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'IndustriesPage' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/branchen',
    keywords:
      locale === 'en'
        ? ['Industries', 'Automotive logistics Stuttgart', 'JIT JIS', 'Mechanical engineering forwarder', 'FMCG e-commerce', 'Heavy goods Stuttgart']
        : ['Branchen', 'Automotive Logistik Stuttgart', 'JIT JIS Belieferung', 'Maschinenbau Spedition', 'Schwergut Stuttgart', 'Konsumgüter Logistik'],
  });
}

export default async function IndustriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <IndustriesHero />

      <Section tone="white" spacing="none">
        <Container>
          <div className="space-y-24 py-20 sm:space-y-32 sm:py-24">
            {INDUSTRY_KEYS.map((key, idx) => (
              <IndustryBlock key={key} industryKey={key} reverse={idx % 2 === 1} />
            ))}
          </div>
        </Container>
      </Section>

      <IndustriesCta />
      <CtaBlock />
    </>
  );
}

function IndustriesHero() {
  const t = useTranslations('IndustriesPage');
  return (
    <PageHero
      eyebrow={t('hero_eyebrow')}
      title={t('hero_title')}
      description={t('hero_subtitle')}
    />
  );
}

function IndustryBlock({
  industryKey,
  reverse,
}: {
  industryKey: IndustryKey;
  reverse: boolean;
}) {
  const t = useTranslations(`IndustriesPage.items.${industryKey}`);
  const tPage = useTranslations('IndustriesPage');
  const bullets = (t.raw('bullets') as ReadonlyArray<string>) ?? [];

  return (
    <article id={industryKey} className="grid scroll-mt-24 items-center gap-12 lg:grid-cols-2 lg:gap-16">
      <div
        className={cn(
          'relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-slate-200',
          '3xl:aspect-[3/2] 4xl:aspect-[16/10]',
          'mx-auto w-full max-w-[720px] 3xl:max-w-[820px]',
          reverse && 'lg:order-2',
        )}
      >
        <Image
          src={INDUSTRY_IMAGES[industryKey]}
          alt={t('alt')}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, (max-width: 1920px) 50vw, 820px"
          className="object-cover"
        />
      </div>

      <div>
        <Badge tone="gold" dot>
          {t('eyebrow')}
        </Badge>
        <h2 className="mt-3 text-display-md text-brand text-balance">{t('title')}</h2>
        <p className="mt-2 text-lg font-medium text-slate-700">{t('subtitle')}</p>
        <p className="mt-4 leading-relaxed text-slate-600">{t('description')}</p>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {tPage('block_offer_label')}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {bullets.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

function IndustriesCta() {
  const t = useTranslations('IndustriesPage');
  return (
    <Section tone="slate" spacing="lg">
      <Container size="md" className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
          {t('cta_eyebrow')}
        </p>
        <h2 className="mt-3 text-display-md text-brand text-balance">{t('cta_title')}</h2>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">{t('cta_description')}</p>
        <div className="mt-8">
          <Button asChild rightIcon={<ArrowRight className="h-4 w-4" />}>
            <Link href="/kontakt">{t('cta_button')}</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}

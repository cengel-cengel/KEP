import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, BarChart3, Check, FileX, Leaf, Network, Truck } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Section, SectionHeader } from '@/components/ui/Section';
import { PageHero } from '@/components/marketing/PageHero';
import { CtaBlock } from '@/components/marketing/CtaBlock';
import { buildLocaleMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'SustainabilityPage' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/nachhaltigkeit',
  });
}

const MEASURE_ICONS = [Leaf, Network, Truck, Network, FileX] as const;

interface Measure {
  title: string;
  text: string;
}

interface Goal {
  value: string;
  label: string;
  hint: string;
}

export default async function SustainabilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <MeasuresSection />
      <GhgSection />
      <GoalsSection />
      <SustainabilityCta />
      <CtaBlock />
    </>
  );
}

function Hero() {
  const t = useTranslations('SustainabilityPage');
  return (
    <PageHero
      eyebrow={t('hero_eyebrow')}
      title={t('hero_title')}
      description={t('hero_subtitle')}
    />
  );
}

function MeasuresSection() {
  const t = useTranslations('SustainabilityPage');
  const measures = (t.raw('measures') as Measure[]) ?? [];

  return (
    <Section tone="white" spacing="lg">
      <Container>
        <SectionHeader
          eyebrow={t('measures_eyebrow')}
          title={t('measures_title')}
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {measures.map((m, idx) => {
            const Icon = MEASURE_ICONS[idx] ?? Leaf;
            return (
              <li
                key={m.title}
                className="rounded-2xl bg-white p-6 ring-1 ring-slate-200"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-brand">{m.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{m.text}</p>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}

function GhgSection() {
  const t = useTranslations('SustainabilityPage');
  const features = (t.raw('ghg_features') as string[]) ?? [];

  return (
    <Section tone="slate" spacing="lg">
      <Container>
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
              {t('ghg_eyebrow')}
            </p>
            <h2 className="mt-3 text-display-md text-balance text-brand">
              {t('ghg_title')}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              {t('ghg_subtitle')}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <ul className="mt-4 space-y-2.5">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
              {t('ghg_status')}
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}

function GoalsSection() {
  const t = useTranslations('SustainabilityPage');
  const goals = (t.raw('goals') as Goal[]) ?? [];

  return (
    <Section tone="white" spacing="lg">
      <Container>
        <SectionHeader
          eyebrow={t('goals_eyebrow')}
          title={t('goals_title')}
          align="center"
          className="mx-auto"
        />
        <dl className="mt-12 grid gap-4 sm:grid-cols-3">
          {goals.map((g) => (
            <div
              key={g.label}
              className="rounded-2xl bg-slate-50 p-6 text-center ring-1 ring-slate-200"
            >
              <dd className="text-display-md font-bold text-brand">{g.value}</dd>
              <dt className="mt-2 font-medium text-brand">{g.label}</dt>
              <p className="mt-1 text-xs text-slate-500">{g.hint}</p>
            </div>
          ))}
        </dl>
      </Container>
    </Section>
  );
}

function SustainabilityCta() {
  const t = useTranslations('SustainabilityPage');
  return (
    <Section tone="slate" spacing="md">
      <Container size="md" className="text-center">
        <h2 className="text-display-md text-brand text-balance">{t('cta_title')}</h2>
        <p className="mt-3 text-lg leading-relaxed text-slate-600">{t('cta_description')}</p>
        <div className="mt-6">
          <Button asChild rightIcon={<ArrowRight className="h-4 w-4" />}>
            <Link href="/kontakt">{t('cta_button')}</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}

import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, CheckCircle2, ClipboardList, Clock, Phone } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Section } from '@/components/ui/Section';
import { ROUTES } from '@/lib/constants';
import { buildLocaleMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ThanksPage' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/kontakt/danke',
    noIndex: true,
  });
}

interface ThanksStep {
  title: string;
  description: string;
}

const STEP_ICONS = [Clock, Phone, ClipboardList];

export default async function ThanksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ThanksContent />;
}

function ThanksContent() {
  const t = useTranslations('ThanksPage');
  const steps = (t.raw('steps') as ReadonlyArray<ThanksStep>) ?? [];

  return (
    <Section tone="white" spacing="xl">
      <Container size="md">
        <div className="text-center">
          <span
            role="img"
            aria-label={t('icon_label')}
            className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gold text-brand ring-8 ring-gold-50"
          >
            <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
          </span>

          <h1 className="mt-8 text-display-md text-balance text-brand">{t('title')}</h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            {t('subtitle')}
          </p>
        </div>

        <div className="mt-16 rounded-2xl bg-slate-50 p-8 ring-1 ring-slate-200 sm:p-10">
          <h2 className="text-base font-semibold uppercase tracking-wider text-gold-700">
            {t('steps_title')}
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {steps.map((step, idx) => {
              const Icon = STEP_ICONS[idx] ?? Clock;
              return (
                <li key={step.title} className="flex flex-col">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {String(idx + 1).padStart(2, '0')}
                  </p>
                  <p className="mt-1 font-semibold text-brand">{step.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {step.description}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
            <Link href={ROUTES.home}>{t('back_home')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={ROUTES.leistungen}>{t('see_services')}</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}

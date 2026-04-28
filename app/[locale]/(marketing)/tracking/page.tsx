import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/Container';
import { Section } from '@/components/ui/Section';
import { PageHero } from '@/components/marketing/PageHero';
import { PublicTrackingClient } from '@/components/tracking/PublicTrackingClient';
import { buildLocaleMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'PublicTracking' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/tracking',
  });
}

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'PublicTracking' });

  return (
    <>
      <PageHero
        eyebrow={t('hero_eyebrow')}
        title={t('hero_title')}
        description={t('hero_subtitle')}
      />
      <Section tone="slate" spacing="lg">
        <Container size="md">
          <Suspense fallback={null}>
            <PublicTrackingClient />
          </Suspense>
          <p className="mt-8 text-center text-xs text-slate-500">{t('stats_text')}</p>
        </Container>
      </Section>
    </>
  );
}

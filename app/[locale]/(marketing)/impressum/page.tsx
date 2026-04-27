import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/ui/Container';
import { Section } from '@/components/ui/Section';
import { PageHero } from '@/components/marketing/PageHero';
import { LegalPageContent, type LegalSection } from '@/components/marketing/LegalPage';
import { formatDateForLocale } from '@/lib/format';
import { buildLocaleMetadata } from '@/lib/seo';

/* TODO: Echte Daten vor Go-Live in messages/{de,en}.json einsetzen
   (siehe [PLATZHALTER]/[PLACEHOLDER] in ImprintPage.sections). */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ImprintPage' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/impressum',
  });
}

export default async function ImprintPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'ImprintPage' });
  const tLegal = await getTranslations({ locale, namespace: 'Legal' });
  const sections = (t.raw('sections') as ReadonlyArray<LegalSection>) ?? [];
  const lastUpdated = formatDateForLocale(new Date(), locale);

  return (
    <>
      <PageHero
        eyebrow={t('hero_eyebrow')}
        title={t('hero_title')}
        description={t('hero_subtitle')}
      />
      <Section tone="white" spacing="lg">
        <Container>
          <LegalPageContent
            tocLabel={tLegal('toc_label')}
            lastUpdatedLabel={tLegal('last_updated_label')}
            lastUpdatedDate={lastUpdated}
            todoNotice={tLegal('todo_notice')}
            sections={sections}
          />
        </Container>
      </Section>
    </>
  );
}

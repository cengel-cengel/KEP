import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Section } from '@/components/ui/Section';
import { ROUTES } from '@/lib/constants';

interface CtaBlockProps {
  /**
   * Optionale Overrides der Texte. Wenn nicht gesetzt,
   * werden Default-Texte aus messages/CtaBlock genutzt.
   */
  eyebrow?: string;
  title?: string;
  description?: string;
  primaryLabel?: string;
}

export function CtaBlock({
  eyebrow,
  title,
  description,
  primaryLabel,
}: CtaBlockProps) {
  const t = useTranslations('CtaBlock');

  const finalEyebrow = eyebrow ?? t('default_eyebrow');
  const finalTitle = title ?? t('default_title');
  const finalDescription = description ?? t('default_description');
  const finalPrimary = primaryLabel ?? t('default_primary');

  return (
    <Section tone="gradient" spacing="lg">
      <Container>
        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              {finalEyebrow}
            </p>
            <h2 className="mt-3 text-display-md text-balance text-white">{finalTitle}</h2>
            <p className="mt-4 text-lg text-brand-100">{finalDescription}</p>
          </div>
          <Button asChild variant="secondary" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
            <Link href={ROUTES.kontakt}>{finalPrimary}</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}

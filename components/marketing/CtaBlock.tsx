import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Section } from '@/components/ui/Section';
import { ROUTES } from '@/lib/constants';

interface CtaBlockProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export function CtaBlock({
  eyebrow = 'Sprechen wir',
  title = 'Bereit fuer Ihre naechste Sendung?',
  description = 'Erhalten Sie binnen 24 Stunden ein massgeschneidertes Angebot - persoenlich und unverbindlich.',
  primaryHref = ROUTES.kontakt,
  primaryLabel = 'Jetzt Angebot anfordern',
  secondaryHref,
  secondaryLabel,
}: CtaBlockProps) {
  return (
    <Section tone="gradient" spacing="lg">
      <Container>
        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            {eyebrow && (
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
                {eyebrow}
              </p>
            )}
            <h2 className="mt-3 text-display-md text-balance text-white">{title}</h2>
            {description && (
              <p className="mt-4 text-lg text-brand-100">{description}</p>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="secondary" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
              <Link href={primaryHref}>{primaryLabel}</Link>
            </Button>
            {secondaryHref && secondaryLabel && (
              <Button
                asChild
                size="lg"
                className="bg-white/10 text-white ring-1 ring-inset ring-white/30 hover:bg-white/20"
              >
                <Link href={secondaryHref}>{secondaryLabel}</Link>
              </Button>
            )}
          </div>
        </div>
      </Container>
    </Section>
  );
}

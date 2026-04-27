import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { ROUTES } from '@/lib/constants';

export function Hero() {
  const t = useTranslations('Hero');

  return (
    <section className="relative isolate overflow-hidden bg-brand text-white">
      <Image
        src="/images/hero.jpg"
        alt=""
        role="presentation"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-70"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-brand-950/90 via-brand-900/70 to-brand-900/40"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-brand-950/80 via-brand-900/30 to-transparent"
      />

      <Container className="relative">
        <div className="grid min-h-[78vh] items-center py-20 sm:py-28 lg:min-h-[80vh] lg:py-32 3xl:min-h-[700px] 3xl:max-h-[900px] 4xl:min-h-[800px]">
          <div className="max-w-2xl 3xl:max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold animate-fade-in">
              {t('eyebrow')}
            </p>
            <h1 className="mt-5 text-display-xl text-balance text-white animate-fade-up">
              {t('title')}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-brand-100 animate-fade-up 3xl:max-w-2xl">
              {t('subtitle')}
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center animate-fade-up">
              <Button asChild variant="secondary" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                <Link href={ROUTES.kontakt}>{t('cta_primary')}</Link>
              </Button>
              <Button
                asChild
                size="lg"
                className="bg-white/10 text-white ring-1 ring-inset ring-white/30 hover:bg-white/20"
              >
                <Link href={ROUTES.leistungen}>{t('cta_secondary')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

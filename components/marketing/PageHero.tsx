import { Container } from '@/components/ui/Container';
import { cn } from '@/lib/utils';

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}

/**
 * Kompakter Hero fuer Unter-Seiten (nicht Landing).
 * Tiefblauer Hintergrund mit dezentem Gitter-Muster.
 */
export function PageHero({ eyebrow, title, description, className }: PageHeroProps) {
  return (
    <section
      className={cn(
        'relative isolate overflow-hidden bg-brand text-white',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-grid-brand [background-size:32px_32px] opacity-40"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-brand to-brand-900"
      />
      <Container className="relative">
        <div className="max-w-3xl py-20 sm:py-24">
          {eyebrow && (
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold animate-fade-in">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-3 text-display-lg text-balance text-white animate-fade-up">
            {title}
          </h1>
          {description && (
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-brand-100 animate-fade-up">
              {description}
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}

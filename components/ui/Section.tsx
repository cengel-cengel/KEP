import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type SectionSpacing = 'none' | 'sm' | 'md' | 'lg' | 'xl';
type SectionTone = 'white' | 'slate' | 'brand' | 'gradient';

interface SectionProps extends HTMLAttributes<HTMLElement> {
  spacing?: SectionSpacing;
  tone?: SectionTone;
}

const SPACING: Record<SectionSpacing, string> = {
  none: '',
  sm: 'py-12 sm:py-16',
  md: 'py-16 sm:py-20',
  lg: 'py-20 sm:py-24',
  xl: 'py-24 sm:py-32',
};

const TONES: Record<SectionTone, string> = {
  white: 'bg-white text-slate-900',
  slate: 'bg-slate-50 text-slate-900',
  brand: 'bg-brand text-white',
  gradient: 'gradient-brand text-white',
};

export function Section({
  spacing = 'lg',
  tone = 'white',
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section className={cn(SPACING[spacing], TONES[tone], className)} {...props}>
      {children}
    </section>
  );
}

interface SectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  invert?: boolean;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'left',
  invert = false,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'max-w-3xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
      {...props}
    >
      {eyebrow && (
        <p
          className={cn(
            'text-sm font-semibold uppercase tracking-wider',
            invert ? 'text-gold' : 'text-gold-600',
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={cn(
          'mt-3 text-display-md text-balance',
          invert ? 'text-white' : 'text-brand',
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            'mt-4 text-lg leading-relaxed',
            invert ? 'text-brand-100' : 'text-slate-600',
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}

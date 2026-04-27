'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePathname, useRouter, type Locale } from '@/i18n/routing';

interface LanguageSwitcherProps {
  variant?: 'desktop' | 'mobile';
  className?: string;
}

const LOCALES: Locale[] = ['de', 'en'];

/**
 * Wechselt die Sprache und behält den aktuellen Pfad bei.
 * next-intl mappt z.B. /ueber-uns -> /en/about automatisch.
 */
export function LanguageSwitcher({ variant = 'desktop', className }: LanguageSwitcherProps) {
  const t = useTranslations('LanguageSwitcher');
  const router = useRouter();
  const pathname = usePathname();
  const current = useLocale() as Locale;
  const [pending, startTransition] = useTransition();

  function switchTo(target: Locale) {
    if (target === current || pending) return;
    startTransition(() => {
      // pathname kann hier ein dynamisches Pattern enthalten (z.B.
      // /portal/sendungen/[id]). Cast auf any unterdrückt nur die
      // Typprüfung - next-intl resolved zur Laufzeit korrekt.
      router.replace(pathname as never, { locale: target });
    });
  }

  return (
    <div
      role="group"
      aria-label={t('label')}
      className={cn(
        'inline-flex items-center gap-1 text-sm',
        variant === 'mobile' && 'w-full justify-between',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex items-center gap-1.5 text-slate-500',
          variant === 'mobile' && 'text-slate-700',
        )}
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        {variant === 'mobile' && (
          <span className="text-xs font-semibold uppercase tracking-wider">
            {t('label')}
          </span>
        )}
      </span>

      <span className="inline-flex items-center gap-1">
        {LOCALES.map((loc, idx) => {
          const isActive = loc === current;
          return (
            <span key={loc} className="inline-flex items-center">
              {idx > 0 && <span aria-hidden="true" className="mx-1 text-slate-300">|</span>}
              <button
                type="button"
                onClick={() => switchTo(loc)}
                aria-current={isActive ? 'true' : undefined}
                aria-label={t(`${loc}_long`)}
                disabled={pending}
                className={cn(
                  'rounded px-1.5 py-0.5 text-sm font-semibold uppercase tracking-wider transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                  isActive
                    ? 'text-gold-700'
                    : 'text-slate-500 hover:text-brand',
                  pending && 'opacity-60',
                )}
              >
                {t(`${loc}_short`)}
              </button>
            </span>
          );
        })}
      </span>
    </div>
  );
}

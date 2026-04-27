import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  current: 1 | 2 | 3 | 4;
  reached: number;
}

export function StepIndicator({ current, reached }: StepIndicatorProps) {
  const t = useTranslations('PortalNewShipment.steps');

  const steps = [1, 2, 3, 4] as const;

  return (
    <ol
      aria-label="Fortschritt"
      className="flex items-center gap-1 overflow-x-auto rounded-xl bg-white p-2 ring-1 ring-slate-200 sm:gap-2"
    >
      {steps.map((n) => {
        const isActive = n === current;
        const isDone = n < current && reached >= n;
        return (
          <li key={n} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition',
                isDone
                  ? 'bg-emerald-500 text-white'
                  : isActive
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 text-slate-500',
              )}
            >
              {isDone ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
            </span>
            <span
              className={cn(
                'hidden truncate text-xs font-medium sm:inline',
                isActive ? 'text-brand' : isDone ? 'text-slate-700' : 'text-slate-500',
              )}
            >
              {t(String(n) as '1' | '2' | '3' | '4')}
            </span>
            {n < 4 && (
              <span
                aria-hidden="true"
                className={cn(
                  'h-px flex-1 sm:mx-2',
                  isDone ? 'bg-emerald-300' : 'bg-slate-200',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

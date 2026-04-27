import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'brand' | 'gold' | 'success' | 'warning';
}

const TONE: Record<NonNullable<KpiCardProps['tone']>, string> = {
  brand: 'bg-brand-50 text-brand',
  gold: 'bg-gold-50 text-gold-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
};

export function KpiCard({ icon: Icon, label, value, hint, tone = 'brand' }: KpiCardProps) {
  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold text-brand">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
            TONE[tone],
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

import { useTranslations } from 'next-intl';
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import type { ShipmentEvent, ShipmentStatus } from '@/types/shipment';

const STEPS: ReadonlyArray<{
  key: 'created' | 'picked_up' | 'in_transit' | 'delivered';
  matches: ReadonlyArray<ShipmentStatus>;
}> = [
  { key: 'created', matches: ['erfasst'] },
  { key: 'picked_up', matches: ['abgeholt'] },
  { key: 'in_transit', matches: ['in_transit'] },
  { key: 'delivered', matches: ['zugestellt'] },
];

export function TrackingTimeline({
  events,
}: {
  events: ReadonlyArray<Pick<ShipmentEvent, 'status' | 'at' | 'location'>>;
}) {
  const tSteps = useTranslations('PortalShipmentDetail.tracking_steps');
  const tDetail = useTranslations('PortalShipmentDetail');

  const reached = new Set<(typeof STEPS)[number]['key']>();
  for (const e of events) {
    if (e.status === 'erfasst') reached.add('created');
    if (e.status === 'abgeholt') reached.add('picked_up');
    if (e.status === 'in_transit') reached.add('in_transit');
    if (e.status === 'zugestellt') reached.add('delivered');
  }
  const firstPending = STEPS.findIndex((s) => !reached.has(s.key));
  const currentIdx = firstPending === -1 ? STEPS.length - 1 : firstPending;

  return (
    <ol className="relative space-y-5 pl-8">
      <span aria-hidden="true" className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />
      {STEPS.map((step, idx) => {
        const isReached = reached.has(step.key);
        const isCurrent = !isReached && idx === currentIdx;
        const evt = events.find((e) => step.matches.includes(e.status));
        return (
          <li key={step.key} className="relative">
            <span
              aria-hidden="true"
              className={cn(
                'absolute -left-8 top-0 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white',
                isReached
                  ? 'bg-emerald-500 text-white'
                  : isCurrent
                    ? 'bg-accent text-white animate-pulse'
                    : 'bg-slate-200 text-slate-400',
              )}
            >
              {isReached ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2" fill="currentColor" />}
            </span>
            <p
              className={cn(
                'text-sm font-semibold',
                isReached ? 'text-brand' : isCurrent ? 'text-accent' : 'text-slate-500',
              )}
            >
              {tSteps(step.key)}
            </p>
            {isReached && evt ? (
              <p className="mt-0.5 text-xs text-slate-500">
                {formatDateTime(evt.at)}
                {evt.location ? ` · ${evt.location}` : ''}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-400">{tDetail('tracking_pending')}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

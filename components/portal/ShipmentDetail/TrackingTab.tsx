import { useTranslations } from 'next-intl';
import { Check, Circle, Loader } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import type { Shipment, ShipmentStatus } from '@/types/shipment';

const TIMELINE_STEPS: ReadonlyArray<{
  key: 'created' | 'confirmed' | 'scheduled' | 'picked_up' | 'in_hub' | 'in_transit' | 'delivered';
  /** Statuswerte aus events, die diesen Schritt befuellen */
  matches: ReadonlyArray<ShipmentStatus>;
}> = [
  { key: 'created', matches: ['erfasst'] },
  { key: 'confirmed', matches: ['erfasst'] },
  { key: 'scheduled', matches: ['erfasst'] },
  { key: 'picked_up', matches: ['abgeholt'] },
  { key: 'in_hub', matches: ['in_transit'] },
  { key: 'in_transit', matches: ['in_transit'] },
  { key: 'delivered', matches: ['zugestellt'] },
];

export function TrackingTab({ shipment }: { shipment: Shipment }) {
  const t = useTranslations('PortalShipmentDetail');
  const tSteps = useTranslations('PortalShipmentDetail.tracking_steps');

  // Klärung / Storniert separat behandeln
  const issueEvent = shipment.events.find(
    (e) => e.status === 'klaerung' || e.status === 'storniert',
  );

  // Aktiver Schritt ist der erste nicht-erledigte
  const reachedKeys = new Set<(typeof TIMELINE_STEPS)[number]['key']>();
  for (const event of shipment.events) {
    if (event.status === 'erfasst') {
      reachedKeys.add('created');
      reachedKeys.add('confirmed');
      reachedKeys.add('scheduled');
    }
    if (event.status === 'abgeholt') reachedKeys.add('picked_up');
    if (event.status === 'in_transit') {
      reachedKeys.add('in_hub');
      reachedKeys.add('in_transit');
    }
    if (event.status === 'zugestellt') reachedKeys.add('delivered');
  }

  const firstPendingIdx = TIMELINE_STEPS.findIndex((step) => !reachedKeys.has(step.key));
  const currentIdx = firstPendingIdx === -1 ? TIMELINE_STEPS.length - 1 : firstPendingIdx;

  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8">
      {issueEvent && (
        <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">{tSteps(issueEvent.status === 'klaerung' ? 'issue' : 'cancelled')}</p>
          {issueEvent.note && <p className="mt-1 text-amber-900/80">{issueEvent.note}</p>}
          <p className="mt-1 text-xs text-amber-900/70">{formatDateTime(issueEvent.at)}</p>
        </div>
      )}

      <ol className="relative space-y-6 pl-8">
        <span
          aria-hidden="true"
          className="absolute left-3 top-2 bottom-2 w-px bg-slate-200"
        />
        {TIMELINE_STEPS.map((step, idx) => {
          const reached = reachedKeys.has(step.key);
          const isCurrent = !reached && idx === currentIdx;
          // Versuche, das passende Event-Datum zu zeigen
          const matchingEvent = shipment.events.find((e) => step.matches.includes(e.status));

          return (
            <li key={step.key} className="relative">
              <span
                className={cn(
                  'absolute -left-8 top-0 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white',
                  reached
                    ? 'bg-emerald-500 text-white'
                    : isCurrent
                    ? 'bg-accent text-white animate-pulse'
                    : 'bg-slate-200 text-slate-400',
                )}
                aria-hidden="true"
              >
                {reached ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isCurrent ? (
                  <Loader className="h-3.5 w-3.5" />
                ) : (
                  <Circle className="h-2 w-2" fill="currentColor" />
                )}
              </span>

              <div>
                <p
                  className={cn(
                    'text-sm font-semibold',
                    reached
                      ? 'text-brand'
                      : isCurrent
                      ? 'text-accent'
                      : 'text-slate-500',
                  )}
                >
                  {tSteps(step.key)}
                </p>
                {reached && matchingEvent ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(matchingEvent.at)}
                    {matchingEvent.location && ` · ${matchingEvent.location}`}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-400">{t('tracking_pending')}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

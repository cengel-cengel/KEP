'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Info,
  Mail,
  MapPin,
  Package,
  Search,
  Share2,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ShipmentStatusBadge } from '@/components/portal/ShipmentStatusBadge';
import { TrackingTimeline } from './TrackingTimeline';
import { TrackingShareModal } from './TrackingShareModal';
import { formatDate, formatWeight } from '@/lib/format';
import type { PublicTrackingData } from '@/lib/tracking';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; data: PublicTrackingData }
  | { kind: 'not_found' }
  | { kind: 'rate_limited' }
  | { kind: 'error' };

export function PublicTrackingClient() {
  const t = useTranslations('PublicTracking');
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialReference = searchParams.get('nr') ?? '';

  const [reference, setReference] = useState(initialReference);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [shareOpen, setShareOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Bei Mount: wenn ?nr= in URL, automatisch suchen
  useEffect(() => {
    if (initialReference) void doSearch(initialReference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSearch(ref: string) {
    if (!ref.trim()) return;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/tracking?reference=${encodeURIComponent(ref.trim())}`);
      if (res.status === 429) {
        setState({ kind: 'rate_limited' });
        return;
      }
      if (res.status === 404) {
        setState({ kind: 'not_found' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error' });
        return;
      }
      const data = (await res.json()) as { success: boolean; tracking?: PublicTrackingData };
      if (!data.success || !data.tracking) {
        setState({ kind: 'not_found' });
        return;
      }
      setState({ kind: 'success', data: data.tracking });

      // URL-Sync (für Sharing)
      const sp = new URLSearchParams();
      sp.set('nr', ref.trim());
      router.replace(`?${sp.toString()}`, { scroll: false });
    } catch {
      setState({ kind: 'error' });
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void doSearch(reference);
        }}
        className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t('search_placeholder')}
            leftSlot={<Search className="h-4 w-4" aria-hidden="true" />}
            aria-label={t('search_placeholder')}
            className="flex-1"
          />
          <Button
            type="submit"
            size="lg"
            loading={state.kind === 'loading'}
            rightIcon={state.kind === 'loading' ? undefined : <ArrowRight className="h-4 w-4" />}
          >
            {state.kind === 'loading' ? t('searching') : t('search_button')}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {t('help_label')}
        </button>
        {showHelp && (
          <p className="mt-2 max-w-3xl rounded-md bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
            {t('help_text')}
          </p>
        )}
      </form>

      <div aria-live="polite" className="mt-6">
        {state.kind === 'rate_limited' && (
          <Banner tone="warning">{t('rate_limited')}</Banner>
        )}
        {state.kind === 'error' && <Banner tone="error">{t('rate_limited')}</Banner>}
        {state.kind === 'not_found' && <NotFoundBlock t={t} />}
        {state.kind === 'success' && (
          <ResultBlock data={state.data} onShare={() => setShareOpen(true)} />
        )}
      </div>

      <TrackingShareModal
        open={shareOpen}
        url={typeof window !== 'undefined' ? window.location.href : ''}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

function NotFoundBlock({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
      <Package className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold text-brand">{t('not_found_title')}</h2>
      <p className="mt-2 mx-auto max-w-md text-sm text-slate-600">{t('not_found_text')}</p>
      <div className="mt-5">
        <Button asChild variant="outline" size="sm" leftIcon={<Mail className="h-4 w-4" />}>
          <Link href="/kontakt">{t('not_found_cta')}</Link>
        </Button>
      </div>
    </div>
  );
}

function ResultBlock({
  data,
  onShare,
}: {
  data: PublicTrackingData;
  onShare: () => void;
}) {
  const t = useTranslations('PublicTracking');
  const tService = useTranslations('PortalCommon.service_type');

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-sm text-slate-500">{data.trackingNumber}</p>
            <div className="mt-1 flex items-center gap-2">
              <ShipmentStatusBadge status={data.status} />
              <Badge tone="neutral">{tService(data.serviceType)}</Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onShare} leftIcon={<Share2 className="h-4 w-4" />}>
            {t('actions_share')}
          </Button>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('result_route')}>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
              {data.fromCity}, {data.fromCountry} → {data.toCity}, {data.toCountry}
            </span>
          </Field>
          <Field label={t('result_pickup')}>{formatDate(data.pickupDate)}</Field>
          <Field label={t('result_packages')}>{data.packageCount}</Field>
          <Field label={t('result_weight')}>{formatWeight(data.totalWeightKg)}</Field>
        </dl>

        {data.deliveredTo && (
          <div className="mt-6 rounded-lg bg-emerald-50 p-3 text-sm ring-1 ring-emerald-200">
            <p className="font-medium text-emerald-900">
              {t('result_delivered_label')}: {data.deliveredTo}
            </p>
            <p className="mt-0.5 text-xs text-emerald-900/80">{t('result_signature')}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8">
        <TrackingTimeline events={data.events} />
      </div>

      <p className="text-xs text-slate-500">{t('privacy_note')}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-700">{children}</dd>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'warning' | 'error'; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className={
        tone === 'error'
          ? 'flex items-start gap-2.5 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100'
          : 'flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200'
      }
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

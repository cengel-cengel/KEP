'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, MapPin } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Input } from '@/components/ui/Input';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';

interface TransitResult {
  transitDays: { min: number; max: number };
  cutoffTime: string;
  frequency: string;
  zone: string;
  notes: string[];
}

const COUNTRIES = ['DE', 'AT', 'CH', 'FR', 'IT', 'NL', 'BE', 'LU', 'PL', 'GB'] as const;

export function TransitCalculator() {
  const t = useTranslations('TransitCalculator');
  const tNotes = useTranslations('TransitCalculator.notes');

  const [fromCountry, setFromCountry] = useState('DE');
  const [fromZip, setFromZip] = useState('70173');
  const [toCountry, setToCountry] = useState('GB');
  const [toZip, setToZip] = useState('E1');
  const [type, setType] = useState<'sammelgut' | 'direkt' | 'uk'>('sammelgut');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function calculate() {
    if (!fromZip.trim()) {
      setError(t('errors.from_zip_required'));
      return;
    }
    if (!toZip.trim()) {
      setError(t('errors.to_zip_required'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        fromCountry,
        fromZip: fromZip.trim(),
        toCountry,
        toZip: toZip.trim(),
        type,
      });
      const res = await fetch(`/api/transit-time?${sp.toString()}`);
      if (!res.ok) {
        setError(t('errors.network_error'));
        return;
      }
      const data = (await res.json()) as { success: boolean } & TransitResult;
      setResult({
        transitDays: data.transitDays,
        cutoffTime: data.cutoffTime,
        frequency: data.frequency,
        zone: data.zone,
        notes: data.notes,
      });
    } catch {
      setError(t('errors.network_error'));
    } finally {
      setLoading(false);
    }
  }

  const countryOptions = COUNTRIES.map((c) => ({ value: c, label: c }));

  return (
    <Section tone="white" spacing="lg" id="transit" className="scroll-mt-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
            {t('eyebrow')}
          </p>
          <h2 className="mt-3 text-display-md text-balance text-brand">{t('title')}</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{t('subtitle')}</p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('from_label')}
            </h3>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Select
                aria-label={t('country_label')}
                options={countryOptions}
                value={fromCountry}
                onChange={(e) => setFromCountry(e.target.value)}
              />
              <Input
                aria-label={t('zip_label')}
                value={fromZip}
                onChange={(e) => setFromZip(e.target.value)}
                placeholder="70173"
                className="col-span-2"
              />
            </div>

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('to_label')}
            </h3>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Select
                aria-label={t('country_label')}
                options={countryOptions}
                value={toCountry}
                onChange={(e) => setToCountry(e.target.value)}
              />
              <Input
                aria-label={t('zip_label')}
                value={toZip}
                onChange={(e) => setToZip(e.target.value)}
                placeholder="E1"
                className="col-span-2"
              />
            </div>

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('service_label')}
            </h3>
            <Select
              className="mt-3"
              aria-label={t('service_label')}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              options={[
                { value: 'sammelgut', label: t('service_sammelgut') },
                { value: 'direkt', label: t('service_direkt') },
                { value: 'uk', label: t('service_uk') },
              ]}
            />

            {error && (
              <p role="alert" className="mt-3 text-xs text-red-600">
                {error}
              </p>
            )}

            <Button
              className="mt-6 w-full"
              size="lg"
              onClick={calculate}
              loading={loading}
              rightIcon={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}
            >
              {loading ? t('calculating') : t('calculate')}
            </Button>
          </div>

          <div className="rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-200">
            {result ? (
              <ResultPanel
                result={result}
                fromCountry={fromCountry}
                fromZip={fromZip}
                toCountry={toCountry}
                toZip={toZip}
                tNotes={tNotes}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-500">
                <MapPin className="h-8 w-8 text-slate-300" aria-hidden="true" />
                <p className="mt-3">{t('subtitle')}</p>
              </div>
            )}
          </div>
        </div>
      </Container>
    </Section>
  );
}

function ResultPanel({
  result,
  fromCountry,
  fromZip,
  toCountry,
  toZip,
  tNotes,
}: {
  result: TransitResult;
  fromCountry: string;
  fromZip: string;
  toCountry: string;
  toZip: string;
  tNotes: ReturnType<typeof useTranslations>;
}) {
  const t = useTranslations('TransitCalculator');
  const transitText =
    result.transitDays.min === result.transitDays.max
      ? t('result_transit_days_other', { count: result.transitDays.min })
      : t('result_transit_range', {
          min: result.transitDays.min,
          max: result.transitDays.max,
        });

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wider text-gold-700">
        {t('result_title')}
      </p>
      <p className="mt-2 inline-flex items-center gap-1.5 text-base text-brand">
        <MapPin className="h-4 w-4 text-gold" aria-hidden="true" />
        {fromCountry} {fromZip} → {toCountry} {toZip}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('result_transit_label')}
          </dt>
          <dd className="mt-1 text-2xl font-bold text-brand">{transitText}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('result_cutoff')}
          </dt>
          <dd className="mt-1 text-sm text-slate-700">{result.cutoffTime}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('result_frequency')}
          </dt>
          <dd className="mt-1 text-sm text-slate-700">{result.frequency}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-slate-500">
        <span className="font-medium text-slate-600">{t('result_zone')}: </span>
        {result.zone}
      </p>

      <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
        {result.notes.map((noteKey) => (
          <li key={noteKey} className="flex items-start gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
            {tNotes(noteKey as 'note_daily_lines')}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <Button asChild rightIcon={<ArrowRight className="h-4 w-4" />}>
          <Link href="/kontakt">{t('result_cta')}</Link>
        </Button>
      </div>
    </div>
  );
}

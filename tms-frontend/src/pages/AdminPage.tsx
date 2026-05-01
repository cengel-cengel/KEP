import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Play } from 'lucide-react';
import Navigation from '../components/Navigation';
import { api } from '../lib/api';

interface BackfillStatus {
  running: boolean;
  processed: number;
  total: number;
  errors: number;
  lastRun: string | null;
  lastError: string | null;
  pending: number;
}

const BATCH_SIZE = 100;

export default function AdminPage() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<BackfillStatus>({
    queryKey: ['admin', 'backfill-coords-status'],
    queryFn: async () => {
      const { data } = await api.get<BackfillStatus>(
        '/admin/backfill-coordinates/status',
      );
      return data;
    },
    refetchInterval: (q) => {
      const s = q.state.data as BackfillStatus | undefined;
      // Poll wenn running ODER noch pending
      if (s && (s.running || s.pending > 0)) return 5000;
      return false;
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        jobStarted: boolean;
        addressesToProcess: number;
        estimatedDurationMinutes: number;
      }>('/admin/backfill-coordinates', { batchSize: BATCH_SIZE });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'backfill-coords-status'] });
    },
  });

  const running = !!status?.running;
  const total = status?.total ?? 0;
  const processed = status?.processed ?? 0;
  const errors = status?.errors ?? 0;
  const pending = status?.pending ?? 0;
  const lastRun = status?.lastRun ? new Date(status.lastRun).toLocaleString('de-DE') : '–';
  const progressPct = total > 0 ? Math.round((processed / total) * 100) : 0;

  const errorMsg =
    (startMutation.error as { response?: { status?: number; data?: { message?: string } } } | undefined)
      ?.response?.data?.message ??
    (startMutation.error ? 'Start fehlgeschlagen.' : null);

  return (
    <>
      <Navigation />
      <main className="w-full flex-1 px-4 sm:px-6 py-4 bg-white">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/masterdata" className="text-gray-500 hover:text-gray-800">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Wartung &amp; Admin</h1>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={18} className="text-[#1e40af]" />
            <h2 className="text-lg font-medium text-gray-900">Geocoding-Backfill</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Lädt Adress-Koordinaten von OpenStreetMap und speichert sie in der DB.
            Pro Batch werden bis zu {BATCH_SIZE} Adressen geocodiert (~1.8 Min Laufzeit).
            Bei vielen offenen Adressen mehrfach starten.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Offen (pending)" value={isLoading ? '…' : String(pending)} highlight={pending > 0} />
            <Stat label="Letzter Batch" value={total === 0 ? '–' : `${processed} / ${total}`} />
            <Stat label="Fehler" value={String(errors)} highlight={errors > 0} />
            <Stat label="Letzter Run" value={lastRun} />
          </div>

          {running && total > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>Läuft… {progressPct}%</span>
                <span>{processed} / {total}</span>
              </div>
              <div className="h-2 w-full rounded bg-gray-200 overflow-hidden">
                <div
                  className="h-full bg-[#1e40af] transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {status?.lastError && !running && (
            <div className="mb-4 rounded bg-red-50 text-red-700 px-3 py-2 text-xs border border-red-200">
              Letzter Job-Fehler: {status.lastError}
            </div>
          )}
          {errorMsg && (
            <div className="mb-4 rounded bg-red-50 text-red-700 px-3 py-2 text-xs border border-red-200">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            disabled={running || startMutation.isPending}
            onClick={() => startMutation.mutate()}
            className={
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors ' +
              (running || startMutation.isPending
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-[#1e40af] hover:bg-[#1e3a8a]') +
              (running ? ' animate-pulse' : '')
            }
          >
            <Play size={16} />
            {running
              ? 'Geocoding läuft…'
              : startMutation.isPending
              ? 'Starte…'
              : pending === 0
              ? 'Alle Adressen geocodiert'
              : `Geocoding starten (Batch ${BATCH_SIZE})`}
          </button>
        </section>
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={'text-lg font-semibold ' + (highlight ? 'text-[#1e40af]' : 'text-gray-900')}>
        {value}
      </div>
    </div>
  );
}

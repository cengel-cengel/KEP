/**
 * R3-D: Admin-Tool für Charter-Umschlag-Konsolidierung.
 *
 * Workflow:
 *   1. Mensch gibt Shipment-ID ein
 *   2. GET /admin/consolidate-preview/:id → action + candidates
 *      (Top-N matches mit Score + eligible + blocker)
 *   3. "Konsolidieren"-Button → POST /admin/consolidate-shipment/:id
 *      (synchroner Aufruf, returns echtes action-Ergebnis)
 *
 * Use-Cases:
 *   - Manual Re-Trigger wenn Auto-Hook nicht gefeuert hat
 *   - Audit / Dry-Run vor Auto-Bulk-Job
 *   - Debug welche FV-Tour gematcht würde + warum andere blockiert
 *     sind (status_dispatched, hazmat_no_adr, tour_not_planned)
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface PreviewCandidate {
  tour_id: string;
  tour_number?: string | null;
  score: number;
  eligible: boolean;
  blocker?: string;
}

interface PreviewResult {
  action: 'consolidated' | 'created' | 'skipped';
  tourId?: string;
  reason?: string;
  candidates?: PreviewCandidate[];
}

interface ConsolidateResult {
  action: 'consolidated' | 'created' | 'skipped';
  tourId?: string;
  reason?: string;
}

export default function CharterPreviewPage() {
  const [input, setInput] = useState('');
  const [queriedId, setQueriedId] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<ConsolidateResult | null>(null);

  const previewQ = useQuery<PreviewResult>({
    queryKey: ['admin-consolidate-preview', queriedId],
    queryFn: async () => {
      if (!queriedId) throw new Error('no id');
      const { data } = await api.get<PreviewResult>(
        `/admin/consolidate-preview/${queriedId}`,
      );
      return data;
    },
    enabled: !!queriedId,
    staleTime: 5_000,
  });

  const triggerMut = useMutation({
    mutationFn: async (shipmentId: string) => {
      const { data } = await api.post<ConsolidateResult>(
        `/admin/consolidate-shipment/${shipmentId}`,
        {},
      );
      return data;
    },
    onSuccess: (data) => {
      setTrigger(data);
      // Re-fetch preview to show post-consolidate state.
      if (queriedId) previewQ.refetch();
    },
  });

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">
        Charter-Umschlag · Konsolidierung
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Dry-Run-Preview welche FV-Tour eine Sendung via{' '}
        <code className="font-mono text-xs">consolidateOrCreateFvTour</code>{' '}
        bekommen würde. Manual Re-Trigger möglich, idempotent.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = input.trim();
          if (!trimmed) return;
          setTrigger(null);
          setQueriedId(trimmed);
        }}
        className="flex items-center gap-2 mb-4"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Shipment-ID (UUID)"
          className="border rounded px-3 py-1.5 text-sm font-mono flex-1"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white text-sm rounded px-3 py-1.5 hover:bg-blue-700"
        >
          Preview
        </button>
      </form>

      {previewQ.isLoading && (
        <div className="text-sm text-gray-500">Lade Preview…</div>
      )}
      {previewQ.isError && (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded p-3">
          Fehler: {(previewQ.error as Error)?.message ?? 'Unbekannt'}
        </div>
      )}

      {previewQ.data && (
        <div className="space-y-4">
          {/* Preview-Ergebnis */}
          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Preview-Ergebnis</h2>
              <ActionBadge action={previewQ.data.action} />
            </div>
            <dl className="text-xs grid grid-cols-2 gap-y-1">
              <dt className="text-gray-500">Action</dt>
              <dd className="font-mono">{previewQ.data.action}</dd>
              {previewQ.data.tourId && (
                <>
                  <dt className="text-gray-500">Target-Tour</dt>
                  <dd className="font-mono">{previewQ.data.tourId}</dd>
                </>
              )}
              {previewQ.data.reason && (
                <>
                  <dt className="text-gray-500">Reason</dt>
                  <dd className="font-mono">{previewQ.data.reason}</dd>
                </>
              )}
            </dl>
          </section>

          {/* Candidates */}
          {previewQ.data.candidates && previewQ.data.candidates.length > 0 && (
            <section className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold mb-2">
                Match-Candidates ({previewQ.data.candidates.length})
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-1">Tour</th>
                    <th className="py-1 w-16 text-right">Score</th>
                    <th className="py-1 w-24">Eligible</th>
                    <th className="py-1">Blocker</th>
                  </tr>
                </thead>
                <tbody>
                  {previewQ.data.candidates.map((c) => (
                    <tr
                      key={c.tour_id}
                      className={`border-b last:border-b-0 ${
                        c.eligible ? '' : 'opacity-60'
                      }`}
                    >
                      <td className="py-1 font-mono">
                        {c.tour_number ?? c.tour_id.slice(0, 8)}
                      </td>
                      <td className="py-1 text-right font-mono">
                        {c.score.toFixed(0)}
                      </td>
                      <td className="py-1">
                        {c.eligible ? (
                          <span className="text-emerald-700">✓ ja</span>
                        ) : (
                          <span className="text-red-700">✗ nein</span>
                        )}
                      </td>
                      <td className="py-1 text-xs text-gray-600 font-mono">
                        {c.blocker ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Konsolidieren-Action */}
          {previewQ.data.action !== 'skipped' && queriedId && (
            <section className="rounded-lg border bg-amber-50 border-amber-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-semibold mb-1">
                    Konsolidierung jetzt durchführen?
                  </div>
                  <div className="text-xs text-gray-600">
                    Schreibt tour_id auf die Sendung + recordHauptlaufCost
                    + optional Auto-Dispatch wenn voll. Idempotent.
                  </div>
                </div>
                <button
                  onClick={() => triggerMut.mutate(queriedId)}
                  disabled={triggerMut.isPending}
                  className="bg-amber-600 text-white text-sm rounded px-4 py-2 hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {triggerMut.isPending ? 'Läuft…' : 'Konsolidieren'}
                </button>
              </div>
            </section>
          )}

          {/* Trigger-Ergebnis */}
          {trigger && (
            <section className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold">Trigger-Ergebnis</h2>
                <ActionBadge action={trigger.action} />
              </div>
              <dl className="text-xs grid grid-cols-2 gap-y-1">
                <dt className="text-gray-500">Action</dt>
                <dd className="font-mono">{trigger.action}</dd>
                {trigger.tourId && (
                  <>
                    <dt className="text-gray-500">Tour-ID</dt>
                    <dd className="font-mono">{trigger.tourId}</dd>
                  </>
                )}
                {trigger.reason && (
                  <>
                    <dt className="text-gray-500">Reason</dt>
                    <dd className="font-mono">{trigger.reason}</dd>
                  </>
                )}
              </dl>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const color =
    action === 'consolidated'
      ? 'bg-emerald-100 text-emerald-700'
      : action === 'created'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`text-[10px] uppercase rounded px-2 py-0.5 font-medium ${color}`}
    >
      {action}
    </span>
  );
}

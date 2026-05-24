/**
 * F2.2.a NvSwapOptimizerModal — Read-Only Vorschau.
 *
 * Faedet F2.0 (BE-Daten) + F2.1 (Optimizer-Algorithmus) ins UI:
 *   Source-Tour-Daten via useQuery(['nv-loading', tourId])
 *   → Adapter NvLoadingDetail → SwapShipment[]
 *   → maxLdm via resolveVehicleCapacity (F1.a-Fix-Cascade)
 *   → isFixSendung-Split
 *   → findSwapPlan
 *
 * KEIN Execute, KEINE batch-stops, KEINE Mutations — kommt in F2.2.b.
 * Modal ist rein read-only Vorschau; Disponent kann Plan abnicken
 * oder schliessen.
 */
import { useMemo, useState } from 'react';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowRight, Loader2, Sparkles, X } from 'lucide-react';
import { api } from '../../lib/api';
import { resolveVehicleCapacity } from '../../lib/vehicleTypes';
import {
  findSwapPlan,
  isFixSendung,
  subsetVolumeM3,
  subsetWeightKg,
  type SwapShipment,
} from '../../lib/nvSwapOptimizer';
import {
  countRunning,
  execSummary,
  formatDatumShort,
  targetLabel,
  type BestTourMatch,
  type EjectExecutionStatus,
} from '../../lib/swapShared';
import {
  CapacityBar,
  ExecStatusIcon,
} from '../shared/SwapModalBits';
import type { NvLoadingDetail } from '../../pages/NvLoadingPlanPage';

interface Props {
  sourceTourId: string;
  onClose: () => void;
}

/**
 * Adapter: ein NV-Tour-Stop wird zu einer Optimizer-SwapShipment.
 * O-1: volumeM3 + weightKg sind die Optimizer-Metriken. Beide
 * werden aus den package_items aggregiert (Σ ueber l×w×h×qty
 * bzw. weight_kg×qty), damit der Optimizer mit derselben Quelle
 * arbeitet wie die NvLoadingPlanPage-Anzeige (flattenPackages →
 * Plan3DPackage[] → Σ packages.weightKg / packages.lengthCm×…).
 *
 * O-1-Fix: vorher las weightKg den shipment.weight_kg-Aggregat —
 * der kann von Σ(package_items.weight_kg×quantity) divergieren
 * (uneinheitliche Stammdaten-Pflege) und fuehrte zu Optimizer-
 * Plaenen, die im Beladeplan-Display anders aussahen als der
 * Tausch erwarten liess.
 *
 * ldm/isStackable als Pass-Through fuer UI-Eject-Liste.
 */
function stopToSwapShipment(
  stop: NvLoadingDetail['stops'][number],
): SwapShipment {
  const items = stop.shipment.shipment_package_items ?? [];
  const allStackable =
    items.length > 0 && items.every((it) => it.stackable !== false);
  // Volumen + Gewicht pro Sendung: package_items × quantity. EINE
  // Quelle der Wahrheit, identisch zur Anzeige.
  let volCm3 = 0;
  let weightKg = 0;
  for (const it of items) {
    const qty = Math.max(1, Number(it.quantity ?? 1));
    volCm3 +=
      Number(it.length_cm || 0) *
      Number(it.width_cm || 0) *
      Number(it.height_cm || 0) *
      qty;
    weightKg += Number(it.weight_kg || 0) * qty;
  }
  return {
    id: stop.shipment.id,
    volumeM3: volCm3 / 1e6,
    weightKg,
    ldm: stop.shipment.ldm != null ? Number(stop.shipment.ldm) : null,
    isStackable: allStackable,
    is_stamm_kunde: stop.is_stamm_kunde === true,
    loading_date: stop.shipment.loading_date ?? null,
    status: stop.shipment.status ?? null,
    has_active_lock: stop.shipment.has_active_lock === true,
    is_hazmat: stop.shipment.is_hazmat === true,
    customer_priority_tier:
      stop.shipment.customers?.priority_tier ?? null,
  };
}

/**
 * Build-Up der FIX-Grund-Etiketten fuer die UI ("Stamm-Kunde",
 * "ueberfaellig", …). Verwendet die gleichen Regeln wie
 * isFixSendung — Reihenfolge entspricht der Prioritaet.
 */
function fixReason(s: SwapShipment): string | null {
  if (s.is_stamm_kunde) return 'Stamm-Kunde';
  // overdue-Check muessen wir reproducieren — isFixSendung gibt
  // nur bool. Hier nur das Label.
  if (s.loading_date && s.status === 'new') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(s.loading_date);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      if (d.getTime() < today.getTime()) return 'überfällig';
    }
  }
  if (s.has_active_lock) return 'gesperrt';
  if (s.is_hazmat) return 'Hazmat';
  return null;
}

export default function NvSwapOptimizerModal({
  sourceTourId,
  onClose,
}: Props) {
  const tourQ = useQuery<NvLoadingDetail | null>({
    queryKey: ['nv-loading', sourceTourId],
    queryFn: async () => {
      const { data } = await api.get<NvLoadingDetail>(
        `/nv-touren/${sourceTourId}/loading`,
      );
      return data;
    },
    enabled: !!sourceTourId,
    staleTime: 10_000,
  });

  const capacity = useMemo(() => {
    const t = tourQ.data;
    return resolveVehicleCapacity(
      t ? { fahrzeug_typ: t.fahrzeug_typ ?? null } : null,
      t?.subunternehmer ?? null,
    );
  }, [tourQ.data]);

  // O-1: Trailer-Vol aus capacity-Box (siehe F1.a-Fix-2).
  const maxVolM3 = useMemo(
    () => (capacity.lengthCm * capacity.widthCm * capacity.heightCm) / 1e6,
    [capacity.lengthCm, capacity.widthCm, capacity.heightCm],
  );
  const maxWeightKg = capacity.maxWeightKg;

  const {
    fixShipments,
    swappableShipments,
    plan,
    volCurrent,
    weightCurrent,
  } = useMemo(() => {
    const stops = tourQ.data?.stops ?? [];
    const all = stops.map(stopToSwapShipment);
    const fix: SwapShipment[] = [];
    const swap: SwapShipment[] = [];
    for (const s of all) {
      if (isFixSendung(s)) fix.push(s);
      else swap.push(s);
    }
    const volNow = subsetVolumeM3(all);
    const weightNow = subsetWeightKg(all);
    const swapPlan = findSwapPlan({
      fixShipments: fix,
      swappableShipments: swap,
      maxVolM3,
      maxWeightKg,
    });
    return {
      fixShipments: fix,
      swappableShipments: swap,
      plan: swapPlan,
      volCurrent: volNow,
      weightCurrent: weightNow,
    };
  }, [tourQ.data?.stops, maxVolM3, maxWeightKg]);

  // F2.2.b-1: Pro ejectId Best-Match parallel laden (B1-Endpoint).
  // queryKey teilt Cache mit ShipmentDetailsTab/MoveStopDialog —
  // gleicher staleTime 30s. Cache-Hit wenn Sendung bereits anderswo
  // im Workspace inspiziert wurde.
  // F2.2.b-1.5: exclude_tour_id=sourceTourId verhindert dass die
  // Source-Tour als Kandidat zurueckkommt — eigener Cache-Key
  // (tour-id im queryKey) damit Default-Flow getrennt bleibt.
  const ejectIds = plan?.ejectIds ?? [];
  const bestMatchQueries = useQueries({
    queries: ejectIds.map((shipmentId) => ({
      queryKey: ['shipment-best-match', shipmentId, sourceTourId],
      queryFn: async () =>
        (
          await api.get<BestTourMatch[]>('/tours/best-match', {
            params: {
              shipment_id: shipmentId,
              exclude_tour_id: sourceTourId,
            },
          })
        ).data,
      staleTime: 30_000,
    })),
  });

  // Map ejectId → { target?: BestTourMatch, isLoading: boolean }.
  // Erste passende NV-Tour die NICHT die Source-Tour ist.
  const targetByShipment = useMemo(() => {
    const map = new Map<
      string,
      { target: BestTourMatch | null; isLoading: boolean }
    >();
    ejectIds.forEach((id, idx) => {
      const q = bestMatchQueries[idx];
      const matches = q?.data ?? [];
      const target =
        matches.find((m) => m.mode === 'nv' && m.tour_id !== sourceTourId) ??
        null;
      map.set(id, { target, isLoading: q?.isLoading ?? false });
    });
    return map;
  }, [ejectIds, bestMatchQueries, sourceTourId]);

  // F2.2.b-2: shipmentId → stopId Map fuer Source-Remove. Atomarer
  // Swap-Endpoint existiert NICHT, deshalb 2 sequenzielle batch-stops
  // (Source-removes via stopId, Target-adds via shipmentId).
  const stopIdByShipment = useMemo(() => {
    const m = new Map<string, string>();
    for (const stop of tourQ.data?.stops ?? []) {
      m.set(stop.shipment.id, stop.id);
    }
    return m;
  }, [tourQ.data?.stops]);

  // F2.2.b-2: Per-Eject-Status-Map fuer UI-Feedback. Idle bis User
  // klickt; danach pro Schritt fortschreibend.
  const [execStatus, setExecStatus] = useState<
    Map<string, EjectExecutionStatus>
  >(new Map());
  const [confirmStep, setConfirmStep] = useState<
    'idle' | 'confirm' | 'running' | 'done'
  >('idle');

  // Wie viele Ejects haben tatsaechlich eine ausfuehrbare Target-Tour?
  // (Disabled-Button-Hint + Summary-Text.)
  const executableCount = useMemo(() => {
    let n = 0;
    for (const id of ejectIds) {
      if (targetByShipment.get(id)?.target) n += 1;
    }
    return n;
  }, [ejectIds, targetByShipment]);

  const qc = useQueryClient();
  const executeMut = useMutation({
    mutationFn: async () => {
      const next = new Map<string, EjectExecutionStatus>();
      for (const ejectId of ejectIds) {
        const t = targetByShipment.get(ejectId);
        if (!t?.target) {
          next.set(ejectId, 'no-target');
          setExecStatus(new Map(next));
          continue;
        }
        const stopId = stopIdByShipment.get(ejectId);
        if (!stopId) {
          // Pre-Source-Sanity: Stop existiert nicht (mehr?) in
          // Source — anderer Disponent war evtl. schneller.
          next.set(ejectId, 'not-in-source');
          setExecStatus(new Map(next));
          continue;
        }

        next.set(ejectId, 'running');
        setExecStatus(new Map(next));

        // Step 1: Source-Remove (stopId, NICHT shipmentId).
        try {
          await api.post(`/nv-touren/${sourceTourId}/batch-stops`, {
            adds: [],
            removes: [stopId],
          });
        } catch {
          next.set(ejectId, 'source-fail');
          setExecStatus(new Map(next));
          continue;
        }

        // Step 2: Target-Add. Fail → Rollback-Versuch.
        try {
          await api.post(
            `/nv-touren/${t.target.tour_id}/batch-stops`,
            { adds: [ejectId], removes: [] },
          );
          next.set(ejectId, 'ok');
        } catch {
          try {
            await api.post(`/nv-touren/${sourceTourId}/batch-stops`, {
              adds: [ejectId],
              removes: [],
            });
            next.set(ejectId, 'rollback');
          } catch {
            next.set(ejectId, 'limbo');
          }
        }
        setExecStatus(new Map(next));
      }
      return next;
    },
    onSuccess: () => {
      // B2-Realtime + invalidate (Belt+Suspenders). Wir invalidieren
      // alle NV-Loading-Caches weil Multi-Tour-Effekt.
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
      qc.invalidateQueries({ queryKey: ['nv-elig'] });
      qc.invalidateQueries({ queryKey: ['nv-loading'] });
      // best-match-Cache fuer alle ejected Sendungen invalidieren
      // (sie haben jetzt neue tour_id).
      for (const ejectId of ejectIds) {
        qc.invalidateQueries({
          queryKey: ['shipment-best-match', ejectId],
        });
      }
      setConfirmStep('done');
    },
  });

  const handleAusfuehren = () => {
    if (confirmStep === 'idle') {
      setConfirmStep('confirm');
      return;
    }
    if (confirmStep === 'confirm') {
      setConfirmStep('running');
      executeMut.mutate();
    }
  };

  const code = tourQ.data?.nv_stamm_tour?.code ?? '—';
  const datum = tourQ.data?.datum
    ? new Date(tourQ.data.datum).toISOString().slice(0, 10)
    : '';

  // Shipment-Number-Lookup fuer Eject-Liste.
  const shipmentNumberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const stop of tourQ.data?.stops ?? []) {
      map.set(stop.shipment.id, stop.shipment.shipment_number ?? stop.shipment.id.slice(0, 8));
    }
    return map;
  }, [tourQ.data?.stops]);

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/30 flex items-start justify-center pt-[10vh]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-2xl w-full max-w-xl border border-gray-200 overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
          <Sparkles size={16} className="text-blue-600" />
          <h2 className="font-semibold text-gray-900 text-sm">
            Tausch-Vorschlag — {code}{datum && ` — ${datum}`}
          </h2>
          <button
            onClick={onClose}
            className="ml-auto text-gray-400 hover:text-gray-700"
            title="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          {tourQ.isLoading && (
            <div className="text-gray-400">Lädt Tour-Daten…</div>
          )}
          {!tourQ.isLoading && !tourQ.data && (
            <div className="text-gray-400">Tour nicht gefunden.</div>
          )}

          {tourQ.data && (
            <>
              {/* O-1: Volumen + Gewicht statt ldm. */}
              <CapacityBar
                value={volCurrent}
                max={maxVolM3}
                label="Aktuell (Volumen)"
                unit="m³"
              />
              <CapacityBar
                value={weightCurrent}
                max={maxWeightKg}
                label="Aktuell (Gewicht)"
                unit="kg"
                precision={0}
              />

              {plan === null && (
                <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-green-800">
                  ✅ Tour passt bereits — kein Tausch nötig.
                  <div className="text-xs text-green-700 mt-1">
                    Vol {volCurrent.toFixed(2)} m³ ≤ {maxVolM3.toFixed(2)} m³,
                    Gewicht {Math.round(weightCurrent).toLocaleString('de-DE')} kg
                    ≤ {maxWeightKg.toLocaleString('de-DE')} kg.
                  </div>
                </div>
              )}

              {plan && plan.fixOverloaded && (
                <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">
                  ⚠ Schon die fixen Sendungen ({fixShipments.length})
                  überladen die Tour.
                  <div className="text-xs text-red-700 mt-1">
                    Fix-Vol {plan.volAfter.toFixed(2)} m³ /{' '}
                    {maxVolM3.toFixed(2)} m³, Fix-Gewicht{' '}
                    {Math.round(plan.weightAfter).toLocaleString('de-DE')} kg /{' '}
                    {maxWeightKg.toLocaleString('de-DE')} kg.
                    Stamm-Kunden-Liste oder Sub-Kapazität prüfen.
                  </div>
                </div>
              )}

              {plan && !plan.fixOverloaded && (
                <>
                  <div className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-blue-900">
                    <div className="font-medium">
                      Vorschlag: {plan.ejectIds.length} Sendung
                      {plan.ejectIds.length === 1 ? '' : 'en'} tauschen
                    </div>
                    <div className="text-xs mt-1 font-mono">
                      Vol {plan.volBefore.toFixed(2)}{' '}
                      <span className="text-gray-600">→</span>{' '}
                      <span className="font-semibold">
                        {plan.volAfter.toFixed(2)}
                      </span>{' '}
                      <span className="text-gray-600">
                        / {maxVolM3.toFixed(2)} m³
                      </span>
                    </div>
                    <div className="text-xs mt-0.5 font-mono">
                      Gewicht{' '}
                      {Math.round(plan.weightBefore).toLocaleString('de-DE')}{' '}
                      <span className="text-gray-600">→</span>{' '}
                      <span className="font-semibold">
                        {Math.round(plan.weightAfter).toLocaleString('de-DE')}
                      </span>{' '}
                      <span className="text-gray-600">
                        / {maxWeightKg.toLocaleString('de-DE')} kg
                      </span>
                    </div>
                  </div>

                  {plan.ejectIds.length > 0 && (
                    <div>
                      <div className="text-xs uppercase text-gray-500 font-semibold mb-1">
                        Eject-Kandidaten
                      </div>
                      <div className="border rounded divide-y">
                        {plan.ejectIds.map((id) => {
                          const s = swappableShipments.find((x) => x.id === id);
                          const t = targetByShipment.get(id);
                          return (
                            <div
                              key={id}
                              className="flex items-center gap-2 px-2 py-1.5 text-xs"
                            >
                              <span className="font-mono">
                                {shipmentNumberById.get(id) ?? id.slice(0, 8)}
                              </span>
                              <span className="text-gray-500">
                                ·{' '}
                                {s?.volumeM3 != null
                                  ? `${Number(s.volumeM3).toFixed(2)} m³`
                                  : '— m³'}
                                {' · '}
                                {s?.weightKg != null
                                  ? `${Math.round(Number(s.weightKg)).toLocaleString('de-DE')} kg`
                                  : '— kg'}
                              </span>
                              <span className="ml-auto inline-flex items-center gap-1">
                                <ArrowRight size={11} className="text-gray-400" />
                                {t?.isLoading ? (
                                  <span className="text-[10px] text-gray-400 italic animate-pulse">
                                    lade Alt-Tour…
                                  </span>
                                ) : t?.target ? (
                                  <span
                                    className="text-[10px] text-green-700"
                                    title={`Score ${t.target.score}${
                                      t.target.reason ? ` · ${t.target.reason}` : ''
                                    }`}
                                  >
                                    {targetLabel(t.target)}
                                    {formatDatumShort(t.target.datum) &&
                                      ` (${formatDatumShort(t.target.datum)})`}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-amber-700">
                                    keine Alt-Tour gefunden
                                  </span>
                                )}
                                {/* F2.2.b-2: Per-Zeile-Execution-Status. */}
                                <ExecStatusIcon
                                  status={execStatus.get(id) ?? 'idle'}
                                />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-600">
                    Behalten:{' '}
                    <span className="font-mono">{plan.keepIds.length}</span>{' '}
                    (davon{' '}
                    <span className="font-mono">{fixShipments.length}</span> fix
                    {fixShipments.length > 0 && (
                      <>
                        {' '}
                        — {fixListSummary(fixShipments)}
                      </>
                    )}
                    )
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t bg-gray-50">
          {/* F2.2.b-2: Done-Banner-Hinweis, wenn Execute durch ist. */}
          {confirmStep === 'done' && (
            <span className="text-xs text-gray-600 flex-1">
              {execSummary(execStatus)}
            </span>
          )}
          {/* Inline-Confirm-Hinweis vor dem zweiten Klick. */}
          {confirmStep === 'confirm' && (
            <span className="text-xs text-red-700 flex-1">
              {executableCount} Sendung
              {executableCount === 1 ? '' : 'en'} wirklich verschieben?
            </span>
          )}
          {/* Spacer wenn KEIN Banner gezeigt wird (Button rechts). */}
          {confirmStep === 'idle' && <span className="flex-1" />}
          {confirmStep === 'running' && (
            <span className="text-xs text-gray-600 flex-1">
              Läuft… ({countRunning(execStatus, ejectIds.length)})
            </span>
          )}

          {plan &&
            !plan.fixOverloaded &&
            executableCount > 0 &&
            confirmStep !== 'done' && (
              <>
                {confirmStep === 'confirm' && (
                  <button
                    onClick={() => setConfirmStep('idle')}
                    className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                  >
                    Abbrechen
                  </button>
                )}
                <button
                  onClick={handleAusfuehren}
                  disabled={
                    confirmStep === 'running' || executeMut.isPending
                  }
                  className={`px-3 py-1.5 text-sm rounded text-white disabled:opacity-50 inline-flex items-center gap-1 ${
                    confirmStep === 'confirm'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {confirmStep === 'running' && (
                    <Loader2 size={12} className="animate-spin" />
                  )}
                  {confirmStep === 'confirm'
                    ? 'Ja, ausführen'
                    : confirmStep === 'running'
                      ? 'Läuft…'
                      : `Ausführen (${executableCount})`}
                </button>
              </>
            )}

          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * NV-spezifischer FIX-Reason-Summary. Bleibt lokal, weil fixReason
 * zwischen NV (stamm-kunde-first) und FV (tier-first) divergiert.
 */
function fixListSummary(fix: SwapShipment[]): string {
  const counts = new Map<string, number>();
  for (const s of fix) {
    const r = fixReason(s) ?? 'fix';
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, n]) => `${n}× ${reason}`)
    .join(', ');
}

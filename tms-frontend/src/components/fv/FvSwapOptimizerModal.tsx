/**
 * F2.3.a FvSwapOptimizerModal — Vorschau + Execute (F2.3.b-2).
 *
 * Faedet F2.3.0 (BE-Daten) + F2.1/O-1 (Optimizer) ins UI:
 *   Source-Tour-Daten via useQuery(['loading','optimize', tourId])
 *   → Adapter ShipmentLoad → SwapShipment
 *   → maxVolM3/maxWeightKg aus recommendedVehicle (FV-Optimizer-
 *     Service)
 *   → isFixSendung mit fixTiers=['VIP','A'] (FV hat keine
 *     fv_stamm_kunden — Tier ersetzt das Konzept)
 *   → findSwapPlan
 *   → b-1: Pro Eject best-match Ziel-Tour (FV-only, excl. Source)
 *   → b-2: Sequenzieller Execute: Source-Remove → Target-Add,
 *     Rollback bei Target-Fail. SHIPMENT-ID als removes-Param
 *     (FV hat keinen stop-Layer).
 *
 * Stilistisch identisch zum NvSwapOptimizerModal; Common-Helper-
 * Extract ist Backlog wenn 3. Modal kommt.
 */
import { useMemo, useState } from 'react';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  findSwapPlan,
  isFixSendung,
  subsetVolumeM3,
  subsetWeightKg,
  type SwapShipment,
} from '../../lib/nvSwapOptimizer';

interface Props {
  sourceTourId: string;
  onClose: () => void;
}

/**
 * F2.3.b-1: BestTour-Match Subset (analog NvSwapOptimizerModal).
 * Lokal kopiert um Modal nicht an ShipmentDetailsTab/Page-internals
 * zu koppeln.
 */
interface BestTourMatch {
  tour_id: string;
  mode: 'nv' | 'fv';
  tour_number?: string | null;
  score: number;
  reason?: string;
  datum?: string | null;
  subunternehmer_name?: string | null;
  stops_count?: number | null;
  last_stop_city?: string | null;
}

/** F2.3.b-1: Anzeige-Label der Ziel-Tour. */
function targetLabel(m: BestTourMatch): string {
  if (m.tour_number) return m.tour_number;
  if (m.subunternehmer_name) return m.subunternehmer_name;
  return m.tour_id.slice(0, 8);
}

function formatDatumShort(iso?: string | null): string | null {
  if (!iso) return null;
  const d = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const parts = d.split('-');
  if (parts.length !== 3) return null;
  return `${parts[2]}.${parts[1]}.`;
}

/* ─── lokale Wire-Types (Subset des FV-Optimize-Response) ─── */

interface FvShipmentPackageItem {
  id: string;
  quantity: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  stackable: boolean;
}

interface FvShipmentLoad {
  id: string;
  shipmentNumber?: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  weightKg?: number;
  ldm?: number;
  isStackable?: boolean;
  packageItems?: FvShipmentPackageItem[];
  // F2.3.0 FIX-Kriterien-Felder:
  customerId?: string | null;
  loadingDate?: string | null;
  status?: string | null;
  hasActiveLock?: boolean | null;
  isHazmat?: boolean | null;
  customerPriorityTier?: string | null;
}

interface FvVehicle {
  type?: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  maxWeightKg?: number;
  maxLdm?: number;
}

interface FvOptimizeResponse {
  recommendedVehicle: FvVehicle;
  loadingOrder: FvShipmentLoad[];
}

/* ─── Adapter ──────────────────────────────────────────────── */

/**
 * Adapter: FV-ShipmentLoad → Optimizer-SwapShipment.
 * volumeM3 + weightKg aus packageItems (O-1-Fix-Muster, dieselbe
 * Quelle wie die LoadingPlanPage-Anzeige).
 *
 * is_stamm_kunde wird NICHT gesetzt — FV hat keine fv_stamm_kunden.
 * Tier-FIX via opts.fixTiers=['VIP','A'].
 */
function shipmentLoadToSwapShipment(s: FvShipmentLoad): SwapShipment {
  const items = s.packageItems ?? [];
  const allStackable =
    items.length > 0 && items.every((it) => it.stackable !== false);
  let volCm3 = 0;
  let weightKg = 0;
  for (const it of items) {
    const qty = Math.max(1, Number(it.quantity ?? 1));
    volCm3 +=
      Number(it.lengthCm || 0) *
      Number(it.widthCm || 0) *
      Number(it.heightCm || 0) *
      qty;
    weightKg += Number(it.weightKg || 0) * qty;
  }
  return {
    id: s.id,
    volumeM3: volCm3 / 1e6,
    weightKg,
    ldm: s.ldm != null ? Number(s.ldm) : null,
    isStackable: allStackable,
    is_stamm_kunde: false,
    loading_date: s.loadingDate ?? null,
    status: s.status ?? null,
    has_active_lock: s.hasActiveLock === true,
    is_hazmat: s.isHazmat === true,
    customer_priority_tier: s.customerPriorityTier ?? null,
  };
}

function fixReason(s: SwapShipment): string | null {
  // FV kennt kein Stamm-Kunde — wir pruefen Tier-FIX zuerst.
  if (
    s.customer_priority_tier === 'VIP' ||
    s.customer_priority_tier === 'A'
  ) {
    return `Tier ${s.customer_priority_tier}`;
  }
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

/* ─── Komponente ───────────────────────────────────────────── */

export default function FvSwapOptimizerModal({
  sourceTourId,
  onClose,
}: Props) {
  const tourQ = useQuery<FvOptimizeResponse | null>({
    queryKey: ['loading', 'optimize', sourceTourId],
    queryFn: async () => {
      const { data } = await api.get<FvOptimizeResponse>(
        `/loading/tour/${sourceTourId}/optimize`,
      );
      return data;
    },
    enabled: !!sourceTourId,
    staleTime: 10_000,
  });

  // Capacity aus recommendedVehicle. Fallback auf Sattel-typische
  // Werte falls Felder fehlen (defensive — Optimizer-Service liefert
  // canonical Keys, sollte gepflegt sein).
  const { maxVolM3, maxWeightKg } = useMemo(() => {
    const v = tourQ.data?.recommendedVehicle;
    const lengthCm = Number(v?.lengthCm) || 1360;
    const widthCm = Number(v?.widthCm) || 240;
    const heightCm = Number(v?.heightCm) || 270;
    const vol = (lengthCm * widthCm * heightCm) / 1e6;
    const weight = Number(v?.maxWeightKg) || 24000;
    return { maxVolM3: vol, maxWeightKg: weight };
  }, [tourQ.data?.recommendedVehicle]);

  const {
    fixShipments,
    swappableShipments,
    plan,
    volCurrent,
    weightCurrent,
  } = useMemo(() => {
    const ships = tourQ.data?.loadingOrder ?? [];
    const all = ships.map(shipmentLoadToSwapShipment);
    const fix: SwapShipment[] = [];
    const swap: SwapShipment[] = [];
    // FV: Tier-FIX statt is_stamm_kunde.
    const fixOpts = { fixTiers: ['VIP', 'A'] };
    for (const s of all) {
      if (isFixSendung(s, fixOpts)) fix.push(s);
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
  }, [tourQ.data?.loadingOrder, maxVolM3, maxWeightKg]);

  // F2.3.b-1: Pro ejectId Best-Match parallel laden (B1 + F2.2.b-0
  // exclude_tour_id-Param). queryKey 3-Tupel mit sourceTourId
  // trennt den Cache vom Default-B1-Pfad (ShipmentDetailsTab nutzt
  // 2-Tupel ohne exclude).
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
  // FV: erste passende FV-Tour die NICHT die Source-Tour ist.
  const targetByShipment = useMemo(() => {
    const map = new Map<
      string,
      { target: BestTourMatch | null; isLoading: boolean }
    >();
    ejectIds.forEach((id, idx) => {
      const q = bestMatchQueries[idx];
      const matches = q?.data ?? [];
      const target =
        matches.find((m) => m.mode === 'fv' && m.tour_id !== sourceTourId) ??
        null;
      map.set(id, { target, isLoading: q?.isLoading ?? false });
    });
    return map;
  }, [ejectIds, bestMatchQueries, sourceTourId]);

  // Shipment-Number-Lookup fuer Eject-Liste.
  const shipmentNumberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of tourQ.data?.loadingOrder ?? []) {
      map.set(s.id, s.shipmentNumber ?? s.id.slice(0, 8));
    }
    return map;
  }, [tourQ.data?.loadingOrder]);

  // F2.3.b-2: Set der Shipment-IDs auf Source-Tour (Pre-Sanity).
  // FV hat keinen stops-Layer — die Sendung-ID IST der Removable-
  // Identifier fuer batchStopsFv. Wenn loadingOrder die Sendung
  // nicht mehr enthaelt (z.B. anderer Disponent war schneller),
  // skippen wir mit 'not-in-source' statt blind das BE zu fragen.
  const sourceShipmentIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of tourQ.data?.loadingOrder ?? []) {
      set.add(s.id);
    }
    return set;
  }, [tourQ.data?.loadingOrder]);

  // F2.3.b-2: Per-Eject-Status-Map. Mirror NvSwapOptimizerModal —
  // dieselben States, dieselbe Sequenz; nur removes-Payload-Form
  // unterscheidet sich (shipmentId statt stopId).
  type EjectExecutionStatus =
    | 'idle'
    | 'no-target'
    | 'not-in-source'
    | 'running'
    | 'ok'
    | 'source-fail'
    | 'rollback'
    | 'limbo';
  const [execStatus, setExecStatus] = useState<
    Map<string, EjectExecutionStatus>
  >(new Map());
  const [confirmStep, setConfirmStep] = useState<
    'idle' | 'confirm' | 'running' | 'done'
  >('idle');

  // Wie viele Ejects haben tatsaechlich eine ausfuehrbare Ziel-Tour?
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
        // Pre-Source-Sanity: Sendung sitzt noch auf Source-Tour.
        if (!sourceShipmentIds.has(ejectId)) {
          next.set(ejectId, 'not-in-source');
          setExecStatus(new Map(next));
          continue;
        }

        next.set(ejectId, 'running');
        setExecStatus(new Map(next));

        // Step 1: Source-Remove FIRST (shipmentId — KEIN stopId in FV).
        // Bei Fail: Sendung bleibt in Quelle (kein Verlust).
        try {
          await api.post(`/tours/${sourceTourId}/batch-stops`, {
            adds: [],
            removes: [ejectId],
          });
        } catch {
          next.set(ejectId, 'source-fail');
          setExecStatus(new Map(next));
          continue;
        }

        // Step 2: Target-Add. FV-BE-Pre-Checks (status='new',
        // tour_id=null, has_active_lock, ADR-fuer-Hazmat) lehnen
        // ggf. mit 400 ab → fall through zum Rollback.
        try {
          await api.post(`/tours/${t.target.tour_id}/batch-stops`, {
            adds: [ejectId],
            removes: [],
          });
          next.set(ejectId, 'ok');
        } catch {
          // Target-Add fail → Source-Re-Add versuchen (Rollback).
          try {
            await api.post(`/tours/${sourceTourId}/batch-stops`, {
              adds: [ejectId],
              removes: [],
            });
            next.set(ejectId, 'rollback');
          } catch {
            // Sendung jetzt nirgendwo — limbo, manuelle Korrektur.
            next.set(ejectId, 'limbo');
          }
        }
        setExecStatus(new Map(next));
      }
      return next;
    },
    onSuccess: () => {
      // FV-Caches: Tours-Liste, Eligible-Pool, Optimize-Detail der
      // Source-Tour. Realtime feuert ohnehin shipment.assigned
      // (Belt+Suspenders).
      qc.invalidateQueries({ queryKey: ['fv-touren'] });
      qc.invalidateQueries({ queryKey: ['fv-eligible'] });
      qc.invalidateQueries({
        queryKey: ['loading', 'optimize', sourceTourId],
      });
      // Best-match-Cache der ejected Sendungen (sie haben jetzt
      // neue tour_id) — Prefix-Match ueber alle Cache-Eintraege.
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
            Tausch-Vorschlag — FV {sourceTourId.slice(0, 8)}
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
                    Tier-Kunden (VIP/A) oder Fahrzeug-Wahl prüfen.
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
                              {/* F2.3.b-1: Best-Match-Target FV-only.
                                  F2.3.b-2: Per-Zeile-ExecStatusIcon. */}
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
                      <> — {fixListSummary(fixShipments)}</>
                    )}
                    )
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t bg-gray-50">
          {/* F2.3.b-2: Done-Banner, wenn Execute durch ist. */}
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
 * F2.3.b-2: Per-Eject-Status-Icon. Klein + farbig — sitzt rechts vom
 * Alt-Tour-Label in der Eject-Liste. Identisch zur NV-Variante.
 */
function ExecStatusIcon({ status }: { status: string }) {
  if (status === 'idle') return null;
  if (status === 'running') {
    return <Loader2 size={11} className="text-blue-600 animate-spin" />;
  }
  if (status === 'ok') {
    return <Check size={11} className="text-emerald-700" />;
  }
  if (status === 'rollback') {
    return (
      <span title="Target-Add fehlgeschlagen, Source-Re-Add ok">
        <RotateCcw size={11} className="text-amber-700" />
      </span>
    );
  }
  if (status === 'limbo') {
    return (
      <span title="Target-Add UND Rollback fehlgeschlagen — Sendung manuell zuordnen!">
        <AlertTriangle size={11} className="text-red-700" />
      </span>
    );
  }
  if (status === 'source-fail') {
    return (
      <span title="Source-Remove fehlgeschlagen — Sendung blieb in Quelle">
        <AlertTriangle size={11} className="text-amber-700" />
      </span>
    );
  }
  if (status === 'not-in-source') {
    return (
      <span title="Sendung ist nicht (mehr) in der Source-Tour — uebersprungen">
        <X size={11} className="text-gray-500" />
      </span>
    );
  }
  if (status === 'no-target') {
    return (
      <span title="Keine Alt-Tour vorhanden — uebersprungen">
        <X size={11} className="text-gray-400" />
      </span>
    );
  }
  return null;
}

function countRunning(
  status: Map<string, string>,
  total: number,
): string {
  let done = 0;
  for (const v of status.values()) {
    if (v !== 'running' && v !== 'idle') done += 1;
  }
  return `${done}/${total}`;
}

function execSummary(status: Map<string, string>): string {
  let ok = 0;
  let rollback = 0;
  let limbo = 0;
  let skip = 0;
  for (const v of status.values()) {
    if (v === 'ok') ok += 1;
    else if (v === 'rollback') rollback += 1;
    else if (v === 'limbo') limbo += 1;
    else if (
      v === 'no-target' ||
      v === 'not-in-source' ||
      v === 'source-fail'
    )
      skip += 1;
  }
  const parts: string[] = [];
  if (ok > 0) parts.push(`✓ ${ok} verschoben`);
  if (rollback > 0) parts.push(`↻ ${rollback} rollback`);
  if (limbo > 0) parts.push(`⚠ ${limbo} im Limbo`);
  if (skip > 0) parts.push(`✗ ${skip} übersprungen`);
  return parts.length > 0 ? parts.join(' · ') : 'Keine Aktion.';
}

/* ─── kleine Render-Helfer ──────────────────────────────────── */

function CapacityBar({
  value,
  max,
  label,
  unit,
  precision = 2,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  precision?: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const clamped = Math.min(100, Math.max(0, pct));
  const over = pct > 100;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span
          className={
            over ? 'font-mono font-semibold text-red-700' : 'font-mono'
          }
        >
          {precision === 0
            ? Math.round(value).toLocaleString('de-DE')
            : value.toFixed(precision)}{' '}
          /{' '}
          {precision === 0
            ? Math.round(max).toLocaleString('de-DE')
            : max.toFixed(precision)}{' '}
          {unit} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded overflow-hidden">
        <div
          className={`h-full ${over ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

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

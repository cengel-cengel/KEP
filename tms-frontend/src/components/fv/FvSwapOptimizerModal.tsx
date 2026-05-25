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
import { useEffect, useMemo, useState } from 'react';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowRight, Loader2, Sparkles, X } from 'lucide-react';
import { api } from '../../lib/api';
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
  type BestTourMatch,
  type EjectExecutionStatus,
} from '../../lib/swapShared';
import {
  CapacityBar,
  EjectTargetSelector,
  ExecStatusIcon,
  type EjectTargetSelectorValue,
  type NewTourForm,
  type TourOption,
} from '../shared/SwapModalBits';

interface Props {
  sourceTourId: string;
  onClose: () => void;
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
  const [execStatus, setExecStatus] = useState<
    Map<string, EjectExecutionStatus>
  >(new Map());
  const [confirmStep, setConfirmStep] = useState<
    'idle' | 'confirm' | 'running' | 'done'
  >('idle');

  // Phase 1+2: pro Eject die Ziel-Wahl merken. 'best' default,
  // 'manual' mit explizit gewaehlter Tour, 'pool' Dispotopf.
  const [targetMap, setTargetMap] = useState<
    Map<string, EjectTargetSelectorValue>
  >(new Map());
  const targetFor = (id: string): EjectTargetSelectorValue =>
    targetMap.get(id) ?? { kind: 'best', manualTourId: null };
  const setTargetFor = (id: string, v: EjectTargetSelectorValue) => {
    setTargetMap((prev) => {
      const next = new Map(prev);
      next.set(id, v);
      return next;
    });
  };

  // Phase 2: FV-Tour-Liste fuer Manual-Picker. Filter: !== sourceTour
  // + status='planned'.
  // Phase 2.1: tours.findAll liefert jetzt overload pro Tour →
  // capacityHint analog NV.
  type FvTourLite = {
    id: string;
    status?: string | null;
    tour_number?: string | null;
    tour_date?: string | null;
    subcontractors?: { name?: string | null } | null;
    overload?: { vol?: number; weight?: number } | null;
  };
  const toursQ = useQuery<FvTourLite[]>({
    queryKey: ['fv-touren'],
    queryFn: async () => (await api.get<FvTourLite[]>('/tours')).data,
    staleTime: 30_000,
  });
  const manualTourOptions: TourOption[] = useMemo(() => {
    const all = toursQ.data ?? [];
    return all
      .filter(
        (t) => t.id !== sourceTourId && (t.status ?? '') === 'planned',
      )
      .map((t) => {
        const labelBase =
          t.tour_number ?? t.subcontractors?.name ?? t.id.slice(0, 8);
        const datumShort = t.tour_date ? t.tour_date.slice(0, 10) : null;
        const label = datumShort ? `${labelBase} (${datumShort})` : labelBase;
        const vol = t.overload?.vol;
        const weight = t.overload?.weight;
        const capacityHint =
          vol != null || weight != null
            ? `Vol ${((vol ?? 0) * 100).toFixed(0)}%/Gew ${((weight ?? 0) * 100).toFixed(0)}%`
            : undefined;
        return { id: t.id, label, capacityHint };
      });
  }, [toursQ.data, sourceTourId]);

  // Phase 3: Sub-Liste (optional) fuer "Neue Tour"-Form.
  type SubLite = { id: string; name?: string | null };
  const subsQ = useQuery<SubLite[]>({
    queryKey: ['subcontractors'],
    queryFn: async () => (await api.get<SubLite[]>('/subcontractors')).data,
    staleTime: 5 * 60_000,
  });

  // Phase 3: Gemeinsame "Neue Tour"-Form. Datum default = Source-
  // Tour-Datum (Q2 NV-Paritaet) statt heute. tours-Liste laedt mit
  // tour_date pro Tour — Source dort suchen. Initialisierung einmalig
  // sobald toursQ Daten hat; danach User-Override moeglich.
  const [groupNewForm, setGroupNewForm] = useState<NewTourForm>({
    datum: null,
    subcontractorId: null,
  });
  const [datumInitialized, setDatumInitialized] = useState(false);
  useEffect(() => {
    if (datumInitialized) return;
    if (!toursQ.data) return;
    const sourceTour = toursQ.data.find((x) => x.id === sourceTourId);
    const sourceDatum = sourceTour?.tour_date
      ? sourceTour.tour_date.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    setGroupNewForm((p) => ({ ...p, datum: p.datum ?? sourceDatum }));
    setDatumInitialized(true);
  }, [toursQ.data, sourceTourId, datumInitialized]);

  function effectiveNewForm(id: string): NewTourForm | null {
    const v = targetFor(id);
    if (v.kind !== 'new') return null;
    const f = v.newIndividual ? (v.newForm ?? {}) : groupNewForm;
    if (!f.datum) return null;
    return f;
  }

  // Ausfuehrbar: best+target / pool / manual+id / new+valider Form.
  const executableCount = useMemo(() => {
    let n = 0;
    for (const id of ejectIds) {
      const v = targetFor(id);
      if (v.kind === 'pool') n += 1;
      else if (v.kind === 'manual' && v.manualTourId) n += 1;
      else if (v.kind === 'best' && targetByShipment.get(id)?.target) n += 1;
      else if (v.kind === 'new' && effectiveNewForm(id)) n += 1;
    }
    return n;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejectIds, targetByShipment, targetMap, groupNewForm]);

  /** Phase 3 Banner-Counter. */
  const [createdTourCount, setCreatedTourCount] = useState(0);

  /** True wenn mind. 1 Eject 'new' + nicht 'eigen' ist. */
  const hasGroupNew = useMemo(
    () =>
      ejectIds.some((id) => {
        const v = targetFor(id);
        return v.kind === 'new' && !v.newIndividual;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ejectIds, targetMap],
  );

  const qc = useQueryClient();
  const executeMut = useMutation({
    mutationFn: async () => {
      const next = new Map<string, EjectExecutionStatus>();

      // Phase 3 PRE-STEP: Neue Touren anlegen (1× Gruppen-Tour wenn
      // ≥1 Gruppen-Eject + 1× pro 'eigen'-Eject). Mapping ejectId →
      // newTourId. FV-Schema: tour_id (FK auf shipments) — KEIN
      // stops-Layer.
      const newTourIdMap = new Map<string, string>();
      let createdCount = 0;
      const groupEjects = ejectIds.filter((id) => {
        const v = targetFor(id);
        return v.kind === 'new' && !v.newIndividual && effectiveNewForm(id);
      });
      if (groupEjects.length > 0 && groupNewForm.datum) {
        try {
          const body: Record<string, unknown> = {
            tourDate: groupNewForm.datum,
          };
          if (groupNewForm.subcontractorId)
            body.subcontractorId = groupNewForm.subcontractorId;
          const { data: newTour } = await api.post<{ id: string }>(
            '/tours',
            body,
          );
          createdCount += 1;
          for (const id of groupEjects) newTourIdMap.set(id, newTour.id);
        } catch {
          // Create-Fail → alle Gruppen-Ejects bleiben ohne Target
          // (werden im Loop unten als 'no-target' geskippt).
        }
      }
      for (const ejectId of ejectIds) {
        const v = targetFor(ejectId);
        if (v.kind !== 'new' || !v.newIndividual) continue;
        const f = v.newForm ?? {};
        if (!f.datum) continue;
        try {
          const body: Record<string, unknown> = { tourDate: f.datum };
          if (f.subcontractorId) body.subcontractorId = f.subcontractorId;
          const { data: newTour } = await api.post<{ id: string }>(
            '/tours',
            body,
          );
          createdCount += 1;
          newTourIdMap.set(ejectId, newTour.id);
        } catch {
          /* fall through */
        }
      }
      setCreatedTourCount(createdCount);

      for (const ejectId of ejectIds) {
        const sel = targetFor(ejectId);
        const t = targetByShipment.get(ejectId);
        // Phase 2/3: Ziel-Tour pro Modus bestimmen.
        let targetTourId: string | null = null;
        if (sel.kind === 'best') targetTourId = t?.target?.tour_id ?? null;
        else if (sel.kind === 'manual') targetTourId = sel.manualTourId ?? null;
        else if (sel.kind === 'new') targetTourId = newTourIdMap.get(ejectId) ?? null;
        // pool → kein Target

        if (sel.kind !== 'pool' && !targetTourId) {
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
        // FV batchStopsFv setzt tour_id=null + status='new' → Sendung
        // landet automatisch im FV-eligible-Pool (Dispotopf-Effekt
        // out-of-the-box, auch fuer kind='best'/'manual'/'new').
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

        // Phase 1 Dispotopf: kind='pool' → KEIN Target-Add, fertig.
        if (sel.kind === 'pool') {
          next.set(ejectId, 'pool');
          setExecStatus(new Map(next));
          continue;
        }

        // Step 2: Target-Add (kind='best'/'manual'/'new' → targetTourId
        // schon bestimmt). FV-BE-Pre-Checks (status='new', tour_id=null,
        // has_active_lock, ADR-fuer-Hazmat) lehnen ggf. mit 400 ab →
        // fall through zum Rollback.
        try {
          await api.post(`/tours/${targetTourId}/batch-stops`, {
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
            // Q6 Cleanup (FV-Variante): cancel statt delete —
            // FV-Tour ist ein Geschaeftsdokument mit FK-Relationen
            // (returns/surplus: NoAction=RESTRICT, drafts/driver_*:
            // Cascade, shipments.tour_id: SetNull). Hard-DELETE
            // koennte FK-blocken oder still Daten anomalisieren;
            // status='cancelled' nutzt den bestehenden findAll-
            // notIn-Filter, ist FK-agnostisch und audit-faehig.
            // NV-Pendant nutzt DELETE (schlankere FK-Landschaft).
            if (sel.kind === 'new' && sel.newIndividual) {
              try {
                await api.patch(`/tours/${targetTourId}`, {
                  status: 'cancelled',
                });
              } catch {
                /* Cleanup best-effort; im Worst-Case bleibt leere
                   'planned'-Tour in der Liste. */
              }
            }
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

                  {/* Phase 3: Gemeinsame Neue-Tour-Form (FV).
                      Datum Pflicht, Sub optional. */}
                  {hasGroupNew && (
                    <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 space-y-1.5">
                      <div className="text-[11px] font-semibold text-emerald-900 inline-flex items-center gap-1">
                        ✨ Neue Gruppen-Tour
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <label className="flex items-center gap-1">
                          <span className="text-emerald-900">Datum:</span>
                          <input
                            type="date"
                            value={groupNewForm.datum ?? ''}
                            disabled={confirmStep !== 'idle'}
                            onChange={(e) =>
                              setGroupNewForm((p) => ({
                                ...p,
                                datum: e.target.value || null,
                              }))
                            }
                            className="border border-emerald-300 rounded bg-white px-1 py-0.5"
                          />
                        </label>
                        <label className="flex items-center gap-1">
                          <span className="text-emerald-900">Sub (optional):</span>
                          <select
                            value={groupNewForm.subcontractorId ?? ''}
                            disabled={confirmStep !== 'idle'}
                            onChange={(e) =>
                              setGroupNewForm((p) => ({
                                ...p,
                                subcontractorId: e.target.value || null,
                              }))
                            }
                            className="border border-emerald-300 rounded bg-white px-1 py-0.5 max-w-[10rem]"
                          >
                            <option value="">— ohne —</option>
                            {(subsQ.data ?? []).map((sub) => (
                              <option key={sub.id} value={sub.id}>
                                {sub.name ?? sub.id.slice(0, 8)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {!groupNewForm.datum && (
                        <div className="text-[10px] text-amber-700">
                          Datum ist Pflicht.
                        </div>
                      )}
                    </div>
                  )}

                  {plan.ejectIds.length > 0 && (
                    <div>
                      <div className="text-xs uppercase text-gray-500 font-semibold mb-1">
                        Eject-Kandidaten
                      </div>
                      <div className="border rounded divide-y">
                        {plan.ejectIds.map((id) => {
                          const s = swappableShipments.find((x) => x.id === id);
                          const t = targetByShipment.get(id);
                          const sel = targetFor(id);
                          return (
                            <div
                              key={id}
                              className="flex flex-col gap-1 px-2 py-1.5 text-xs"
                            >
                              <div className="flex items-center gap-2">
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
                                  <EjectTargetSelector
                                    value={sel}
                                    bestMatch={t?.target ?? null}
                                    bestMatchLoading={t?.isLoading}
                                    tours={manualTourOptions}
                                    disabled={confirmStep !== 'idle'}
                                    onChange={(v) => setTargetFor(id, v)}
                                  />
                                  {sel.kind === 'new' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setTargetFor(id, {
                                          ...sel,
                                          newIndividual: !sel.newIndividual,
                                          newForm: !sel.newIndividual
                                            ? { ...groupNewForm }
                                            : sel.newForm,
                                        })
                                      }
                                      disabled={confirmStep !== 'idle'}
                                      title={
                                        sel.newIndividual
                                          ? 'Zurueck in Gruppen-Tour'
                                          : 'Eigene Tour fuer diese Sendung'
                                      }
                                      className={`text-[10px] px-1 py-0.5 rounded border ${
                                        sel.newIndividual
                                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                                      }`}
                                    >
                                      ↗ eigen
                                    </button>
                                  )}
                                  <ExecStatusIcon
                                    status={execStatus.get(id) ?? 'idle'}
                                  />
                                </span>
                              </div>
                              {sel.kind === 'new' && sel.newIndividual && (
                                <div className="ml-6 flex items-center gap-2 text-[10px] text-gray-700">
                                  <label className="flex items-center gap-1">
                                    <span>Datum:</span>
                                    <input
                                      type="date"
                                      value={sel.newForm?.datum ?? ''}
                                      disabled={confirmStep !== 'idle'}
                                      onChange={(e) =>
                                        setTargetFor(id, {
                                          ...sel,
                                          newForm: {
                                            ...(sel.newForm ?? {}),
                                            datum: e.target.value || null,
                                          },
                                        })
                                      }
                                      className="border border-gray-300 rounded bg-white px-1 py-0.5"
                                    />
                                  </label>
                                  <label className="flex items-center gap-1">
                                    <span>Sub:</span>
                                    <select
                                      value={sel.newForm?.subcontractorId ?? ''}
                                      disabled={confirmStep !== 'idle'}
                                      onChange={(e) =>
                                        setTargetFor(id, {
                                          ...sel,
                                          newForm: {
                                            ...(sel.newForm ?? {}),
                                            subcontractorId:
                                              e.target.value || null,
                                          },
                                        })
                                      }
                                      className="border border-gray-300 rounded bg-white px-1 py-0.5 max-w-[8rem]"
                                    >
                                      <option value="">—</option>
                                      {(subsQ.data ?? []).map((sub) => (
                                        <option key={sub.id} value={sub.id}>
                                          {sub.name ?? sub.id.slice(0, 8)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                              )}
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
              {execSummary(execStatus, createdTourCount)}
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
 * FV-spezifischer FIX-Reason-Summary. Bleibt lokal, weil fixReason
 * zwischen NV (stamm-first) und FV (tier-first) divergiert.
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

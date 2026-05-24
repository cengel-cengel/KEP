/**
 * F2.3.a FvSwapOptimizerModal — Read-Only Vorschau (FV-Pendant).
 *
 * Faedet F2.3.0 (BE-Daten) + F2.1/O-1 (Optimizer) ins UI:
 *   Source-Tour-Daten via useQuery(['loading','optimize', tourId])
 *   → Adapter ShipmentLoad → SwapShipment
 *   → maxVolM3/maxWeightKg aus recommendedVehicle (FV-Optimizer-
 *     Service)
 *   → isFixSendung mit fixTiers=['VIP','A'] (FV hat keine
 *     fv_stamm_kunden — Tier ersetzt das Konzept)
 *   → findSwapPlan
 *
 * KEINE Targets, KEIN Execute — kommt in F2.3.b-1 / b-2.
 *
 * Stilistisch identisch zum NvSwapOptimizerModal; Common-Helper-
 * Extract (ExecStatusIcon, CapacityBar) ist Backlog wenn 3.
 * Modal kommt.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
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

  // Shipment-Number-Lookup fuer Eject-Liste.
  const shipmentNumberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of tourQ.data?.loadingOrder ?? []) {
      map.set(s.id, s.shipmentNumber ?? s.id.slice(0, 8));
    }
    return map;
  }, [tourQ.data?.loadingOrder]);

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

        <div className="flex justify-end gap-2 px-4 py-3 border-t bg-gray-50">
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

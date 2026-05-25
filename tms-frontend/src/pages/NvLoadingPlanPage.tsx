import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, X } from 'lucide-react';
import { api } from '../lib/api';
import { useInsertMode } from '../hooks/useInsertMode';
import InsertModeBanner from '../components/loadingplan/InsertModeBanner';
import ContextMenu, {
  type ContextMenuItem,
} from '../components/loadingplan/ContextMenu';
import { planNvInsertShift } from '../lib/nvRepack';
import LoadingPlan3D from '../components/LoadingPlan3D';
import AxleLoadPanel from '../components/AxleLoadPanel';
import {
  getVehicleDims,
  resolveFahrzeugTyp,
  resolveVehicleCapacity,
} from '../lib/vehicleTypes';
import { computeStackingLdmMetrics } from '../lib/loadingLdm';
import { placePackages, sortPackagesForOptimalPack, type SharedPlacedPackage } from '../lib/loadingShared';
import { nvExpandPackages, type NvExpandedPackage } from '../lib/nvExpand';

/**
 * NV-Pack-Output. Plan3DPackage-kompatibel (struktureller Superset)
 * + Pass-Through-Felder fuer Drag-Persist (dbItemId) und Context-
 * Menu (shipmentId).
 */
export type NvFlatPackage = NvExpandedPackage & SharedPlacedPackage;

export interface NvPackageItem {
  id: string;
  line_index: number;
  package_type?: string | null;
  quantity?: number | null;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: string | number;
  stackable: boolean;
  pos_x_cm?: number | null;
  pos_y_cm?: number | null;
  pos_z_cm?: number | null;
  rotation_deg?: number | null;
}

export interface NvShipment {
  id: string;
  shipment_number?: string | null;
  weight_kg?: string | number | null;
  ldm?: string | number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  shipment_package_items: NvPackageItem[];
  // F2.0: FIX-Kriterien-Felder fuer Swap-Optimizer.
  customer_id?: string | null;
  loading_date?: string | null;
  status?: string | null;
  has_active_lock?: boolean | null;
  is_hazmat?: boolean | null;
  customers?: { priority_tier?: string | null } | null;
}

export interface NvLoadingDetail {
  id: string;
  datum: string;
  status: string;
  fahrzeug_typ?: string | null;
  // F2.0: fuer Stamm-Kunden-Set-Lookup im Swap-Optimizer.
  nv_stamm_tour_id?: string | null;
  nv_stamm_tour?: { code: string; name: string } | null;
  subunternehmer?: {
    id: string;
    name: string;
    fahrzeug_typ?: string | null;
    // F1.a-Fix: Kapazitaet primaer aus Sub-Stammdaten — siehe
    // resolveVehicleCapacity() in lib/vehicleTypes.
    max_ldm?: number | string | null;
    max_gewicht_kg?: number | null;
  } | null;
  stops: Array<{
    id: string;
    position: number;
    // F2.0: Computed-Flag aus BE (nv_stamm_kunden-Set).
    is_stamm_kunde?: boolean;
    shipment: NvShipment;
  }>;
}

/**
 * S-2b: Export fuer LoadingPlanPanel (workspace-Panel) Wiederverwendung.
 *
 * Pure-Wrapper: nvExpandPackages (Expand-Step, lib/nvExpand) →
 * placePackages (Pack-Algorithmus, lib/loadingShared). Damit nutzt
 * NV identische Pack-Logik wie FV-LoadingPlanPage (Phase-1-storedPos,
 * findPreferredStackSlot mit Mischpaletten-Erweiterung, BUG-F-PACK
 * Overflow→unplaced).
 *
 * Render-Aenderung vs. vorherige NV-spezifische flattenPackages:
 *  · Stapelbare Sendungen werden jetzt GESTAPELT (Phase 2 stack-slot-
 *    First), nicht mehr alles auf Boden — bündigeres Bild, weniger
 *    unplaced bei NV-Touren mit stapelbarer Ladung.
 *  · 5 cm Gap zwischen Paketen weggefallen — Pakete liegen bündig
 *    aneinander wie auf einer realen Palette.
 *  · DB-persistierte Positionen (q==0 mit pos_*_cm) bleiben
 *    unveraendert; Phase 1 honoriert sie als Hindernisse.
 */
/**
 * S-6.3 A-Fix: Pre-Sort via sortPackagesForOptimalPack VOR
 * placePackages. Vorher: Default-Ansicht packte items in DB-Reihenfolge
 * → Mischpaletten/Stack-Slots wurden suboptimal vergeben →
 * Pakete fielen als unplaced raus trotz Bodenreserve (Carlos-Bsp
 * N040: 13 Pal / ~17 m² von 32 m²). Carlos-Stack-Rule (non-stackable
 * first, weight desc, vol desc) sortiert die Items optimal.
 *
 * Regel #2: sortPackagesForOptimalPack operiert auf der flachen
 * Paket-Liste; eine Sendung wird durch den Sort NICHT zerlegt — alle
 * Pakete einer Sendung bleiben fuer placePackages weiterhin
 * adressierbar via shipmentId.
 */
export function flattenPackages(
  tour: NvLoadingDetail | null,
  trailerWidthCm: number,
  trailerLengthCm: number,
  trailerHeightCm: number = 270,
): NvFlatPackage[] {
  const expanded = nvExpandPackages(tour);
  const sorted = sortPackagesForOptimalPack(expanded);
  return placePackages(
    sorted,
    trailerLengthCm,
    trailerWidthCm,
    trailerHeightCm,
  );
}

export default function NvLoadingPlanPage() {
  const qc = useQueryClient();
  const { tourId } = useParams<{ tourId: string }>();
  // B-2 Insert-Mode page-local state.
  const insertMode = useInsertMode();
  // NV-RC: Right-Click ContextMenu state (Symmetrie zu FV).
  const [ctxMenu, setCtxMenu] = useState<{
    pkgId: string;
    shipmentId: string;
    x: number;
    y: number;
  } | null>(null);

  const tourQ = useQuery<NvLoadingDetail | null>({
    queryKey: ['nv-loading', tourId],
    queryFn: async () => {
      if (!tourId) return null;
      const { data } = await api.get<NvLoadingDetail>(
        `/nv-touren/${tourId}/loading`,
      );
      return data;
    },
    enabled: !!tourId,
    staleTime: 10_000,
  });

  const vehicle = useMemo(() => {
    const fz = resolveFahrzeugTyp(
      tourQ.data?.fahrzeug_typ,
      tourQ.data?.subunternehmer?.fahrzeug_typ,
    );
    return getVehicleDims(fz);
  }, [tourQ.data?.fahrzeug_typ, tourQ.data?.subunternehmer?.fahrzeug_typ]);

  // F1.a-Fix: Kapazitaet (maxLdm/maxWeightKg) separat aufloesen —
  // Sub-Stammdaten gewinnen vor Tonnen-Parsing aus fahrzeug_typ
  // ("7_5T"/"12T"/"18T" sind in VEHICLE_DIMS NICHT canonical, stiller
  // Fallback "Koffer 7t" hatte ~300% Auslastung verursacht).
  // Trailer-Dimensionen (lengthCm/widthCm/heightCm) bleiben aus
  // getVehicleDims — separater Bug, nicht in dieser Card.
  const capacity = useMemo(
    () =>
      resolveVehicleCapacity(
        tourQ.data ? { fahrzeug_typ: tourQ.data.fahrzeug_typ ?? null } : null,
        tourQ.data?.subunternehmer ?? null,
      ),
    [
      tourQ.data?.fahrzeug_typ,
      tourQ.data?.subunternehmer?.fahrzeug_typ,
      tourQ.data?.subunternehmer?.max_ldm,
      tourQ.data?.subunternehmer?.max_gewicht_kg,
    ],
  );

  const packages = useMemo(
    () =>
      flattenPackages(
        tourQ.data ?? null,
        capacity.widthCm,
        capacity.lengthCm,
        capacity.heightCm,
      ),
    [
      tourQ.data,
      capacity.widthCm,
      capacity.lengthCm,
      capacity.heightCm,
    ],
  );

  // BUG-F-PACK: Render/Drag-Target = nur platzierte Pakete; unplaced
  // werden im Banner gezaehlt, aber nicht ins 3D-Mesh gereicht.
  const renderedPackages = useMemo(
    () => packages.filter((p) => !p.unplaced),
    [packages],
  );
  const unplacedCount = useMemo(
    () => packages.filter((p) => p.unplaced).length,
    [packages],
  );

  // F1.a/K-L-M-N Kennzahlen: per-Sendung ldm/isStackable aus tour.stops
  // ableiten + Vol/Gewicht aus packages (per-package, inkl. Mehrfach-
  // Quantity). Verwendet dieselben Helper wie FV-Page.
  const ldmShipments = useMemo(() => {
    const stops = tourQ.data?.stops ?? [];
    return stops.map((s) => ({
      ldm: Number(s.shipment.ldm) || 0,
      isStackable: (s.shipment.shipment_package_items ?? []).every(
        (it) => it.stackable !== false,
      ),
    }));
  }, [tourQ.data?.stops]);

  const ldmMetrics = useMemo(
    () => computeStackingLdmMetrics(capacity.maxLdm, ldmShipments),
    [capacity.maxLdm, ldmShipments],
  );

  const cargoVolM3 = useMemo(() => {
    let v = 0;
    for (const p of packages) {
      v += p.lengthCm * p.widthCm * p.heightCm;
    }
    return v / 1e6;
  }, [packages]);

  const trailerVolM3 = useMemo(() => {
    return (capacity.lengthCm * capacity.widthCm * capacity.heightCm) / 1e6;
  }, [capacity.lengthCm, capacity.widthCm, capacity.heightCm]);

  const volUtil = useMemo(() => {
    if (trailerVolM3 <= 0) return 0;
    return (cargoVolM3 / trailerVolM3) * 100;
  }, [cargoVolM3, trailerVolM3]);

  const totalWeightKg = useMemo(() => {
    let w = 0;
    for (const p of packages) {
      w += Number(p.weightKg) || 0;
    }
    return w;
  }, [packages]);

  const weightUtil = useMemo(() => {
    if (capacity.maxWeightKg <= 0) return null;
    return (totalWeightKg / capacity.maxWeightKg) * 100;
  }, [totalWeightKg, capacity.maxWeightKg]);

  // O-2: Carlos-Klaerung — Ueberladen = Vol > 100% ODER Gewicht > 100%.
  // ldm (Boden + Effektiv) ist Info, kein Trigger mehr (NV stapelt
  // ohnehin alles Moegliche, Vol+Gewicht sind die echten Constraints).
  const isOverloaded =
    volUtil > 100 || (weightUtil != null && weightUtil > 100);

  // F1.a/S Toast-Helper (Pattern aus FV-Page) — 2.5s auto-dismiss.
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(
    null,
  );
  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 2500);
  }

  const persistMut = useMutation({
    mutationFn: async (vars: {
      itemId: string;
      posXCm: number;
      posYCm: number;
      posZCm: number;
      rotationDeg?: number;
    }) => {
      const body: Record<string, number> = {
        posXCm: Math.round(vars.posXCm),
        posYCm: Math.round(vars.posYCm),
        posZCm: Math.round(vars.posZCm),
      };
      if (vars.rotationDeg !== undefined)
        body.rotationDeg = Math.round(vars.rotationDeg);
      await api.patch(
        `/loading/package-item/${vars.itemId}/position`,
        body,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nv-loading', tourId] });
      showToast('Position gespeichert');
    },
    onError: () => {
      showToast('Speichern fehlgeschlagen', 'err');
    },
  });

  const handlePosition = (
    id: string,
    posXCm: number,
    posYCm: number,
    posZCm: number,
    rotationDeg?: number,
  ) => {
    if (!id) return;
    // Synth-Filter: quantity-Klone q>0 haben kein dbItemId und sind
    // BE-seitig nicht persistierbar (1 Row pro line_index).
    const pkg = packages.find((p) => p.id === id);
    if (!pkg || !pkg.dbItemId) return;
    persistMut.mutate({
      itemId: pkg.dbItemId,
      posXCm,
      posYCm,
      posZCm,
      rotationDeg,
    });
  };

  // B-2.1 NV Insert-Mode Drop-Cascade.
  // NV hat keinen placePackages-Helper → einfache posY-Shift-Heuristik:
  // alle Items mit posY >= target.posY shiften um draggedLengthCm + 5cm.
  // (Reicht für single-row Layouts; mehrreihige Trailers brauchen
  // späteren Re-Pack-Helper — Backlog B-2.2.)
  const handleNvInsertAt = (
    draggedId: string,
    targetId: string | null,
    dropPosY: number,
  ) => {
    // Synth-Filter via dbItemId (Quantity-Klone q>0 sind nicht
    // persistierbar — sie haben kein dbItemId).
    const dragged = renderedPackages.find((p) => p.id === draggedId);
    if (!dragged || !dragged.dbItemId) {
      insertMode.cancel();
      return;
    }
    const t =
      (targetId &&
        renderedPackages.find((p) => p.id === targetId && p.id !== draggedId)) ||
      renderedPackages
        .filter((p) => p.id !== draggedId)
        .reduce<typeof renderedPackages[number] | null>((best, p) => {
          const center = p.posY + p.lengthCm / 2;
          const dist = Math.abs(center - dropPosY);
          if (!best) return p;
          const bCenter = best.posY + best.lengthCm / 2;
          return dist < Math.abs(bCenter - dropPosY) ? p : best;
        }, null);
    if (!t || t.id === draggedId) {
      handlePosition(draggedId, 0, dropPosY, 0);
      insertMode.cancel();
      return;
    }
    // B-2.2: shared Helper für Cascade-Shift mit row-wrap.
    // BUG-F-PACK: unplaced ausschliessen — Phantom-Pos (0/0/0) wuerde
    // Cascade-Shift verfaelschen. Synth-Klone (kein dbItemId) raus.
    const actions = planNvInsertShift({
      packages: renderedPackages
        .filter((p) => !!p.dbItemId)
        .map((p) => ({
          id: p.id,
          posX: p.posX,
          posY: p.posY,
          posZ: p.posZ,
          lengthCm: p.lengthCm,
          widthCm: p.widthCm,
        })),
      draggedId,
      targetId: t.id,
      trailerLengthCm: vehicle.lengthCm,
      trailerWidthCm: vehicle.widthCm,
    });
    void (async () => {
      try {
        for (const a of actions) {
          await api.patch(`/loading/package-item/${a.itemId}/position`, {
            posXCm: a.posXCm,
            posYCm: a.posYCm,
            posZCm: a.posZCm,
          });
        }
        await qc.invalidateQueries({ queryKey: ['nv-loading', tourId] });
      } catch {
        /* silent — invalidate korrigiert UI bei Error */
      }
      insertMode.cancel();
    })();
  };

  const code = tourQ.data?.nv_stamm_tour?.code ?? '—';
  const datum = tourQ.data?.datum
    ? new Date(tourQ.data.datum).toISOString().slice(0, 10)
    : '';

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* F1.a/S Toast */}
      {toast && (
        <div
          className={
            'fixed top-4 right-4 z-50 rounded-lg shadow-lg px-4 py-2 text-sm border ' +
            (toast.type === 'err'
              ? 'bg-red-50 border-red-300 text-red-800'
              : 'bg-emerald-50 border-emerald-300 text-emerald-800')
          }
        >
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b">
        <div className="font-semibold text-gray-800">
          NV-Beladeplan
          <span className="ml-2 font-mono text-sm text-gray-600">
            {code}
          </span>
          {datum && (
            <span className="ml-2 text-xs text-gray-500">{datum}</span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          ·{' '}
          {(tourQ.data?.fahrzeug_typ ?? '').trim() ||
            (tourQ.data?.subunternehmer?.fahrzeug_typ ?? '').trim() ||
            vehicle.type}
          {' '}({(capacity.lengthCm / 100).toFixed(1)}×
          {(capacity.widthCm / 100).toFixed(2)}×
          {(capacity.heightCm / 100).toFixed(2)} m)
        </span>
        <span className="ml-auto text-xs text-gray-400">
          {packages.length} Packstücke
        </span>
        <button
          onClick={() => window.close()}
          className="text-gray-500 hover:text-gray-800"
          title="Schließen"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 p-3 overflow-auto">
        <div className="mb-3">
          <InsertModeBanner
            active={insertMode.active}
            onCancel={insertMode.cancel}
          />
        </div>
        {tourQ.isLoading && (
          <div className="text-sm text-gray-400">Lädt Tour…</div>
        )}
        {!tourQ.isLoading && !tourQ.data && (
          <div className="text-sm text-gray-400">Tour nicht gefunden.</div>
        )}
        {tourQ.data && (
          <div className="space-y-3">
            {/* F1.a/K Kennzahlen-Bar — O-2: Vol+Gewicht ist die
                massgebliche Auslastung (rot-Trigger). Effektiv-ldm
                + Boden bleiben als Info, KEIN rot mehr. */}
            <div className="flex items-center gap-4 bg-gray-100 p-2 rounded border border-gray-200 text-sm flex-wrap">
              <span
                className={
                  volUtil > 100
                    ? 'text-red-600 font-bold'
                    : 'text-gray-800 font-semibold'
                }
                title="Volumen-Auslastung — massgeblicher Constraint."
              >
                Vol: {volUtil.toFixed(0)}%
              </span>
              <span
                className={
                  weightUtil != null && weightUtil > 100
                    ? 'text-red-600 font-bold'
                    : 'text-gray-800 font-semibold'
                }
                title="Gewichts-Auslastung — massgeblicher Constraint."
              >
                Gew: {weightUtil?.toFixed(0) ?? '—'}%
              </span>
              <span className="text-gray-400">·</span>
              <span
                className="text-gray-500 text-xs"
                title="Effektive Lademeter (stapelbar zählt mit ½) — Info."
              >
                Effektiv-ldm: {ldmMetrics.effectivePct.toFixed(0)}%
              </span>
              <span
                className="text-gray-500 text-xs"
                title="Boden-Lademeter (ohne Stapelvorteil) — Info."
              >
                Boden: {ldmMetrics.floorPct.toFixed(0)}%
              </span>
            </div>

            {/* F1.a/L Lademeter-Detail — O-2: Info-Anzeige, KEIN
                rot-Trigger mehr (Bars bleiben emerald/blau, auch wenn
                pct > 100). Massgeblich ist Vol+Gewicht. */}
            <div className="text-gray-800 leading-relaxed bg-blue-50 p-3 rounded border border-blue-200 space-y-2 text-sm">
              <div className="font-medium text-gray-900">Lademeter (Info)</div>
              <div className="grid sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                <div>
                  <span className="text-gray-600">Effektiv (mit Stapelung):</span>{' '}
                  <strong>
                    {ldmMetrics.effectiveUsed.toFixed(2)} / {ldmMetrics.maxLdm.toFixed(1)} ldm
                  </strong>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{ width: `${Math.min(100, ldmMetrics.effectivePct)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500">
                    Stapelbar zählt mit Faktor ½. Zusätzlich frei:{' '}
                    <strong>{ldmMetrics.freeEffectiveLdm.toFixed(2)} ldm</strong>
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Boden (ohne Stapelvorteil):</span>{' '}
                  <strong>
                    {ldmMetrics.floorUsed.toFixed(2)} / {ldmMetrics.maxLdm.toFixed(1)} ldm
                  </strong>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#1e40af]"
                      style={{ width: `${Math.min(100, ldmMetrics.floorPct)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500">
                    Stapelfreiheit:{' '}
                    <strong>{ldmMetrics.freeFloorLdm.toFixed(2)} ldm</strong>
                  </span>
                </div>
              </div>
              <div className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                Stapel-Potenzial: <strong>{ldmMetrics.headroomLdm.toFixed(2)} ldm</strong>{' '}
                — Summe der Hälfte aller stapelbaren Sendungen (Faktor 2 auf den
                Boden-Lademeter). Packstücke werden in der Tour-Reihenfolge
                automatisch gestapelt, wenn Höhe und Stapelbarkeit passen.
              </div>
            </div>

            {/* F1.a/N Vol/Gewicht-Mini-Stats */}
            <div className="text-gray-700 bg-slate-50 p-2 rounded border border-slate-200 text-xs sm:text-sm">
              📐 {cargoVolM3.toFixed(1)} m³ / {trailerVolM3.toFixed(1)} m³ (
              {volUtil.toFixed(0)}% Volumen) · ⚖{' '}
              {totalWeightKg.toLocaleString('de-DE')} kg /{' '}
              {capacity.maxWeightKg.toLocaleString('de-DE')} kg (
              {weightUtil?.toFixed(0) ?? '—'}% Gewicht)
              {capacity.source === 'fallback-unknown' && (
                <span
                  className="ml-2 inline-block text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-300"
                  title="Fahrzeug-Typ in Stammdaten nicht erkannt — Default-Kapazitaet verwendet."
                >
                  ⚠ Kapazitaet geschaetzt
                </span>
              )}
            </div>

            {/* F1.a/M Overload-Warning — F1.a-Fix-2: nur Effektiv/Vol/
                Gew triggern. Boden ist Diagnose, nicht Ueberlaufs-
                Anzeichen (NV stapelt). */}
            {isOverloaded && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 space-y-1">
                <div className="font-medium">⚠ Überladung für gewähltes Fahrzeug</div>
                {volUtil > 100 && (
                  <div>
                    Volumen: {cargoVolM3.toFixed(1)} / {trailerVolM3.toFixed(1)} m³
                  </div>
                )}
                {weightUtil != null && weightUtil > 100 && (
                  <div>
                    Gewicht: {totalWeightKg.toLocaleString('de-DE')} /{' '}
                    {capacity.maxWeightKg.toLocaleString('de-DE')} kg
                  </div>
                )}
              </div>
            )}

            {/* BUG-F-PACK Banner — N Pakete physisch nicht plazierbar. */}
            {unplacedCount > 0 && (
              <div className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded p-2">
                <div className="font-medium">
                  ⚠ {unplacedCount} {unplacedCount === 1 ? 'Palette passt' : 'Paletten passen'} physisch nicht in den Trailer
                </div>
                <div className="text-xs">
                  Größeres Fahrzeug wählen oder Tour verkleinern. Die nicht
                  plazierbaren Pakete werden im 3D-Layout nicht angezeigt.
                </div>
              </div>
            )}

            {/* 3D-Canvas — F1.a-Fix-2: Trailer-Box aus capacity (echte
                Geometrie), nicht aus getVehicleDims-Koffer-7t-Fallback. */}
            <LoadingPlan3D
              vehicle={{
                lengthCm: capacity.lengthCm,
                widthCm: capacity.widthCm,
                heightCm: capacity.heightCm,
              }}
              packages={renderedPackages}
              onPositionChange={handlePosition}
              insertMode={insertMode.active}
              onInsertAt={handleNvInsertAt}
              onPackageContextMenu={(pkgId, x, y) => {
                const pkg = renderedPackages.find((p) => p.id === pkgId);
                if (!pkg) return;
                setCtxMenu({
                  pkgId,
                  shipmentId:
                    (pkg as { shipmentId?: string }).shipmentId ?? '',
                  x,
                  y,
                });
              }}
            />

            {/* F1.a/O Achslast — trailerLength_m aus capacity (echte
                Box-Laenge, sonst falsche Schwerpunkt-Berechnung).
                BUG-F-PACK: nur renderedPackages (unplaced sitzen bei
                0/0/0 und wuerden Schwerpunkt verfaelschen). */}
            <AxleLoadPanel
              packages={renderedPackages.map((p) => ({
                posY: p.posY,
                weightKg: Number(p.weightKg) || 0,
              }))}
              vehicleType={vehicle.type}
              trailerLength_m={capacity.lengthCm / 100}
              groundedCount={renderedPackages.filter((p) => p.posZ < 1e-6).length}
              totalCount={renderedPackages.length}
            />
          </div>
        )}
      </div>
      {ctxMenu &&
        (() => {
          const items: ContextMenuItem[] = [
            {
              label: 'Position zurücksetzen',
              icon: <RotateCcw size={12} />,
              onClick: () => {
                void api
                  .patch(`/loading/package-item/${ctxMenu.pkgId}/position`, {
                    posXCm: null,
                    posYCm: null,
                    posZCm: null,
                  })
                  .then(() =>
                    qc.invalidateQueries({ queryKey: ['nv-loading', tourId] }),
                  );
              },
            },
            {
              label: 'Repack-Optimal',
              icon: <RotateCcw size={12} />,
              onClick: () => {
                if (
                  !window.confirm(
                    'Alle Positionen zurücksetzen + Auto-Placement?',
                  )
                )
                  return;
                void (async () => {
                  for (const p of packages) {
                    if (!p.dbItemId) continue;
                    await api.patch(
                      `/loading/package-item/${p.dbItemId}/position`,
                      { posXCm: null, posYCm: null, posZCm: null },
                    );
                  }
                  await qc.invalidateQueries({
                    queryKey: ['nv-loading', tourId],
                  });
                })();
              },
              separator: true,
            },
            {
              label: 'Sendung aus Tour entfernen',
              icon: <Trash2 size={12} />,
              danger: true,
              disabled: !ctxMenu.shipmentId,
              onClick: () => {
                // NV-RC.1: shipment-id → stop-id lookup via tour.stops.
                const stop = tourQ.data?.stops.find(
                  (s) => s.shipment.id === ctxMenu.shipmentId,
                );
                if (!stop) {
                  window.alert('Stop nicht gefunden — kann nicht entfernen.');
                  return;
                }
                const shipmentNr = stop.shipment.shipment_number ?? '';
                if (
                  !window.confirm(
                    `Sendung ${shipmentNr} komplett aus der Tour entfernen?`,
                  )
                )
                  return;
                void (async () => {
                  try {
                    await api.delete(
                      `/nv-touren/${tourId}/stops/${stop.id}`,
                    );
                    await qc.invalidateQueries({
                      queryKey: ['nv-loading', tourId],
                    });
                    await qc.invalidateQueries({
                      queryKey: ['nv-tour-detail', tourId],
                    });
                  } catch (e: any) {
                    window.alert(
                      `Entfernen fehlgeschlagen (${e?.response?.status ?? '?'}).`,
                    );
                  }
                })();
              },
            },
          ];
          return (
            <ContextMenu
              x={ctxMenu.x}
              y={ctxMenu.y}
              items={items}
              onClose={() => setCtxMenu(null)}
            />
          );
        })()}
    </div>
  );
}

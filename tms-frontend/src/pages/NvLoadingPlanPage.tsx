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
import LoadingPlan3D, {
  type Plan3DPackage,
} from '../components/LoadingPlan3D';
import AxleLoadPanel from '../components/AxleLoadPanel';
import {
  getVehicleDims,
  resolveFahrzeugTyp,
  resolveVehicleCapacity,
} from '../lib/vehicleTypes';
import { computeStackingLdmMetrics } from '../lib/loadingLdm';

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
}

export interface NvLoadingDetail {
  id: string;
  datum: string;
  status: string;
  fahrzeug_typ?: string | null;
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
    shipment: NvShipment;
  }>;
}

// SHIPMENT_COLORS — gleicher Pool wie FV-Page für Wiedererkennbarkeit.
const SHIPMENT_COLORS = [
  '#ef4444', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e',
];

/**
 * P0-6.3 BUG 1: Row-Bin-Pack Auto-Placer.
 * Respektiert Trailer-Bounds. DB-Position wird für q=0 honoriert
 * wenn vorhanden, sonst layout-packed.
 *
 * Algorithmus:
 *   - Pack-Cursor in Reihen entlang Trailer-Länge (posY)
 *   - Items side-by-side entlang Trailer-Breite (posX)
 *   - Row wechselt wenn nächstes Item posX+widthCm > trailerWidth
 *   - posY-Overflow: package landet bei posY=0 (UI zeigt's
 *     dann am Vorne, user kann via Drag aussortieren)
 */
/**
 * S-2b: Export für LoadingPlanPanel (workspace-Panel) Wiederverwendung.
 * Pure-Function — gleiche Logik die diese Page intern nutzt.
 */
export function flattenPackages(
  tour: NvLoadingDetail | null,
  trailerWidthCm: number,
  trailerLengthCm: number,
): Plan3DPackage[] {
  if (!tour) return [];
  const out: Plan3DPackage[] = [];
  let cursorY = 0;
  let cursorX = 0;
  let rowMaxLength = 0;
  // F1.a/P: Pattern-Align mit FV — shipIdx-Map per-Sendung statt per-
  // Stop. NV hat zwar 1:1 stop:shipment, aber so wird die Farbe gegen
  // doppelt vorkommende shipment.id stabil + Code-Konvention einheitlich.
  const shipIdxMap = new Map<string, number>();
  for (const stop of tour.stops ?? []) {
    if (!shipIdxMap.has(stop.shipment.id)) {
      shipIdxMap.set(stop.shipment.id, shipIdxMap.size);
    }
  }
  const placeAuto = (
    w: number,
    l: number,
  ): { posX: number; posY: number } => {
    // Neue Reihe wenn aktueller Cursor nicht mehr passt
    if (cursorX + w > trailerWidthCm + 1e-6) {
      cursorY += rowMaxLength + 5;
      cursorX = 0;
      rowMaxLength = 0;
    }
    const posX = cursorX;
    const posY = cursorY;
    cursorX += w + 5;
    if (l > rowMaxLength) rowMaxLength = l;
    return { posX, posY };
  };
  for (const stop of tour.stops ?? []) {
    const ship = stop.shipment;
    const color =
      SHIPMENT_COLORS[
        (shipIdxMap.get(ship.id) ?? 0) % SHIPMENT_COLORS.length
      ];
    const items = ship.shipment_package_items ?? [];
    const shipFullyStackable = items.every((it) => it.stackable !== false);
    for (const it of items) {
      const qty = Math.max(1, Number(it.quantity ?? 1));
      const w = Number(it.width_cm) || 0;
      const l = Number(it.length_cm) || 0;
      const h = Number(it.height_cm) || 0;
      const dbPosX = it.pos_x_cm == null ? null : Number(it.pos_x_cm);
      const dbPosY = it.pos_y_cm == null ? null : Number(it.pos_y_cm);
      const dbPosZ = it.pos_z_cm == null ? null : Number(it.pos_z_cm);
      const hasDbPos = dbPosX != null && dbPosY != null;
      for (let q = 0; q < qty; q++) {
        const useDb = q === 0 && hasDbPos;
        let posX: number;
        let posY: number;
        let posZ: number;
        if (useDb) {
          posX = dbPosX as number;
          posY = dbPosY as number;
          posZ = dbPosZ != null ? dbPosZ : 0;
        } else {
          const auto = placeAuto(w, l);
          posX = auto.posX;
          posY = auto.posY;
          posZ = 0;
        }
        const synthSuffix = qty === 1 ? '' : `:pkg:${q}`;
        out.push({
          id: it.id + synthSuffix,
          lengthCm: l,
          widthCm: w,
          heightCm: h,
          posX,
          posY,
          posZ,
          weightKg: Number(it.weight_kg) || 0,
          color,
          isStackable: shipFullyStackable && it.stackable !== false,
          rotationDeg: Number(it.rotation_deg ?? 0) || 0,
        });
      }
    }
  }
  // PosY-Overflow-Warning: falls cursorY weit über trailer hinausragt
  // bekommt User es trotzdem zu sehen (UI zeigt outside-Items im
  // Render-Bounds, kann via Drag aussortiert werden).
  void trailerLengthCm;
  return out;
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
      ),
    [tourQ.data, capacity.widthCm, capacity.lengthCm],
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

  // F1.a-Fix-2: Carlos-Klärung — NV stapelt alles Mögliche, daher ist
  // EFFEKTIVE ldm die maßgebliche Auslastung. Boden-ldm bleibt als
  // Diagnose-Info erhalten (rote Boden-Anzeige bei >100% war frueher
  // false-positive bei stapelbarer Ladung).
  const isOverloaded =
    ldmMetrics.effectivePct > 100 ||
    volUtil > 100 ||
    (weightUtil != null && weightUtil > 100);

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
    if (!id || id.includes(':pkg:')) {
      // synth-IDs aus quantity-Expansion können nicht persistiert werden
      // (Backend kennt nur 1 item-Row pro line_index). Skip.
      return;
    }
    persistMut.mutate({ itemId: id, posXCm, posYCm, posZCm, rotationDeg });
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
    if (!draggedId || draggedId.includes(':pkg:')) {
      insertMode.cancel();
      return;
    }
    const dragged = packages.find((p) => p.id === draggedId);
    if (!dragged) {
      insertMode.cancel();
      return;
    }
    const t =
      (targetId &&
        packages.find((p) => p.id === targetId && p.id !== draggedId)) ||
      packages
        .filter((p) => p.id !== draggedId)
        .reduce<typeof packages[number] | null>((best, p) => {
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
    const actions = planNvInsertShift({
      packages: packages
        .filter((p) => !p.id.includes(':pkg:'))
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
            {/* F1.a/K Kennzahlen-Bar — F1.a-Fix-2: Effektiv ist Haupt-
                Auslastung (NV stapelt). Boden bleibt als sekundaere
                Info, nicht mehr rot. */}
            <div className="flex items-center gap-4 bg-gray-100 p-2 rounded border border-gray-200 text-sm flex-wrap">
              <span
                className={
                  ldmMetrics.effectivePct > 100
                    ? 'text-red-600 font-bold'
                    : 'text-emerald-800 font-semibold'
                }
                title="Effektive Lademeter nach Carlos-Stack-Rule (stapelbar zaehlt mit Faktor ½). Maßgebliche Auslastung."
              >
                Effektiv-ldm: {ldmMetrics.effectivePct.toFixed(0)}%
              </span>
              <span
                className="text-gray-600 text-xs"
                title="Ohne Stapelvorteil — nur Diagnose; ueberladen wird ueber Effektiv gemessen."
              >
                (davon Boden: {ldmMetrics.floorPct.toFixed(0)}%)
              </span>
              <span
                className={
                  volUtil > 100 ? 'text-red-600 font-bold' : 'text-gray-700'
                }
              >
                Vol: {volUtil.toFixed(0)}%
              </span>
              <span
                className={
                  weightUtil != null && weightUtil > 100
                    ? 'text-red-600 font-bold'
                    : 'text-gray-700'
                }
              >
                Gew: {weightUtil?.toFixed(0) ?? '—'}%
              </span>
            </div>

            {/* F1.a/L Lademeter-Detail — F1.a-Fix-2: Effektiv links
                als maßgebliche Spalte, Boden rechts als Diagnose. */}
            <div className="text-gray-800 leading-relaxed bg-blue-50 p-3 rounded border border-blue-200 space-y-2 text-sm">
              <div className="font-medium text-gray-900">Lademeter</div>
              <div className="grid sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                <div>
                  <span className="text-gray-600">Effektiv (mit Stapelung):</span>{' '}
                  <strong>
                    {ldmMetrics.effectiveUsed.toFixed(2)} / {ldmMetrics.maxLdm.toFixed(1)} ldm
                  </strong>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        ldmMetrics.effectivePct > 100 ? 'bg-red-500' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, ldmMetrics.effectivePct)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500">
                    Maßgebliche Auslastung — stapelbar zählt mit Faktor ½.
                    Zusätzlich frei:{' '}
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
                    Diagnose-Info. Stapelfreiheit:{' '}
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
                {ldmMetrics.effectivePct > 100 && (
                  <div>
                    Effektiv-ldm: {ldmMetrics.effectiveUsed.toFixed(1)} /{' '}
                    {ldmMetrics.maxLdm.toFixed(1)} ldm
                  </div>
                )}
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

            {/* 3D-Canvas — F1.a-Fix-2: Trailer-Box aus capacity (echte
                Geometrie), nicht aus getVehicleDims-Koffer-7t-Fallback. */}
            <LoadingPlan3D
              vehicle={{
                lengthCm: capacity.lengthCm,
                widthCm: capacity.widthCm,
                heightCm: capacity.heightCm,
              }}
              packages={packages}
              onPositionChange={handlePosition}
              insertMode={insertMode.active}
              onInsertAt={handleNvInsertAt}
              onPackageContextMenu={(pkgId, x, y) => {
                const pkg = packages.find((p) => p.id === pkgId);
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
                Box-Laenge, sonst falsche Schwerpunkt-Berechnung). */}
            <AxleLoadPanel
              packages={packages.map((p) => ({
                posY: p.posY,
                weightKg: Number(p.weightKg) || 0,
              }))}
              vehicleType={vehicle.type}
              trailerLength_m={capacity.lengthCm / 100}
              groundedCount={packages.filter((p) => p.posZ < 1e-6).length}
              totalCount={packages.length}
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
                    if (p.id.includes(':pkg:')) continue;
                    await api.patch(`/loading/package-item/${p.id}/position`, {
                      posXCm: null,
                      posYCm: null,
                      posZCm: null,
                    });
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

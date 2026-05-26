import { useMemo, useReducer, useState } from 'react';
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
import { resolveVehicleCapacity } from '../lib/vehicleTypes';
import { computeStackingLdmMetrics } from '../lib/loadingLdm';
import { placePackages, sortPackagesForOptimalPack, type SharedPlacedPackage } from '../lib/loadingShared';
import { nvExpandPackages, type NvExpandedPackage } from '../lib/nvExpand';
// Beladeplan/Hof-Verschmelzung Schritt 1: Hof-Liste rechts.
import { NV_DRAG_SHIPMENT_MIME } from './NvLoadingPlanHofPanel';
// Schritt 4: rechte Spalte mit 3 Sektionen (Auf Tour + Parkplatz + Hof).
import NvLoadingPlanRightPanel from './NvLoadingPlanRightPanel';
// Beladeplan/Hof-Verschmelzung Schritt 2: Sandbox-Fundament.
import {
  initialSandboxState,
  sandboxReducer,
  sandboxChangeCount,
  isSandboxEmpty,
} from '../lib/nvLoadingPlanSandbox';

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

/**
 * Schritt 3: minimaler Pool-Sendung-Typ fuer Drag-IN.
 * Subset von /nv-touren/:id/nearby-shipments — nur Felder, die fuer
 * den synthetischen Stop in patchedTour gebraucht werden.
 */
interface NearbyShipmentLite {
  id: string;
  shipment_number: string;
  weight_kg: number | null;
  ldm: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  package_items: Array<{
    id: string;
    length_cm: number | null;
    width_cm: number | null;
    height_cm: number | null;
    weight_kg: number | null;
    quantity: number | null;
    stackable: boolean;
  }>;
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
    /** dbItemId = persist-fähige Package-ID. Bei Quantity-Klonen
     *  (q>0) leer → ContextMenu-Actions disabled. Schritt 2:
     *  Sandbox-Reducer indexiert by dbItemId. */
    dbItemId?: string;
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

  // Schritt 3: nearby-Pool (gleicher Query-Key wie HofPanel → dedupe
  // via tanstack-query). Wird gebraucht damit patchedTour fuer
  // inserted-Sendungen die package_items aus dem Pool ziehen kann.
  const nearbyQ = useQuery<NearbyShipmentLite[]>({
    queryKey: ['yard-nv', tourId, 20],
    queryFn: async () => {
      if (!tourId) return [];
      const { data } = await api.get<NearbyShipmentLite[]>(
        `/nv-touren/${tourId}/nearby-shipments`,
      );
      return data;
    },
    enabled: !!tourId,
    staleTime: 30_000,
  });

  // F1.a-Fix + BUG-V-Fix: Kapazitaet ist die EINZIGE Dim-Quelle —
  // resolveVehicleCapacity handhabt Sub-Stammdaten + Tonnen-Parsing
  // konsistent (vehicle = getVehicleDims wurde entfernt; faellt sonst
  // fuer "12T"/"18T"/"7_5T" auf Koffer 7t/6.2m zurueck → Falsch-Dims).
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

  // Schritt 2: Sandbox-Reducer. Alle Drag/Eject-Aktionen schreiben
  // hier rein, NICHT direkt ans BE. "Übernehmen"-Button persistiert
  // den State. Bei Unmount → React droppt State (Reset by design).
  const [sandbox, sandboxDispatch] = useReducer(
    sandboxReducer,
    initialSandboxState,
  );

  // Fix-C: Sandbox-Overrides werden VOR flattenPackages angewandt
  // (statt im renderedPackages-Mapper). Hintergrund: Quantity-Klone
  // q>0 haben dbItemId=undefined (nvExpand L142) und werden via
  // Phase-2 placePackages um die q===0-Position herum auto-platziert.
  // Override im Mapper traf nur q===0 → q>0 blieben an alten Positionen
  // stehen ("verschachtelt" auf Touren mit Mehrfach-Paletten wie N050).
  // Lösung: positionOverrides ersetzen pos_x_cm/y/z auf der q===0-Row
  // VOR flattenPackages → Phase-2 plaziert Klone wieder mit auto-Slot.
  // Ejected Shipments werden hier ebenfalls rausgefiltert.
  const patchedTour = useMemo<NvLoadingDetail | null>(() => {
    if (!tourQ.data) return null;
    if (
      sandbox.positionOverrides.size === 0 &&
      sandbox.ejectedShipmentIds.size === 0 &&
      sandbox.insertedShipmentIds.size === 0
    ) {
      return tourQ.data;
    }
    const baseStops = tourQ.data.stops
      .filter((s) => !sandbox.ejectedShipmentIds.has(s.shipment.id))
      .map((s) => ({
        ...s,
        shipment: {
          ...s.shipment,
          shipment_package_items: (
            s.shipment.shipment_package_items ?? []
          ).map((it) => {
            const override = sandbox.positionOverrides.get(it.id);
            if (!override) return it;
            return {
              ...it,
              pos_x_cm: Math.round(override.posXCm),
              pos_y_cm: Math.round(override.posYCm),
              pos_z_cm: Math.round(override.posZCm),
              rotation_deg:
                override.rotationDeg !== undefined
                  ? Math.round(override.rotationDeg)
                  : (it.rotation_deg ?? null),
            };
          }),
        },
      }));
    // Schritt 3: synthetische Stops fuer inserted-Sendungen.
    // package_items aus nearbyPool ziehen. Stop-IDs mit "sandbox-insert-"
    // praefixiert — niemals ans BE gesendet (Übernehmen-Mut ruft
    // POST /stops mit shipment_id, BE erzeugt echten Stop).
    // Regel #2: GANZE Sendung (alle package_items zusammen) einfügen.
    const nearbyById = new Map(
      (nearbyQ.data ?? []).map((n) => [n.id, n]),
    );
    const insertedStops: NvLoadingDetail['stops'] = [];
    const startPos =
      baseStops.reduce((m, s) => Math.max(m, s.position), 0) + 1;
    let posOffset = 0;
    for (const shipmentId of sandbox.insertedShipmentIds) {
      const lite = nearbyById.get(shipmentId);
      if (!lite) continue;
      const items: NvPackageItem[] = lite.package_items.map((it, idx) => ({
        id: it.id,
        line_index: idx + 1,
        quantity: it.quantity ?? 1,
        // 0-Fallback bei fehlenden Dims → placePackages dropt sie
        // mit pw/pl/ph<=0 (gleicher Effekt wie unplaced).
        length_cm: Number(it.length_cm ?? 0),
        width_cm: Number(it.width_cm ?? 0),
        height_cm: Number(it.height_cm ?? 0),
        weight_kg: Number(it.weight_kg ?? 0),
        stackable: it.stackable !== false,
        pos_x_cm: null,
        pos_y_cm: null,
        pos_z_cm: null,
        rotation_deg: 0,
      }));
      insertedStops.push({
        id: `sandbox-insert-${shipmentId}`,
        position: startPos + posOffset,
        shipment: {
          id: shipmentId,
          shipment_number: lite.shipment_number,
          weight_kg: lite.weight_kg ?? null,
          ldm: lite.ldm ?? null,
          length_cm: lite.length_cm ?? null,
          width_cm: lite.width_cm ?? null,
          height_cm: lite.height_cm ?? null,
          shipment_package_items: items,
        },
      });
      posOffset += 1;
    }
    return {
      ...tourQ.data,
      stops: [...baseStops, ...insertedStops],
    };
  }, [tourQ.data, sandbox, nearbyQ.data]);

  const packages = useMemo(
    () =>
      flattenPackages(
        patchedTour,
        capacity.widthCm,
        capacity.lengthCm,
        capacity.heightCm,
      ),
    [
      patchedTour,
      capacity.widthCm,
      capacity.lengthCm,
      capacity.heightCm,
    ],
  );

  // BUG-F-PACK: Render/Drag-Target = nur platzierte Pakete; unplaced
  // werden im Banner gezaehlt, aber nicht ins 3D-Mesh gereicht.
  // Fix-C: Sandbox-Anwendung wandert in patchedTour (siehe oben) →
  // hier wieder simpel wie pre-Schritt-2. Quantity-Klone werden korrekt
  // via Phase-2 placePackages um die neue q===0-Position auto-platziert.
  const renderedPackages = useMemo(
    () => packages.filter((p) => !p.unplaced),
    [packages],
  );
  // Regel #2: betroffen = Sendung mit MIND. 1 unplaced Packstück.
  // Aggregation auf shipmentId — sonst meldet der Banner Packstücke
  // (was bei q>1-Klonen die echte Sendungs-Zahl ueberzaehlt).
  const unplacedShipmentCount = useMemo(
    () =>
      new Set(
        packages.filter((p) => p.unplaced).map((p) => p.shipmentId),
      ).size,
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

  // Schritt 2+3: Übernehmen-Mutation — einziger DB-Write-Pfad.
  // Reihenfolge stabil:
  //   1. Position-Overrides (PATCH) — vor Eject, sonst 404 auf ge-
  //      loeschten Items.
  //   2. Inserted Stops (POST)      — vor Eject, damit eine Re-Plan-
  //      Tour beide hat, der Insert nicht durch BE-Capacity-Check
  //      blockiert wird (Eject macht erst danach Platz im Plan,
  //      aber BE-Capacity ist je nach Tour-State eh nur Hinweis).
  //   3. Ejected Stops (DELETE)      — last, da destruktiv.
  // Sammelt Fehler, throwt am Ende; Sandbox NUR bei voll-Erfolg
  // geleert.
  const uebernehmenMut = useMutation({
    mutationFn: async () => {
      const errors: string[] = [];
      // 1. Position-Overrides
      for (const [dbItemId, posOv] of sandbox.positionOverrides) {
        const body: Record<string, number> = {
          posXCm: Math.round(posOv.posXCm),
          posYCm: Math.round(posOv.posYCm),
          posZCm: Math.round(posOv.posZCm),
        };
        if (posOv.rotationDeg !== undefined) {
          body.rotationDeg = Math.round(posOv.rotationDeg);
        }
        try {
          await api.patch(
            `/loading/package-item/${dbItemId}/position`,
            body,
          );
        } catch (e: unknown) {
          const status =
            (e as { response?: { status?: number } })?.response?.status ?? '?';
          errors.push(`Position ${dbItemId}: ${status}`);
        }
      }
      // 2. Inserted Shipments — POST /nv-touren/:id/stops {shipment_id}.
      // BE-Endpoint (CreateNvTourStopDto) erzeugt einen Stop am Ende
      // der Tour (position wird automatisch vergeben).
      for (const shipmentId of sandbox.insertedShipmentIds) {
        try {
          await api.post(`/nv-touren/${tourId}/stops`, {
            shipment_id: shipmentId,
          });
        } catch (e: unknown) {
          const status =
            (e as { response?: { status?: number } })?.response?.status ?? '?';
          errors.push(`Insert ${shipmentId}: ${status}`);
        }
      }
      // 3. Ejected Stops — DELETE.
      for (const shipmentId of sandbox.ejectedShipmentIds) {
        const stop = tourQ.data?.stops.find(
          (s) => s.shipment.id === shipmentId,
        );
        if (!stop) {
          errors.push(`Sendung ${shipmentId}: Stop nicht gefunden`);
          continue;
        }
        try {
          await api.delete(`/nv-touren/${tourId}/stops/${stop.id}`);
        } catch (e: unknown) {
          const status =
            (e as { response?: { status?: number } })?.response?.status ?? '?';
          errors.push(`Eject ${shipmentId}: ${status}`);
        }
      }
      if (errors.length) throw new Error(errors.join('; '));
    },
    onSuccess: () => {
      sandboxDispatch({ type: 'clearAll' });
      qc.invalidateQueries({ queryKey: ['nv-loading', tourId] });
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', tourId] });
      // nearby-Pool refreshen: inserted Sendungen koennten nicht mehr
      // in der Liste auftauchen (tour_id != null nach POST).
      qc.invalidateQueries({ queryKey: ['yard-nv', tourId, 20] });
      showToast('Sandbox übernommen — gespeichert.');
    },
    onError: (e: Error) => {
      // Sandbox bleibt erhalten — User kann erneut versuchen oder
      // verwerfen.
      showToast(`Übernehmen-Fehler: ${e.message}`, 'err');
    },
  });

  // Schritt 2: handlePosition leitet jetzt in den Sandbox-Reducer um —
  // KEIN direkter BE-Write. Persistenz erst via "Übernehmen".
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
    sandboxDispatch({
      type: 'setPosition',
      dbItemId: pkg.dbItemId,
      pos: { posXCm, posYCm, posZCm, rotationDeg },
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
      // BUG-V-Fix: capacity statt vehicle (getVehicleDims fiel auf
      // Koffer 7t/6.2m fuer Tonnen-Typen zurueck — Cascade-Drift
      // beim Insert-Mode-Drag in zu kleinem Trailer).
      trailerLengthCm: capacity.lengthCm,
      trailerWidthCm: capacity.widthCm,
    });
    // Schritt 2: Cascade-Aktionen → Sandbox-Reducer (batch dispatch).
    // BE-Persist erst via "Übernehmen". planNvInsertShift liefert
    // itemId = dbItemId (Persist-fähig), also direkt verwendbar.
    for (const a of actions) {
      sandboxDispatch({
        type: 'setPosition',
        dbItemId: a.itemId,
        pos: {
          posXCm: a.posXCm,
          posYCm: a.posYCm,
          posZCm: a.posZCm,
        },
      });
    }
    insertMode.cancel();
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
          {/* BUG-V-Fix: Fallback aus capacity.maxLdm statt
              vehicle.type, damit Tonnen-Typen ohne fahrzeug_typ-
              Beschriftung nicht "Koffer 7t" zeigen. */}
          {(tourQ.data?.fahrzeug_typ ?? '').trim() ||
            (tourQ.data?.subunternehmer?.fahrzeug_typ ?? '').trim() ||
            `${capacity.maxLdm.toFixed(1)} ldm`}
          {' '}({(capacity.lengthCm / 100).toFixed(1)}×
          {(capacity.widthCm / 100).toFixed(2)}×
          {(capacity.heightCm / 100).toFixed(2)} m)
        </span>
        <span className="ml-auto text-xs text-gray-400">
          {packages.length} Packstücke
        </span>
        {/* Schritt 2: Sandbox-Indikator + Übernehmen/Verwerfen.
            Badge sichtbar wenn Aenderungen offen. Übernehmen ist
            disabled wenn nichts zu speichern oder Mutation laeuft. */}
        {!isSandboxEmpty(sandbox) && (
          <span
            className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-medium border border-amber-300"
            title="Aenderungen sind ephemer bis 'Übernehmen' geklickt wird."
          >
            🧪 Sandbox: {sandboxChangeCount(sandbox)} Änderung
            {sandboxChangeCount(sandbox) === 1 ? '' : 'en'}
          </span>
        )}
        <button
          type="button"
          onClick={() => uebernehmenMut.mutate()}
          disabled={isSandboxEmpty(sandbox) || uebernehmenMut.isPending}
          className="ml-2 text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed min-h-[28px]"
          title="Alle Sandbox-Aenderungen ans BE persistieren."
        >
          {uebernehmenMut.isPending ? 'Speichert…' : 'Übernehmen'}
        </button>
        <button
          type="button"
          onClick={() => sandboxDispatch({ type: 'clearAll' })}
          disabled={isSandboxEmpty(sandbox) || uebernehmenMut.isPending}
          className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[28px]"
          title="Alle Sandbox-Aenderungen verwerfen (KEIN BE-Write)."
        >
          Verwerfen
        </button>
        <button
          onClick={() => window.close()}
          className="text-gray-500 hover:text-gray-800 ml-1"
          title="Schließen"
        >
          <X size={18} />
        </button>
      </div>
      {/* Beladeplan/Hof Schritt 1: Split-View — Auflieger 3D links,
          Hof-Liste rechts. Hof-Tab im Dock bleibt vorerst (Phase 1). */}
      <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 p-3 overflow-auto min-w-0">
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

            {/* Dispo-Sicherheit Banner — N Sendung(en) nicht plazierbar.
                Einheitliche Wording-Konvention (Vollansicht + Dock-Panel).
                Zaehlung: distinct shipmentId, NICHT Packstuecke. */}
            {unplacedShipmentCount > 0 && (
              <div
                role="alert"
                className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded p-2"
              >
                <div className="font-medium">
                  ⚠ {unplacedShipmentCount} Sendung(en) passen nicht auf den Trailer
                </div>
                <div className="text-xs">
                  Größeres Fahrzeug wählen oder Tour verkleinern. Nicht
                  plazierbare Pakete werden im 3D-Layout ausgeblendet.
                </div>
              </div>
            )}

            {/* 3D-Canvas — F1.a-Fix-2: Trailer-Box aus capacity (echte
                Geometrie), nicht aus getVehicleDims-Koffer-7t-Fallback.
                Schritt 3: Drop-Zone-Wrapper fuer Drag-IN aus Hof.
                onDragOver muss preventDefault aufrufen sonst feuert
                onDrop nicht (HTML5-Spec). */}
            <div
              data-testid="nv-3d-dropzone"
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(NV_DRAG_SHIPMENT_MIME)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }
              }}
              onDrop={(e) => {
                const shipmentId = e.dataTransfer.getData(
                  NV_DRAG_SHIPMENT_MIME,
                );
                if (!shipmentId) return;
                e.preventDefault();
                sandboxDispatch({ type: 'insert', shipmentId });
                showToast(`Sendung in Sandbox eingefügt — übernehmen?`);
              }}
            >
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
                  // Schritt 2: dbItemId fuer Sandbox-Reducer-Lookup.
                  dbItemId: (pkg as { dbItemId?: string }).dbItemId,
                  shipmentId:
                    (pkg as { shipmentId?: string }).shipmentId ?? '',
                  x,
                  y,
                });
              }}
            />
            </div>

            {/* F1.a/O Achslast — trailerLength_m aus capacity (echte
                Box-Laenge, sonst falsche Schwerpunkt-Berechnung).
                BUG-F-PACK: nur renderedPackages (unplaced sitzen bei
                0/0/0 und wuerden Schwerpunkt verfaelschen). */}
            <AxleLoadPanel
              packages={renderedPackages.map((p) => ({
                posY: p.posY,
                weightKg: Number(p.weightKg) || 0,
              }))}
              vehicleType={
                // BUG-V-Fix: AxleLoad-Config aus capacity ableiten —
                // vehicle.type (getVehicleDims) faellt fuer Tonnen-Typen
                // auf "Koffer 7t" zurueck und liefert falsche Achs-
                // konfiguration. Heuristik: maxLdm → naechstes
                // canonical VEHICLE_AXLES-Bucket.
                capacity.maxLdm <= 8
                  ? 'Koffer 7t'
                  : capacity.maxLdm <= 13
                    ? 'Koffer 12t'
                    : 'Sattel'
              }
              trailerLength_m={capacity.lengthCm / 100}
              groundedCount={renderedPackages.filter((p) => p.posZ < 1e-6).length}
              totalCount={renderedPackages.length}
            />
          </div>
        )}
      </div>
        {/* RIGHT: 3-Sektion Panel (Auf Tour / Parkplatz / Hof).
            Schritt 4: Auf-Tour-Cards draggable → Parkplatz (eject);
            Parkplatz-Cards Restore-Button (restore).
            Schritt 3: Hof-Cards draggable → 3D-Wrapper (insert). */}
        <aside className="w-80 lg:w-96 flex-shrink-0 border-l bg-white flex flex-col overflow-hidden">
          <NvLoadingPlanRightPanel
            tourId={tourId ?? null}
            patchedStops={patchedTour?.stops ?? []}
            tourStops={tourQ.data?.stops ?? []}
            ejectedShipmentIds={sandbox.ejectedShipmentIds}
            insertedShipmentIds={sandbox.insertedShipmentIds}
            dispatch={sandboxDispatch}
          />
        </aside>
      </div>
      {ctxMenu &&
        (() => {
          // Schritt 2: ContextMenu schreibt in den Sandbox-Reducer.
          // Position-Reset = Sandbox-Override entfernen (faellt auf BE-
          // Pos zurueck — kein BE-Write). Repack-Optimal entfaellt
          // (BE-Reset out-of-Scope; in Sandbox kein Sinn).
          const items: ContextMenuItem[] = [
            {
              label: 'Position zurücksetzen (Sandbox)',
              icon: <RotateCcw size={12} />,
              disabled:
                !ctxMenu.dbItemId ||
                !sandbox.positionOverrides.has(ctxMenu.dbItemId),
              onClick: () => {
                if (!ctxMenu.dbItemId) return;
                sandboxDispatch({
                  type: 'clearPosition',
                  dbItemId: ctxMenu.dbItemId,
                });
              },
              separator: true,
            },
            {
              label: 'Sendung aus Tour entfernen (Sandbox)',
              icon: <Trash2 size={12} />,
              danger: true,
              disabled: !ctxMenu.shipmentId,
              onClick: () => {
                if (!ctxMenu.shipmentId) return;
                const shipmentNr =
                  tourQ.data?.stops.find(
                    (s) => s.shipment.id === ctxMenu.shipmentId,
                  )?.shipment.shipment_number ?? '';
                if (
                  !window.confirm(
                    `Sendung ${shipmentNr} in Sandbox auswerfen? (Wird erst beim "Übernehmen" gespeichert.)`,
                  )
                )
                  return;
                sandboxDispatch({
                  type: 'eject',
                  shipmentId: ctxMenu.shipmentId,
                });
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

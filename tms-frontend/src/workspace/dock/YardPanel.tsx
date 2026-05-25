/**
 * S-6 YardPanel — read-only 3D-Hof-Visualisierung pro aktiver Tour.
 *
 * Datenquellen (alle FE-side, KEINE neuen BE-Endpoints)
 *   · Aktive Tour aus useWorkspaceRuntime.activeTourViewId.
 *   · Pool (nearby-shipments) — radius mode-abhaengig:
 *       NV: GET /nv-touren/:id/nearby-shipments          (default 20 km)
 *       FV: GET /tours/:id/nearby-shipments?radius_km=100
 *   · Ueberlauf (unplaced packages der aktiven Tour):
 *       NV: flattenPackages(tour, W, L, H).filter(unplaced)
 *       FV: aus FvOptimizeResponse.loadingOrder expand + placePackages
 *           (inline, da expandPackagesFromOrder in LoadingPlanPage
 *           privat ist). Phase-1-Scope reicht — vol/weight pro
 *           Sendung wird repraesentativ angezeigt.
 *
 * Gruppierung (Regel #2: ganze Sendung, kein Packstueck-Split)
 *   NV: je Versender-PLZ (shipment.loading.zip aus nearby-Response).
 *   FV: je Versender-PLZ. Spec moechte fuer Sammelgut nach Empfangs-
 *       depot/Relation gruppieren — das setzt FV-nearby-BE-Extension
 *       voraus (transport_type + delivery_zip im Response). Backlog
 *       fuer Phase 1; loading.zip ist verfuegbar und sinnvoll.
 *
 * Interaktion (Phase 1)
 *   · Click auf Sendungs-Box → usePanel().selectShipment(id) → S-5-
 *     Detail-Panel oeffnet sich.
 *   · KEIN Drag (=Phase 2).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useWorkspace } from '../../state/workspace';
import { useWorkspaceRuntime } from '../runtime/WorkspaceRuntimeContext';
import { usePanel } from '../../state/panel';
import { useDockPanelApi } from './DockPanelContext';
import { useEffect, useState } from 'react';
import YardScene3D, {
  type YardSlot,
  type YardPlacedPackage,
} from './YardScene3D';
import YardShipmentDetailModal, {
  type YardModalShipment,
} from './YardShipmentDetailModal';
import {
  flattenPackages as flattenNvPackages,
  type NvLoadingDetail,
} from '../../pages/NvLoadingPlanPage';
import {
  placePackages,
  sortPackagesForOptimalPack,
  type SharedPackage,
} from '../../lib/loadingShared';
import { ffdPackShipments } from '../../lib/yardFfd';
import {
  deriveBoxFromLdm,
  resolveVehicleCapacity,
  type ResolvedVehicleCapacity,
} from '../../lib/vehicleTypes';

interface NearbyShipment {
  id: string;
  shipment_number: string;
  weight_kg: number | null;
  ldm: number | null;
  // S-6.1: Volumen-Box-Daten (BE-NV + BE-FV ergaenzt)
  volume_m3?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  effective_pallets?: number | null;
  customer_name: string | null;
  lat: number;
  lng: number;
  zip: string | null;
  city: string | null;
  // S-6.2: Loading-Adresse-Detail (Per-Sendung-Label)
  loading_street?: string | null;
  loading_country?: string | null;
  distance_km: number;
  // S-6.1/6.2: FV-Empfaenger-Gruppierung (NUR FV-Response, optional)
  transport_type?: string | null;
  delivery_zip?: string | null;
  delivery_city?: string | null;
  delivery_country?: string | null;
  relation_id?: string | null;
  relation_code?: string | null;
  depot_label?: string | null;
  // S-6.3 B: package_items pro Sendung (Hof-Trailer-Pack).
  package_items?: Array<{
    id: string;
    length_cm: number | null;
    width_cm: number | null;
    height_cm: number | null;
    weight_kg: number | null;
    quantity: number | null;
    stackable: boolean;
  }> | null;
}

/**
 * S-6.1: FV-Sendung in eine Empfaenger-Gruppe einsortieren.
 *   Sammelgut (SAMMELGUT/TEILLAST/KOMPLETT) → Depot-Label oder
 *     Relation-Code; Fallback Empfangs-PLZ wenn keine Relation
 *     gepflegt ist.
 *   Direkt (DIREKT/DIREKT_UMSCHLAG) → Empfangs-PLZ.
 *   Sonderformen (BEILADER/SONDER) → Empfangs-PLZ als Fallback.
 *   Returns { key, label } — key zum Gruppieren, label fuer den
 *   Stellplatz-Header.
 */
function fvReceiverGroup(s: NearbyShipment): { key: string; label: string } {
  const tt = (s.transport_type ?? '').toUpperCase();
  const isSammelgut =
    tt === 'SAMMELGUT' || tt === 'TEILLAST' || tt === 'KOMPLETT';
  if (isSammelgut) {
    if (s.depot_label) {
      return { key: `depot-${s.depot_label}`, label: `Depot ${s.depot_label}` };
    }
    if (s.relation_code) {
      return {
        key: `relation-${s.relation_code}`,
        label: `Relation ${s.relation_code}`,
      };
    }
    // Kein Depot/Relation gepflegt — wie Direkt behandeln.
  }
  const dz = s.delivery_zip ?? '—';
  return { key: `dzip-${dz}`, label: `Empfangs-PLZ ${dz}` };
}

interface FvOptimizeShipment {
  id: string;
  shipmentNumber?: string;
  packageItems?: Array<{
    id: string;
    quantity: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    weightKg: number;
    stackable: boolean;
  }>;
}

interface FvOptimizeResponse {
  recommendedVehicle?: {
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
  };
  loadingOrder?: FvOptimizeShipment[];
}

const NV_RADIUS_KM = 20; // NV: BE-Default reicht; explizit klar fuer Konstanz.
const FV_RADIUS_KM = 100;

export default function YardPanel() {
  const { mode } = useWorkspace();
  const { activeTourViewId } = useWorkspaceRuntime();
  const panel = usePanel();
  const dockApi = useDockPanelApi();
  const [visible, setVisible] = useState<boolean>(dockApi?.isVisible ?? true);
  // S-6.3 D: Modal-State fuer Sendungs-Tap. Default-Use-Case ist
  // Mobile (Carlos auf iPhone) — Tap auf Hof-Item oeffnet das Modal
  // mit Kerninfos aus den nearby-Daten. Desktop kann zusaetzlich
  // "Volle Details" -> S-5-Detail-Panel triggern.
  const [modalShipmentId, setModalShipmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!dockApi) return;
    setVisible(dockApi.isVisible);
    const sub = dockApi.onDidVisibilityChange((e) => setVisible(e.isVisible));
    return () => sub.dispose();
  }, [dockApi]);

  const frameloop: 'always' | 'never' = visible ? 'always' : 'never';
  const tourId = activeTourViewId;

  // Nearby-Pool. URL + Radius pro Modus.
  const nearbyQ = useQuery<NearbyShipment[]>({
    queryKey: ['yard', mode, tourId, mode === 'nv' ? NV_RADIUS_KM : FV_RADIUS_KM],
    queryFn: async () => {
      if (!tourId) return [];
      const base =
        mode === 'nv'
          ? `/nv-touren/${tourId}/nearby-shipments`
          : `/tours/${tourId}/nearby-shipments`;
      const url =
        mode === 'fv' ? `${base}?radius_km=${FV_RADIUS_KM}` : base;
      const { data } = await api.get<NearbyShipment[]>(url);
      return data;
    },
    enabled: !!tourId,
    staleTime: 30_000,
  });

  // Ueberlauf-Quelle: Tour-Detail-Query je nach Modus.
  // NV: flattenPackages → unplaced=true rausziehen.
  const nvTourQ = useQuery<NvLoadingDetail | null>({
    queryKey: ['nv-loading', tourId],
    queryFn: async () =>
      (await api.get<NvLoadingDetail>(`/nv-touren/${tourId}/loading`)).data,
    enabled: !!tourId && mode === 'nv',
    staleTime: 10_000,
  });
  const fvTourQ = useQuery<FvOptimizeResponse | null>({
    queryKey: ['loading', 'optimize', tourId],
    queryFn: async () =>
      (
        await api.get<FvOptimizeResponse>(
          `/loading/tour/${tourId}/optimize`,
        )
      ).data,
    enabled: !!tourId && mode === 'fv',
    staleTime: 10_000,
  });
  // T1.6: FV-Tour-Capacity-Query — tour.max_ldm + tour.max_weight_kg
  // sind persistiert (Default 13.6/24000, vom User in Tour-UI
  // editierbar). recommendedVehicle aus /optimize ist ein Pack-Hint,
  // KEINE Kapazitaetsquelle. Mit dieser Query zieht der Hof die echte
  // Cap = BE-Overload-Badge-Quelle → keine Divergenz mehr.
  const fvTourCapQ = useQuery<{
    max_ldm?: number | string | null;
    max_weight_kg?: number | string | null;
  } | null>({
    queryKey: ['fv-tour-cap', tourId],
    queryFn: async () =>
      (await api.get<{ max_ldm?: number | string | null; max_weight_kg?: number | string | null }>(
        `/tours/${tourId}`,
      )).data,
    enabled: !!tourId && mode === 'fv',
    staleTime: 30_000,
  });

  // T1: Trailer-Kapazitaet aus Tour aufloesen (NV: tour.fahrzeug_typ +
  // sub-Stammdaten; FV: recommendedVehicle aus optimize-Response —
  // synthetisiert eine ResolvedVehicleCapacity, source 'fv-rec' nicht
  // im Type → wir mappen auf source 'sub' bei explizit, sonst
  // 'fallback-unknown'). Konsumenten: yardFfd-opts (vol+kg), placePackages
  // (inner L/W/H), YardScene3D (Trailer-Box), Overflow-Diagnose.
  const capacity = useMemo<ResolvedVehicleCapacity>(() => {
    if (mode === 'nv' && nvTourQ.data) {
      return resolveVehicleCapacity(
        { fahrzeug_typ: nvTourQ.data.fahrzeug_typ ?? null },
        nvTourQ.data.subunternehmer ?? null,
      );
    }
    if (mode === 'fv') {
      // T1.6: FV-Cap = tour.max_ldm + tour.max_weight_kg (persistiert,
      // selbe Quelle wie BE-Overload-Badge). Box-Dims via
      // deriveBoxFromLdm(maxLdm) — NICHT recommendedVehicle (das ist
      // ein Pack-Hint, keine Cap-Quelle). Fallback Sattel-Default
      // 13.6/24000 wenn Query noch nicht da oder Tour ohne Werte.
      const t = fvTourCapQ.data;
      const maxLdm = Number(t?.max_ldm) || 13.6;
      const maxWeightKg = Number(t?.max_weight_kg) || 24000;
      const box = deriveBoxFromLdm(maxLdm);
      return {
        source: 'sub',
        maxLdm,
        maxWeightKg,
        maxVolM3: (box.lengthCm * box.widthCm * box.heightCm) / 1e6,
        lengthCm: box.lengthCm,
        widthCm: box.widthCm,
        heightCm: box.heightCm,
      };
    }
    // Fallback Sattel — noch keine Tour-Daten geladen.
    return {
      source: 'fallback-unknown',
      maxLdm: 13.6,
      maxWeightKg: 24000,
      maxVolM3: (1360 * 240 * 270) / 1e6,
      lengthCm: 1360,
      widthCm: 240,
      heightCm: 270,
    };
  }, [mode, nvTourQ.data, fvTourQ.data, fvTourCapQ.data]);

  // S-6.2: ein gemeinsames placePackages-Memo liefert sowohl die
  // Ueberlauf-Sendungs-IDs als auch die im Auflieger plazierten
  // Pakete (placedInTrailer-Render). Regel #2: ganze Sendung —
  // sobald 1 Paket der Sendung unplaced ist, faellt sie als ganzes
  // Sendung in den Ueberlauf-Slot.
  const packData = useMemo(() => {
    const placedInTrailer: YardPlacedPackage[] = [];
    const overflowIds = new Set<string>();
    if (mode === 'nv' && nvTourQ.data) {
      // T1: flattenPackages mit aufgelöster Trailer-Geometrie statt
      // Sattel-Hardcode — passt jetzt fuer 7,5T/12T/18T/Sattel.
      const pkgs = flattenNvPackages(
        nvTourQ.data,
        capacity.widthCm,
        capacity.lengthCm,
        capacity.heightCm,
      );
      for (const p of pkgs) {
        if (p.unplaced) {
          if (p.shipmentId) overflowIds.add(p.shipmentId);
          continue;
        }
        placedInTrailer.push({
          id: p.id,
          shipmentId: p.shipmentId ?? null,
          lengthCm: p.lengthCm,
          widthCm: p.widthCm,
          heightCm: p.heightCm,
          posX: p.posX,
          posY: p.posY,
          posZ: p.posZ,
          color: p.color ?? null,
        });
      }
    } else if (mode === 'fv' && fvTourQ.data) {
      // Inline-Expand+Place fuer FV (expandPackagesFromOrder ist in
      // LoadingPlanPage privat). Wir packen pro Sendung Quantity-
      // Klone und reichen sie an placePackages.
      // T1: Dims aus capacity (synthetisiert aus recommendedVehicle).
      const order = fvTourQ.data.loadingOrder ?? [];
      const L = capacity.lengthCm;
      const W = capacity.widthCm;
      const H = capacity.heightCm;
      // Color-Map pro Sendung (FV-inline expand setzt KEINE color —
      // fixer Palette-Pool reicht fuer visuelle Sendungs-Trennung).
      const FV_COLORS = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#84cc16', '#ec4899', '#6366f1', '#14b8a6',
      ];
      const list: Array<
        SharedPackage & { shipmentId: string; color: string; id: string }
      > = [];
      let idx = 0;
      const colorByShip = new Map<string, string>();
      for (const s of order) {
        if (!colorByShip.has(s.id)) {
          colorByShip.set(s.id, FV_COLORS[colorByShip.size % FV_COLORS.length]);
        }
        const items = s.packageItems ?? [];
        const allStackable =
          items.length > 0 && items.every((it) => it.stackable !== false);
        for (const it of items) {
          const qty = Math.max(1, Number(it.quantity ?? 1));
          for (let q = 0; q < qty; q++) {
            list.push({
              id: `${s.id}:${it.id}:${q}:${idx++}`,
              shipmentId: s.id,
              color: colorByShip.get(s.id) ?? '#3b82f6',
              lengthCm: Number(it.lengthCm) || 0,
              widthCm: Number(it.widthCm) || 0,
              heightCm: Number(it.heightCm) || 0,
              weightKg: Number(it.weightKg) || 0,
              isStackable: allStackable && it.stackable !== false,
              storedPosX: null,
              storedPosY: null,
              storedPosZ: null,
            });
          }
        }
      }
      // S-6.3 A-Fix: Carlos-Stack-Rule-Sortierung vor placePackages
      // (Default-Pfad lief vorher ohne Pre-Sort).
      const placed = placePackages(sortPackagesForOptimalPack(list), L, W, H);
      for (const p of placed) {
        if (p.unplaced) {
          overflowIds.add(p.shipmentId);
          continue;
        }
        placedInTrailer.push({
          id: p.id,
          shipmentId: p.shipmentId,
          lengthCm: p.lengthCm,
          widthCm: p.widthCm,
          heightCm: p.heightCm,
          posX: p.posX,
          posY: p.posY,
          posZ: p.posZ,
          color: p.color,
        });
      }
    }
    // S-6.3 Overflow-Grund-Diagnose: vergleichen totales Cargo-Vol
    // gegen Trailer-Vol-Kapazitaet. Wenn Σ Vol > Kapazitaet →
    // echte Ueberkapazitaet ("Σ Vol > Kapazität"). Sonst Pack-
    // Inefficiency trotz Bodenreserve ("Pack-Grenze (Reserve)").
    // T1: TRAILER_VOL_M3 jetzt aus capacity.maxVolM3 — Sattel 88,
    // 18T 60, 12T 50, 7,5T 40 m³.
    const TRAILER_VOL_M3 = capacity.maxVolM3;
    const totalVolM3 = (() => {
      let v = 0;
      for (const p of placedInTrailer) {
        v += (p.lengthCm * p.widthCm * p.heightCm) / 1e6;
      }
      // Overflow-Pakete sind im placePackages-Output mit posX/Y/Z=
      // (0,0,0) markiert, aber dim-erhalten — wir muessen sie
      // separat dazuzaehlen. Sie sind im placed-Output nicht
      // enthalten (gefiltert). Stattdessen iterieren wir das
      // Pre-Pack-Material:
      //   NV: flattenNvPackages liefert ALLES inkl. unplaced — bereits
      //       in placedInTrailer-Loop weggefiltert. Aggregat per
      //       Pre-Pack-Vol via packageData.unplacedVol-Helper.
      // Vereinfachung Phase A-Fix: Ueberlauf-Vol pro Sendung kommt
      // aus overflowShipments[i].volumeM3 (siehe useMemo unten).
      // → Hier nur placedInTrailer-Vol. Total wird in der Reason-
      // useMemo unten gebildet (kennt overflowShipments-Vol).
      return v;
    })();
    return {
      overflowShipmentIds: overflowIds,
      placedInTrailer,
      placedVolM3: totalVolM3,
      trailerVolM3: TRAILER_VOL_M3,
    };
  }, [mode, nvTourQ.data, fvTourQ.data, capacity]);

  const overflowShipmentIds = packData.overflowShipmentIds;
  const placedInTrailer = packData.placedInTrailer;

  // Ueberlauf-Sendungs-Daten — Vol/Dims fuer S-6.1 Box-Groesse.
  // NV: aus nvTourQ.stops.shipment (length/width/height/weight)
  // FV: aus loadingOrder.packageItems (Σ vol pro Sendung)
  const overflowShipments = useMemo(() => {
    if (mode === 'nv' && nvTourQ.data) {
      return nvTourQ.data.stops
        .filter((s) => overflowShipmentIds.has(s.shipment.id))
        .map((s) => ({
          id: s.shipment.id,
          shipmentNumber: s.shipment.shipment_number ?? null,
          // Sendungs-Ebene-Dims (aggregiert, vom shipments-Service
          // gepflegt). Wenn fehlend → cubed-root-Pfad in
          // shipBoxDims greift via volumeM3.
          lengthCm: s.shipment.length_cm ?? null,
          widthCm: s.shipment.width_cm ?? null,
          heightCm: s.shipment.height_cm ?? null,
          // NV-Sendung hat volume_m3 + effective_pallets im Schema —
          // beides ist in NvShipment-Type evtl. nicht deklariert.
          // Sicher zugreifen via cast-helper unten.
          volumeM3:
            (s.shipment as { volume_m3?: number | null }).volume_m3 ?? null,
          effectivePallets:
            (s.shipment as { effective_pallets?: number | null })
              .effective_pallets ?? null,
          isOverflow: true,
        }));
    }
    if (mode === 'fv' && fvTourQ.data) {
      const order = fvTourQ.data.loadingOrder ?? [];
      return order
        .filter((s) => overflowShipmentIds.has(s.id))
        .map((s) => {
          // Σ Volumen aus packageItems (cm³ → m³).
          let cm3 = 0;
          for (const it of s.packageItems ?? []) {
            const qty = Math.max(1, Number(it.quantity ?? 1));
            cm3 +=
              Number(it.lengthCm ?? 0) *
              Number(it.widthCm ?? 0) *
              Number(it.heightCm ?? 0) *
              qty;
          }
          return {
            id: s.id,
            shipmentNumber: s.shipmentNumber ?? null,
            volumeM3: cm3 > 0 ? cm3 / 1e6 : null,
            // Keine Sendungs-Ebene-Dims im Optimize-Response →
            // shipBoxDims faellt auf Vol-Cubed-Root-Pfad.
            isOverflow: true,
          };
        });
    }
    return [];
  }, [mode, nvTourQ.data, fvTourQ.data, overflowShipmentIds]);

  // S-6.3 Overflow-Grund (binary). Berechnet Total-Cargo-Vol
  // (placed + unplaced) und vergleicht mit Trailer-Vol (88.13 m³
  // Sattel-Default). Per-Sendung-Reason ist hier gleich (binary),
  // wird aber pro Box gerendert (Carlos-Spec: "pro unplaced-Sendung").
  const overflowReason: 'vol-over-capacity' | 'pack-limit' | null = useMemo(() => {
    if (overflowShipments.length === 0) return null;
    const trailerVol = packData.trailerVolM3;
    let unplacedVol = 0;
    for (const s of overflowShipments) {
      const v = (s as { volumeM3?: number | null }).volumeM3 ?? 0;
      unplacedVol += Number(v) || 0;
    }
    const total = packData.placedVolM3 + unplacedVol;
    return total > trailerVol ? 'vol-over-capacity' : 'pack-limit';
  }, [overflowShipments, packData]);
  const overflowReasonLabel: string | null =
    overflowReason === 'vol-over-capacity'
      ? 'Σ Vol > Kapazität'
      : overflowReason === 'pack-limit'
        ? 'Pack-Grenze (Reserve)'
        : null;

  const nearbyWithoutGeo = useMemo(() => {
    // nearby-Endpoint filtert lat/lng-NULL bereits aus. Wir bekommen
    // also nur geocoded Sendungen — fuer einen "ohne Standort"-Hinweis
    // muessten wir eine eigene Query fahren. Phase 1 Backlog.
    return 0;
  }, []);

  // Gruppierung der nearby-Sendungen.
  //   NV: nach Versender-PLZ (loading.zip) — Carlos-Spec unveraendert.
  //   FV: Empfaenger-orientiert via fvReceiverGroup (Depot/Relation
  //       fuer Sammelgut, Empfangs-PLZ fuer Direkt/Sonderformen).
  // S-6.2 Country-Prefix: Slot bekommt nur dann ein Country-Praefix,
  //   wenn ALLE Sendungen in der Gruppe dasselbe Land haben.
  //   NV: Versender-Land (loading_country)
  //   FV: Zustell-Land (delivery_country); Fallback loading_country
  const slots: YardSlot[] = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; ships: NearbyShipment[] }
    >();
    for (const s of nearbyQ.data ?? []) {
      const { key, label } =
        mode === 'fv'
          ? fvReceiverGroup(s)
          : { key: s.zip ?? '—', label: `PLZ ${s.zip ?? '—'}` };
      const g = groups.get(key) ?? { label, ships: [] };
      g.ships.push(s);
      groups.set(key, g);
    }

    /** Liefert einen Country-Code wenn alle Sendungen einheitlich
     *  sind, sonst null. */
    function uniformCountry(ships: NearbyShipment[]): string | null {
      let cc: string | null = null;
      for (const s of ships) {
        const c =
          mode === 'fv'
            ? s.delivery_country ?? s.loading_country
            : s.loading_country;
        if (!c) return null;
        if (cc == null) cc = c;
        else if (cc !== c) return null;
      }
      return cc;
    }

    const sorted = Array.from(groups.entries()).sort(([, a], [, b]) =>
      a.label.localeCompare(b.label),
    );
    const out: YardSlot[] = sorted.map(([key, g]) => {
      const cc = uniformCountry(g.ships);
      const prefix = cc && cc !== 'DE' ? `${cc} · ` : '';
      // S-6.3 C: FFD-Bin-Pack pro Gruppe → LKW-Zahl.
      // Pack-Einheit = Sendung (NIE gesplittet, Regel #2).
      // volumeM3 fallback: shipBoxDims-Heuristik (L*W*H ÷ 1e6) wenn
      // Aggregat-Field NULL ist, damit FFD nicht 0 m³ zaehlt.
      const ffdInput = g.ships.map((s) => {
        let vol = Number(s.volume_m3 ?? 0);
        if (!vol && s.length_cm && s.width_cm && s.height_cm) {
          vol =
            (Number(s.length_cm) *
              Number(s.width_cm) *
              Number(s.height_cm)) /
            1e6;
        }
        return {
          id: s.id,
          volumeM3: vol,
          weightKg: Number(s.weight_kg ?? 0),
        };
      });
      // T1: FFD-Kapazitaet aus capacity (Vol-Cap + Nutzlast). Vorher
      // Sattel-Defaults (88.13 m³ / 24000 kg) — jetzt sub/tonnen/
      // canonical-Match.
      const trailers = ffdPackShipments(ffdInput, {
        maxVolumeM3: capacity.maxVolM3,
        maxWeightKg: capacity.maxWeightKg,
      });
      const lkw = trailers.length;
      const sdg = g.ships.length;
      // Slot-Label: "<group> · N Sdg · ≈ K LKW"
      const baseLabel = `${prefix}${g.label}`;
      const fullLabel = `${baseLabel} · ${sdg} Sdg · ≈ ${lkw} LKW`;
      return {
        id: `g-${key}`,
        label: fullLabel,
        variant: 'normal' as const,
        // S-6.3 B: Trailers fuer Pack-Render (B-Phase). Heute (C)
        // konsumiert YardScene3D sie noch nicht; B aktiviert die
        // multi-Trailer-Stellplatz-Render-Logik.
        trailers,
        shipments: g.ships.map((s) => ({
          id: s.id,
          shipmentNumber: s.shipment_number,
          volumeM3: s.volume_m3 ?? null,
          lengthCm: s.length_cm ?? null,
          widthCm: s.width_cm ?? null,
          heightCm: s.height_cm ?? null,
          // effective_pallets via type-cast — YardShipment-Interface
          // hat es nicht; YardScene3D shipBoxDims liest es per
          // Optional-Access.
          effectivePallets: s.effective_pallets ?? null,
          // S-6.2: Per-Sendung-Label-Felder. YardScene3D rendert
          // sie kompakt; Voll-Inhalt bei Hover-Tooltip.
          customerName: s.customer_name ?? null,
          loadingStreet: s.loading_street ?? null,
          loadingZip: s.zip ?? null,
          loadingCity: s.city ?? null,
          loadingCountry: s.loading_country ?? null,
          deliveryZip: s.delivery_zip ?? null,
          deliveryCity: s.delivery_city ?? null,
          deliveryCountry: s.delivery_country ?? null,
          transportType: s.transport_type ?? null,
          relationCode: s.relation_code ?? null,
          depotLabel: s.depot_label ?? null,
          mode,
        })),
      };
    });
    if (overflowShipments.length > 0) {
      // S-6.3: Slot-Label inkl. Grund (Σ Vol > Kapazität vs Pack-
      // Grenze). Pro-Box-Label bekommt overflowReason zusaetzlich
      // (siehe YardScene3D ShipmentLabel Zeile 3).
      const reasonSuffix = overflowReasonLabel ? ` · ${overflowReasonLabel}` : '';
      out.push({
        id: 'overflow',
        label: `Überlauf (${overflowShipments.length} nicht plazierbar)${reasonSuffix}`,
        variant: 'overflow' as const,
        shipments: overflowShipments.map((s) => ({
          ...s,
          overflowReason: overflowReasonLabel ?? undefined,
        })),
      });
    }
    return out;
  }, [nearbyQ.data, overflowShipments, mode, capacity]);

  // S-6.3 B: Pro Lane + FFD-Trailer die package_items expand+sort+
  // placePackages-Run → echte gestackte Boxen im 3D-Block. Perf-Cap:
  // wenn Gesamt-Item-Count > MAX_TOTAL_BOXES → nur erste M Trailer
  // pro Lane mit Items, Rest leerer Rahmen + "+K LKW"-Hinweis im
  // Render. Carlos's 30-LKW-Pool ~> 1500 Boxes ohne Cap.
  const MAX_TOTAL_BOXES = 600;
  const TRAILER_VISIBLE_PER_LANE = 5;
  // FV-Farbpalette (10) — pro Sendung-Index in der Lane.
  const COLORS = useMemo(
    () => [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#06b6d4', '#84cc16', '#ec4899', '#6366f1', '#14b8a6',
    ],
    [],
  );
  const lanesWithPacks = useMemo<YardSlot[]>(() => {
    if (!nearbyQ.data) return slots;
    // Map shipmentId → NearbyShipment (incl. package_items) fuer
    // schnellen Lookup.
    const byId = new Map<string, NearbyShipment>();
    for (const s of nearbyQ.data) byId.set(s.id, s);

    // 1. Pro Lane + Trailer placePackages-Output bauen. Items pro
    //    Sendung: package_items × quantity. Color: Lane-lokale
    //    Sendungs-Index-Palette (gleicher Hex pro Sendung — Items
    //    der gleichen Sendung sehen identisch aus, klick-able).
    type PreTrailer = {
      shipmentIds: string[];
      items: Array<
        SharedPackage & {
          id: string;
          shipmentId: string;
          color: string;
        }
      >;
      placedItems: YardPlacedPackage[];
    };
    const trailerData = new Map<string, PreTrailer[]>();
    let totalItems = 0;
    for (const slot of slots) {
      if (slot.variant === 'overflow' || !slot.trailers) continue;
      const laneColors = new Map<string, string>();
      const expanded: PreTrailer[] = [];
      for (const t of slot.trailers) {
        const items: PreTrailer['items'] = [];
        for (const sid of t.shipmentIds) {
          if (!laneColors.has(sid)) {
            laneColors.set(sid, COLORS[laneColors.size % COLORS.length]);
          }
          const ship = byId.get(sid);
          if (!ship) continue;
          const pkgItems = ship.package_items ?? [];
          const allStackable =
            pkgItems.length > 0 &&
            pkgItems.every((it) => it.stackable !== false);
          for (const it of pkgItems) {
            const qty = Math.max(1, Number(it.quantity ?? 1));
            for (let q = 0; q < qty; q++) {
              items.push({
                id: `${sid}:${it.id}:${q}`,
                shipmentId: sid,
                color: laneColors.get(sid) ?? '#3b82f6',
                lengthCm: Number(it.length_cm) || 0,
                widthCm: Number(it.width_cm) || 0,
                heightCm: Number(it.height_cm) || 0,
                weightKg: Number(it.weight_kg) || 0,
                isStackable: allStackable && it.stackable !== false,
                storedPosX: null,
                storedPosY: null,
                storedPosZ: null,
              });
            }
          }
        }
        // T1: Sort + placePackages auf aufgelöster Trailer-Geometrie
        // (Sattel/18T/12T/7,5T) statt Sattel-Hardcode.
        const sorted = sortPackagesForOptimalPack(items);
        const placed = placePackages(
          sorted,
          capacity.lengthCm,
          capacity.widthCm,
          capacity.heightCm,
        );
        const placedItems: YardPlacedPackage[] = placed
          .filter((p) => !p.unplaced)
          .map((p) => ({
            id: p.id,
            shipmentId: p.shipmentId ?? null,
            lengthCm: p.lengthCm,
            widthCm: p.widthCm,
            heightCm: p.heightCm,
            posX: p.posX,
            posY: p.posY,
            posZ: p.posZ,
            color: p.color,
          }));
        totalItems += placedItems.length;
        expanded.push({ shipmentIds: t.shipmentIds, items, placedItems });
      }
      trailerData.set(slot.id, expanded);
    }

    // 2. Perf-Cap anwenden, falls noetig.
    const cap = totalItems > MAX_TOTAL_BOXES;
    return slots.map((slot) => {
      if (slot.variant === 'overflow' || !slot.trailers) return slot;
      const pre = trailerData.get(slot.id) ?? [];
      const packedTrailers = pre.map((pt, i) => ({
        shipmentIds: pt.shipmentIds,
        // Cap-Schwellwert: wenn aktiv UND Trailer-Index >= M → leer.
        capped: cap && i >= TRAILER_VISIBLE_PER_LANE,
        placedItems:
          cap && i >= TRAILER_VISIBLE_PER_LANE ? [] : pt.placedItems,
      }));
      return { ...slot, packedTrailers };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, nearbyQ.data, COLORS, capacity]);

  // S-6.3 D-Erweiterung: Auflieger-Items kommen aus /loading bzw
  // /loading-tour-optimize, NICHT aus nearby. Damit Tap auf
  // Auflieger-Box auch das Modal oeffnet (iPhone-konsistent), bauen
  // wir eine zweite Map aus den Tour-Shipments. NV-Felder sind
  // sparsamer (kein customer_name/Adresse) — Modal zeigt was da ist,
  // Button "Volle Details" deckt den Rest via S-5-Panel ab.
  const tourShipmentLookup = useMemo<Map<string, YardModalShipment>>(() => {
    const m = new Map<string, YardModalShipment>();
    if (mode === 'nv' && nvTourQ.data) {
      for (const stop of nvTourQ.data.stops) {
        const sh = stop.shipment;
        // Vol aus Sendungs-Dims wenn nicht direkt vorhanden.
        const cm3 =
          Number(sh.length_cm ?? 0) *
          Number(sh.width_cm ?? 0) *
          Number(sh.height_cm ?? 0);
        m.set(sh.id, {
          id: sh.id,
          shipment_number: sh.shipment_number ?? null,
          customer_name: null, // NV-loading endpoint liefert customer_name nicht
          weight_kg: sh.weight_kg ?? null,
          volume_m3:
            (sh as { volume_m3?: number | null }).volume_m3 ??
            (cm3 > 0 ? cm3 / 1e6 : null),
          effective_pallets:
            (sh as { effective_pallets?: number | null }).effective_pallets ??
            null,
        });
      }
    } else if (mode === 'fv' && fvTourQ.data?.loadingOrder) {
      for (const s of fvTourQ.data.loadingOrder) {
        // FV loadingOrder hat reichere Felder via Cast (optimizer
        // service liefert customer-name resolved + deliveryCity).
        const cast = s as FvOptimizeShipment & {
          customer?: string | null;
          deliveryCity?: string | null;
          deliveryZip?: string | null;
          weightKg?: number | null;
          ldm?: number | null;
        };
        let cm3 = 0;
        for (const it of cast.packageItems ?? []) {
          const qty = Math.max(1, Number(it.quantity ?? 1));
          cm3 +=
            Number(it.lengthCm ?? 0) *
            Number(it.widthCm ?? 0) *
            Number(it.heightCm ?? 0) *
            qty;
        }
        m.set(cast.id, {
          id: cast.id,
          shipment_number: cast.shipmentNumber ?? null,
          customer_name: cast.customer ?? null,
          weight_kg: cast.weightKg ?? null,
          volume_m3: cm3 > 0 ? cm3 / 1e6 : null,
          delivery_zip: cast.deliveryZip ?? null,
          delivery_city: cast.deliveryCity ?? null,
        });
      }
    }
    return m;
  }, [mode, nvTourQ.data, fvTourQ.data]);

  if (!tourId) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-xs text-gray-500 text-center">
        Keine Tour ausgewählt. Klick eine Tour in „Touren" — der Hof
        zeigt dann den 20-km-Umkreis (NV) bzw. 100-km-Umkreis (FV) +
        nicht plazierbare Pakete der Tour.
      </div>
    );
  }

  const totalNearby = nearbyQ.data?.length ?? 0;
  // S-6.3 C: Summe der Trailer-Bins ueber alle nicht-Ueberlauf-Slots
  // (Pool-LKW-Bedarf). Ueberlauf zaehlt KEIN LKW — die Sendungen
  // dort sind ja bereits ungeschickt platzierbar.
  const totalLkw = slots.reduce(
    (sum, s) =>
      s.variant === 'overflow' ? sum : sum + (s.trailers?.length ?? 0),
    0,
  );
  const isLoading = nearbyQ.isLoading || nvTourQ.isLoading || fvTourQ.isLoading;

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-gray-50 text-xs">
        <span className="font-semibold text-gray-900">Hof</span>
        <span className="text-gray-500">
          ·{' '}
          {mode === 'nv'
            ? `${NV_RADIUS_KM} km Umkreis`
            : `${FV_RADIUS_KM} km Umkreis`}
        </span>
        <span className="text-gray-500">·</span>
        <span className="font-mono text-gray-700">
          {totalNearby} im Pool
        </span>
        {totalLkw > 0 && (
          <span className="text-blue-700">
            · ≈ {totalLkw} LKW
          </span>
        )}
        {placedInTrailer.length > 0 && (
          <span className="text-amber-700">
            · {placedInTrailer.length} im Auflieger
          </span>
        )}
        {overflowShipments.length > 0 && (
          <span className="text-red-700">
            · {overflowShipments.length} Überlauf
          </span>
        )}
        {nearbyWithoutGeo > 0 && (
          <span className="text-amber-700">
            · {nearbyWithoutGeo} ohne Standort
          </span>
        )}
        {isLoading && (
          <span className="text-gray-400 italic ml-auto">Lädt…</span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {totalNearby === 0 &&
        overflowShipments.length === 0 &&
        placedInTrailer.length === 0 ? (
          <div className="h-full flex items-center justify-center p-6 text-xs text-gray-500 text-center">
            Keine Sendungen im Umkreis + kein Auflieger-Inhalt + kein
            Überlauf.
          </div>
        ) : (
          <YardScene3D
            trailerLengthCm={capacity.lengthCm}
            trailerWidthCm={capacity.widthCm}
            trailerHeightCm={capacity.heightCm}
            slots={lanesWithPacks}
            placedInTrailer={placedInTrailer}
            frameloop={frameloop}
            onShipmentClick={(id) => {
              // S-6.3 D-Erweiterung: Tap auf jede Box (Lane ODER
              // Auflieger) → Modal. Routing:
              //   1. nearby → Modal (volle Daten inkl Adresse)
              //   2. tourShipmentLookup → Modal (sparser, NV ohne
              //      customer/Adresse — Modal zeigt "Volle Details"
              //      Button für S-5-Panel)
              //   3. Fall-through → panel.selectShipment (defensiv)
              const inNearby = (nearbyQ.data ?? []).some(
                (s) => s.id === id,
              );
              if (inNearby || tourShipmentLookup.has(id)) {
                setModalShipmentId(id);
              } else {
                panel.selectShipment(id);
              }
            }}
          />
        )}
      </div>
      {/* S-6.3 D: Hof-Sendungs-Detail-Modal. Datenquellen-Cascade:
          nearby zuerst (volle Daten inkl Adresse), dann
          tourShipmentLookup (Auflieger-Items, sparser). */}
      <YardShipmentDetailModal
        shipment={
          modalShipmentId
            ? (nearbyQ.data ?? []).find((s) => s.id === modalShipmentId) ??
              tourShipmentLookup.get(modalShipmentId) ??
              null
            : null
        }
        isOpen={modalShipmentId != null}
        onClose={() => setModalShipmentId(null)}
        onOpenFullDetail={(id) => panel.selectShipment(id)}
      />
    </div>
  );
}

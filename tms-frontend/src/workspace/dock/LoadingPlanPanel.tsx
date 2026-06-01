/**
 * S-2b + D2 LoadingPlanPanel — 3D-Beladeplan als Workspace-Panel.
 *
 * D2: embedded Drag-fähig (Position-PATCH). NV + FV nutzen
 * direkt PATCH /loading/package-item/:id/position + invalidate
 * der Tour-Query — KEIN Sandbox-Reducer (Sandbox bleibt der
 * Vollansicht /nv-loading/:tourId vorbehalten, fuer Eject/Insert/
 * Cascade-Shift). Co-Existenz-Race (Sandbox+Embedded gleichzeitig):
 * dokumentiert als Backlog — Carlos's UX-Realitaet ist "selten
 * beide gleichzeitig offen".
 *
 * Modus-bewusst:
 *   - mode=nv: GET /nv-touren/:tourId/loading → flattenPackages →
 *              Plan3DPackage[] mit dbItemId (q===0 oder Single-Pkg).
 *   - mode=fv: GET /loading/tour/:tourId/optimize → OptimizeResponse →
 *              expandPackagesFromOrder + placePackages → PlacedPackage[]
 *              (F①-a-Lib-Konsument, dbItemId via Package-Type).
 *
 * frameloop-Gating:
 *   useDockPanelApi() liefert dockview-Panel-Api → isVisible +
 *   onDidVisibilityChange. Sichtbar='always', versteckt='never'.
 *   Damit frisst der 3D-Canvas im Hintergrund-Tab KEINE GPU.
 *
 * Vollansicht-Link: öffnet Route im selben Tab (Spec lässt offen,
 * default same-tab; Cmd-Click = neuer Tab via Browser-Default).
 * Wird auch nach D2 als "voller Funktionsumfang"-Einstieg gerendert
 * (Sandbox, Achslast, Insert-Mode, ContextMenu).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Maximize2 } from 'lucide-react';
import { api as apiClient } from '../../lib/api';
import { useWorkspace } from '../../state/workspace';
import { useWorkspaceRuntime } from '../runtime/WorkspaceRuntimeContext';
import { useDockPanelApi } from './DockPanelContext';
import LoadingPlan3D, { type Plan3DPackage } from '../../components/LoadingPlan3D';
import {
  flattenPackages as flattenNvPackages,
  type NvLoadingDetail,
} from '../../pages/NvLoadingPlanPage';
import { resolveVehicleCapacity } from '../../lib/vehicleTypes';
import AxleLoadPanel from '../../components/AxleLoadPanel';
import {
  DEFAULT_TRAILER_CM,
  expandPackagesFromOrder,
  type OptimizeResponse,
} from '../../lib/loadingFv';
import {
  placePackages,
  sortPackagesForOptimalPack,
} from '../../lib/loadingShared';

/**
 * D2: Position-PATCH-Body (FV + NV) — selber BE-Endpoint
 * /loading/package-item/:id/position. Spiegelt 1:1 die
 * Vollansicht-Mutation (LoadingPlanPage.persistItemPositionMutation +
 * NvLoadingPlanPage.uebernehmenMut.position-Branch).
 */
interface PositionMutationVars {
  itemId: string;
  posXCm: number;
  posYCm: number;
  posZCm: number;
  rotationDeg?: number;
}

export default function LoadingPlanPanel() {
  const { activeTourViewId } = useWorkspaceRuntime();
  const { mode } = useWorkspace();
  const dockApi = useDockPanelApi();
  // Visibility — default true wenn Context fehlt (z.B. in Tests).
  const [visible, setVisible] = useState<boolean>(dockApi?.isVisible ?? true);

  useEffect(() => {
    if (!dockApi) return;
    setVisible(dockApi.isVisible);
    const sub = dockApi.onDidVisibilityChange((e) => setVisible(e.isVisible));
    return () => sub.dispose();
  }, [dockApi]);

  const frameloop: 'always' | 'never' = visible ? 'always' : 'never';

  if (!activeTourViewId) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-xs text-gray-500">
        Keine Tour ausgewählt. Klick eine Tour in „Touren".
      </div>
    );
  }

  return mode === 'nv' ? (
    <NvBody tourId={activeTourViewId} frameloop={frameloop} />
  ) : (
    <FvBody tourId={activeTourViewId} frameloop={frameloop} />
  );
}

/* ─── NV-Variante ──────────────────────────────────────────── */

function NvBody({
  tourId,
  frameloop,
}: {
  tourId: string;
  frameloop: 'always' | 'never';
}) {
  const queryClient = useQueryClient();
  const tourQ = useQuery<NvLoadingDetail | null>({
    queryKey: ['nv-loading', tourId],
    queryFn: async () => {
      const { data } = await apiClient.get<NvLoadingDetail>(
        `/nv-touren/${tourId}/loading`,
      );
      return data;
    },
    enabled: !!tourId,
    staleTime: 10_000,
  });

  // D2: Direct-PATCH (kein Sandbox). Sandbox-Reducer bleibt der
  // Vollansicht vorbehalten (Eject/Insert/Cascade); Embedded ist
  // die "Quick-Edit"-Variante. Co-Existenz-Race (Sandbox offen +
  // embedded-Drag persistiert) → Backlog (selten, dokumentiert).
  const persistMutation = useMutation({
    mutationFn: async (vars: PositionMutationVars) => {
      const body: Record<string, number> = {
        posXCm: Math.round(vars.posXCm),
        posYCm: Math.round(vars.posYCm),
        posZCm: Math.round(vars.posZCm),
      };
      if (vars.rotationDeg !== undefined) {
        body.rotationDeg = Math.round(vars.rotationDeg);
      }
      await apiClient.patch(
        `/loading/package-item/${vars.itemId}/position`,
        body,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['nv-loading', tourId] });
    },
  });

  // BUG-D-Fix: resolveVehicleCapacity statt getVehicleDims —
  // Tonnen-Notation ("12T") wird korrekt aufgeloest (8.7-13 ldm)
  // statt auf Koffer-7t (6 ldm) zurueckzufallen. Mirror der
  // Vollansicht-Pattern (NvLoadingPlanPage L177-189).
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
      flattenNvPackages(
        tourQ.data ?? null,
        capacity.widthCm,
        capacity.lengthCm,
        capacity.heightCm,
      ),
    [tourQ.data, capacity.widthCm, capacity.lengthCm, capacity.heightCm],
  );

  // BUG-D-Fix KRITISCH: unplaced-Items vor LoadingPlan3D filtern.
  // placePackages markiert Overflow als {unplaced: true, posX:0,
  // posY:0, posZ:0}. Ohne Filter stapeln alle unplaced am Trailer-
  // Ursprung → DAS war die sichtbare Verschachtelung.
  // Mirror NvLoadingPlanPage L279-282.
  const renderedPackages = useMemo(
    () => packages.filter((p) => !p.unplaced),
    [packages],
  );

  // Dispo-Sicherheit: unplaced-Banner. Items, die nicht in den Trailer
  // passen, werden vom Filter (renderedPackages) unsichtbar — der Banner
  // ist die einzige Meldung. Mirror Vollansicht (NvLoadingPlanPage +
  // LoadingPlanPage).
  // Regel #2: betroffen = Sendung mit MIND. 1 unplaced Packstück.
  // Aggregation auf shipmentId statt Packstück-Zaehlung.
  const unplacedShipmentCount = useMemo(
    () =>
      new Set(
        packages
          .filter((p) => p.unplaced)
          .map((p) => (p as { shipmentId?: string }).shipmentId ?? ''),
      ).size,
    [packages],
  );

  const code = tourQ.data?.nv_stamm_tour?.code ?? '—';
  // Display-Label: fahrzeug_typ aus Tour/Sub bevorzugt (zeigt z.B.
  // "12T"); Fallback auf maxLdm-Approximation wenn keine Beschriftung.
  const typLabel =
    (tourQ.data?.fahrzeug_typ ?? '').trim() ||
    (tourQ.data?.subunternehmer?.fahrzeug_typ ?? '').trim() ||
    `${capacity.maxLdm.toFixed(1)} ldm`;

  return (
    <PanelShell
      title={`NV-Beladeplan · ${code}`}
      vehicleInfo={`${typLabel} · ${(capacity.lengthCm / 100).toFixed(1)}×${(capacity.widthCm / 100).toFixed(2)}×${(capacity.heightCm / 100).toFixed(2)} m`}
      pkgCount={packages.length}
      unplacedShipmentCount={unplacedShipmentCount}
      fullViewHref={`/nv-loading/${tourId}`}
      isLoading={tourQ.isLoading}
      hasData={!!tourQ.data}
    >
      {/* D3a: vertikaler Split — 3D oben (h-[480px] aus LoadingPlan3D
          selbst), AchsLast-Panel unten. Container hat overflow-auto
          damit der Inhalt scrollt wenn das Dock-Panel kleiner ist. */}
      <div className="h-full overflow-auto">
        <LoadingPlan3D
          vehicle={{
            lengthCm: capacity.lengthCm,
            widthCm: capacity.widthCm,
            heightCm: capacity.heightCm,
          }}
          packages={renderedPackages}
          frameloop={frameloop}
          onPositionChange={(id, posXCm, posYCm, posZCm, rotationDeg) => {
            // D2: synth-Filter via dbItemId. Quantity-Klone q>0 + synth
            // ":pkg:"-Fallbacks haben kein dbItemId und sind BE-seitig
            // nicht persistierbar (1 Row pro line_index).
            const pkg = renderedPackages.find((p) => p.id === id);
            const dbItemId = (pkg as { dbItemId?: string } | undefined)
              ?.dbItemId;
            if (!dbItemId) return;
            persistMutation.mutate({
              itemId: dbItemId,
              posXCm,
              posYCm,
              posZCm,
              rotationDeg,
            });
          }}
        />
        {/* D3a: AchsLast-Panel. vehicleType-Heuristik: maxLdm-Buckets
            wie in der NV-Vollansicht (NvLoadingPlanPage L949-953).
            BUG-V-Fix-Mirror: vehicle.type (getVehicleDims) wuerde fuer
            Tonnen-Typen falsch auf "Koffer 7t" zurueckfallen. */}
        <div className="px-3 pb-3">
          <AxleLoadPanel
            packages={renderedPackages.map((p) => ({
              posY: p.posY,
              weightKg: Number(p.weightKg) || 0,
            }))}
            vehicleType={
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
      </div>
    </PanelShell>
  );
}

/* ─── FV-Variante ──────────────────────────────────────────── */

function FvBody({
  tourId,
  frameloop,
}: {
  tourId: string;
  frameloop: 'always' | 'never';
}) {
  const queryClient = useQueryClient();
  // D2: volle OptimizeResponse statt FvOptimizeLite-Stub —
  // F①-a (loadingFv.ts) liefert die Lib-Shape, expandPackagesFromOrder
  // produziert Packages MIT dbItemId fuer den PATCH-Lookup.
  const tourQ = useQuery<OptimizeResponse | null>({
    queryKey: ['loading', 'optimize', tourId],
    queryFn: async () => {
      const { data } = await apiClient.get<OptimizeResponse>(
        `/loading/tour/${tourId}/optimize`,
      );
      return data;
    },
    enabled: !!tourId,
    staleTime: 10_000,
    retry: 1,
  });

  const vehicleDims = useMemo(() => {
    const v = tourQ.data?.recommendedVehicle;
    if (!v || !v.lengthCm || !v.widthCm || !v.heightCm) {
      return DEFAULT_TRAILER_CM;
    }
    return {
      lengthCm: v.lengthCm,
      widthCm: v.widthCm,
      heightCm: v.heightCm,
    };
  }, [tourQ.data?.recommendedVehicle]);

  // D2: expandPackagesFromOrder (F①-a-Lib) + placePackages (shared lib)
  // — gleicher Pfad wie Vollansicht. Packages tragen dbItemId, sodass
  // der Drag-Handler unten den PATCH-Endpoint adressieren kann.
  // Return-Type inferred (Package & SharedPlacedPackage[]) — kann
  // .unplaced enthalten (placePackages markiert Overflow).
  const placedPackages = useMemo(() => {
    const order = tourQ.data?.loadingOrder ?? [];
    if (order.length === 0) return [];
    const expanded = expandPackagesFromOrder(order);
    return placePackages(
      sortPackagesForOptimalPack(expanded),
      vehicleDims.lengthCm,
      vehicleDims.widthCm,
      vehicleDims.heightCm,
    );
  }, [tourQ.data?.loadingOrder, vehicleDims]);

  // Mirror NV: unplaced filtern bevor LoadingPlan3D rendert (sonst
  // stapeln Overflow-Pakete am Trailer-Ursprung).
  const renderedPackages = useMemo<Plan3DPackage[]>(
    () =>
      placedPackages.filter((p) => !p.unplaced).map((p) => ({
        id: p.id,
        lengthCm: p.lengthCm,
        widthCm: p.widthCm,
        heightCm: p.heightCm,
        posX: p.posX,
        posY: p.posY,
        posZ: p.posZ,
        color: p.color,
        isStackable: p.isStackable,
        rotationDeg: p.rotationDeg,
      })),
    [placedPackages],
  );

  // Regel #2: distinct Sendungen mit mind. 1 unplaced (analog NV).
  const unplacedShipmentCount = useMemo(
    () =>
      new Set(
        placedPackages
          .filter((p) => p.unplaced)
          .map((p) => p.shipmentId),
      ).size,
    [placedPackages],
  );

  const persistMutation = useMutation({
    mutationFn: async (vars: PositionMutationVars) => {
      const body: Record<string, number> = {
        posXCm: Math.round(vars.posXCm),
        posYCm: Math.round(vars.posYCm),
        posZCm: Math.round(vars.posZCm),
      };
      if (vars.rotationDeg !== undefined) {
        body.rotationDeg = Math.round(vars.rotationDeg);
      }
      await apiClient.patch(
        `/loading/package-item/${vars.itemId}/position`,
        body,
      );
    },
    onSettled: () => {
      // Selbe queryKey wie LoadingPlanPage.persistItemPositionMutation
      // → tanstack dedup'd; Vollansicht + Panel bekommen denselben
      // Re-Fetch nach PATCH.
      queryClient.invalidateQueries({
        queryKey: ['loading', 'optimize', tourId],
      });
    },
  });

  const vehicleType = tourQ.data?.recommendedVehicle?.type ?? 'Sattel';

  return (
    <PanelShell
      title={`FV-Beladeplan`}
      vehicleInfo={`${vehicleType} · ${(vehicleDims.lengthCm / 100).toFixed(1)}×${(vehicleDims.widthCm / 100).toFixed(2)}×${(vehicleDims.heightCm / 100).toFixed(2)} m`}
      pkgCount={renderedPackages.length}
      unplacedShipmentCount={unplacedShipmentCount}
      fullViewHref={`/loading/${tourId}`}
      isLoading={tourQ.isLoading}
      hasData={!!tourQ.data}
    >
      {/* D3a: vertikaler Split — 3D oben (h-[480px] aus LoadingPlan3D
          selbst), AchsLast-Panel unten. Mirror NvBody. */}
      <div className="h-full overflow-auto">
        <LoadingPlan3D
          vehicle={vehicleDims}
          packages={renderedPackages}
          frameloop={frameloop}
          onPositionChange={(id, posXCm, posYCm, posZCm, rotationDeg) => {
            // D2: synth-Filter via dbItemId. Quantity-Klone q>0 +
            // synth ":pkg:"-Fallbacks (siehe loadingFv.expandPackages-
            // FromOrder L229-244) haben dbItemId=undefined und sind
            // nicht persistierbar (BE-Side: 1 Row pro line_index).
            const pkg = placedPackages.find((p) => p.id === id);
            if (!pkg?.dbItemId) return;
            persistMutation.mutate({
              itemId: pkg.dbItemId,
              posXCm,
              posYCm,
              posZCm,
              rotationDeg,
            });
          }}
        />
        {/* D3a: AchsLast-Panel. vehicleType aus recommendedVehicle.type
            (FV-Vollansicht-Pattern: selectedVehicle?.type ?? Sattel).
            packages aus placedPackages (PlacedPackage hat weightKg
            aus expandPackagesFromOrder), unplaced gefiltert. */}
        <div className="px-3 pb-3">
          <AxleLoadPanel
            packages={placedPackages
              .filter((p) => !p.unplaced)
              .map((p) => ({
                posY: p.posY,
                weightKg: Number(p.weightKg) || 0,
              }))}
            vehicleType={vehicleType}
            trailerLength_m={vehicleDims.lengthCm / 100}
            groundedCount={renderedPackages.filter((p) => p.posZ < 1e-6).length}
            totalCount={renderedPackages.length}
          />
        </div>
      </div>
    </PanelShell>
  );
}

/* ─── Shell (Header + Slot) ────────────────────────────────── */

function PanelShell({
  title,
  vehicleInfo,
  pkgCount,
  unplacedShipmentCount,
  fullViewHref,
  isLoading,
  hasData,
  children,
}: {
  title: string;
  vehicleInfo: string;
  pkgCount: number;
  unplacedShipmentCount: number;
  fullViewHref: string;
  isLoading: boolean;
  hasData: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-white text-xs">
        <span className="font-semibold text-gray-800">{title}</span>
        <span className="text-gray-500">· {vehicleInfo}</span>
        <span className="ml-auto text-gray-400">{pkgCount} Packstücke</span>
        <Link
          to={fullViewHref}
          className="inline-flex items-center gap-1 px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          title="Vollansicht öffnen (mit Drag, Stapelung, Achslast)"
        >
          <Maximize2 size={11} />
          Vollansicht
        </Link>
      </div>
      {hasData && unplacedShipmentCount > 0 && (
        <div
          role="alert"
          className="px-3 py-1.5 border-b border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium"
        >
          ⚠ {unplacedShipmentCount} Sendung(en) passen nicht auf den Trailer
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            Lädt Tour…
          </div>
        )}
        {!isLoading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            Tour nicht gefunden.
          </div>
        )}
        {hasData && children}
      </div>
    </div>
  );
}

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
import ContextMenu, {
  type ContextMenuItem,
} from '../../components/loadingplan/ContextMenu';
import InsertModeBanner from '../../components/loadingplan/InsertModeBanner';
import { useInsertMode } from '../../hooks/useInsertMode';
import {
  computeInsertedOrder,
  findInsertTarget,
} from '../../lib/insertCascade';
import { Trash2, RotateCcw } from 'lucide-react';
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
  // D3c-Hinweis: Insert-Mode (Hotkey 'i'/Esc) ist im NV-Embedded
  // NICHT aktiv. NV-Insert verschiebt Cascade-Items in der Tour —
  // im Vollansicht-Pfad geschuetzt durch Sandbox-Reducer
  // ("alles oder nichts" via Uebernehmen). Direct-PATCH-Loop hier
  // ohne Sandbox waere Partial-Failure-anfaellig. → Insert bleibt
  // der Vollansicht /nv-loading/:tourId vorbehalten.
  const queryClient = useQueryClient();
  // D3b: ContextMenu-State. dbItemId fuer Position-Reset
  // (PATCH /loading/package-item/:id/position null), shipmentId
  // fuer Sendungs-Aktionen (Remove via stopId-Lookup).
  const [ctxMenu, setCtxMenu] = useState<{
    pkgId: string;
    dbItemId?: string;
    shipmentId: string;
    x: number;
    y: number;
  } | null>(null);

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

  // D3b: Position-Reset via null-Body. loading.controller.ts:64-73
  // akzeptiert posXCm/posYCm/posZCm als number|null — null = Reset
  // auf Auto-Placer (BE-Pos wird verworfen).
  const resetPositionMutation = useMutation({
    mutationFn: async (dbItemId: string) => {
      await apiClient.patch(
        `/loading/package-item/${dbItemId}/position`,
        { posXCm: null, posYCm: null, posZCm: null },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['nv-loading', tourId] });
    },
  });

  // D3b: Sendung-Entfernen via NV-eigenem Endpoint
  // DELETE /nv-touren/:tourId/stops/:stopId (stopId-Lookup aus
  // tourQ.data.stops; shipments.tour_id liegt bei NV nicht direkt
  // an, daher der FV-Endpoint /tours/:id/remove-shipment passt
  // hier technisch NICHT — NV-Tours leben in nv_touren, NV-Stops
  // in nv_tour_stops).
  const removeShipmentMutation = useMutation({
    mutationFn: async (shipmentId: string) => {
      const stop = tourQ.data?.stops.find(
        (s) => s.shipment.id === shipmentId,
      );
      if (!stop) {
        throw new Error(`Stop fuer Sendung ${shipmentId} nicht gefunden`);
      }
      await apiClient.delete(`/nv-touren/${tourId}/stops/${stop.id}`);
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
      {/* D3a + Hoehen-Refactor: vertikaler flex-col Split. 3D-Wrapper
          flex-1 (fuellt Rest-Hoehe), AxleLoadPanel shrink-0 (content-
          basiert). LoadingPlan3D selbst hat seit dem Refactor h-full +
          min-h-[200px] — Eltern bestimmt die Hoehe. */}
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0">
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
            onPackageContextMenu={(pkgId, x, y) => {
              // D3b: Regel #2 (ganze Sendung) — Rechtsklick auf Palette
              // liefert pkgId, wir loesen die shipmentId daraus auf und
              // exponieren beide an die ContextMenu-Items. dbItemId
              // ist optional (NUR q===0/Single-Paket → Position-Reset
              // verfuegbar).
              const pkg = renderedPackages.find((p) => p.id === pkgId);
              if (!pkg) return;
              const dbItemId = (pkg as { dbItemId?: string }).dbItemId;
              const shipmentId =
                (pkg as { shipmentId?: string }).shipmentId ?? '';
              setCtxMenu({ pkgId, dbItemId, shipmentId, x, y });
            }}
          />
        </div>
        {/* D3a: AchsLast-Panel. vehicleType-Heuristik: maxLdm-Buckets
            wie in der NV-Vollansicht (NvLoadingPlanPage L949-953).
            BUG-V-Fix-Mirror: vehicle.type (getVehicleDims) wuerde fuer
            Tonnen-Typen falsch auf "Koffer 7t" zurueckfallen. */}
        <div className="px-3 pb-3 shrink-0 overflow-y-auto">
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
      {/* D3b: ContextMenu — DIRECT-Varianten ohne Sandbox. Aktionen
          wirken auf die ganze Sendung (Regel #2). Position-Reset
          erfordert dbItemId (q===0/single Paket). */}
      {ctxMenu &&
        (() => {
          const shipNr =
            tourQ.data?.stops.find(
              (s) => s.shipment.id === ctxMenu.shipmentId,
            )?.shipment.shipment_number ?? '';
          const items: ContextMenuItem[] = [
            {
              label: 'Position zurücksetzen',
              icon: <RotateCcw size={12} />,
              disabled: !ctxMenu.dbItemId,
              onClick: () => {
                if (!ctxMenu.dbItemId) return;
                resetPositionMutation.mutate(ctxMenu.dbItemId);
              },
              separator: true,
            },
            {
              label: 'Sendung aus Tour entfernen',
              icon: <Trash2 size={12} />,
              danger: true,
              disabled: !ctxMenu.shipmentId,
              onClick: () => {
                if (!ctxMenu.shipmentId) return;
                if (
                  !window.confirm(
                    `Sendung ${shipNr} von Tour entfernen?`,
                  )
                ) {
                  return;
                }
                removeShipmentMutation.mutate(ctxMenu.shipmentId);
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
  // D3c: Insert-Mode — page-local State, Hotkey 'i'/Esc.
  // FV-only: NV-Insert ist Sandbox-Pflicht (Partial-Failure-
  // Schutz), bleibt der Vollansicht vorbehalten.
  const insertMode = useInsertMode();
  // D3b: ContextMenu-State. shipmentId fuer Stapelbar-Toggle +
  // Remove. isStackable kommt aus loadingOrder (Shipment-Ebene).
  const [ctxMenu, setCtxMenu] = useState<{
    pkgId: string;
    shipmentId: string;
    x: number;
    y: number;
  } | null>(null);

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

  // D3b: Stapelbar-Toggle (PATCH /shipments/:id/stackable) — 1:1
  // aus LoadingPlanPage.setShipmentStackableMutation portiert,
  // ohne optimistic update (Embedded ist Light — invalidate
  // reicht).
  const setStackableMutation = useMutation({
    mutationFn: async (vars: { shipmentId: string; stackable: boolean }) => {
      await apiClient.patch(`/shipments/${vars.shipmentId}/stackable`, {
        stackable: vars.stackable,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['loading', 'optimize', tourId],
      });
    },
  });

  // D3b: Sendung-Entfernen via FV-Endpoint
  // POST /tours/:tourId/remove-shipment. 1:1 aus Vollansicht.
  const removeShipmentMutation = useMutation({
    mutationFn: async (shipmentId: string) => {
      await apiClient.post(`/tours/${tourId}/remove-shipment`, {
        shipmentId,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['loading', 'optimize', tourId],
      });
    },
  });

  // D3c: Insert-Mode Drop-Cascade-Handler — 1:1 aus
  // LoadingPlanPage.handleInsertAt (L419-498) portiert.
  // findInsertTarget → computeInsertedOrder → placePackages →
  // Loop PATCH /loading/package-item/:id/position. KEIN Sandbox.
  const handleInsertAt = (
    draggedId: string,
    targetId: string | null,
    dropPosY: number,
  ) => {
    if (!draggedId) {
      insertMode.cancel();
      return;
    }
    // Synth-Filter wie D2: ":pkg:"-Fallbacks + ":q*"-Quantity-Klone
    // haben dbItemId=undefined; ohne Persist-Anker macht Cascade
    // keinen Sinn.
    const draggedPkg = placedPackages.find((p) => p.id === draggedId);
    if (!draggedPkg?.dbItemId) {
      insertMode.cancel();
      return;
    }
    const placedNoUnplaced = placedPackages.filter((p) => !p.unplaced);
    // Falls LP3D keinen target erkannt hat, selbst suchen (renderedPackages
    // hat schon nur die placed Items — Mirror Vollansicht-Logik).
    const t =
      targetId ??
      findInsertTarget(placedNoUnplaced, dropPosY, draggedId);
    if (!t || t === draggedId) {
      // Kein sinnvolles Ziel → normaler Direct-Drop via persistMutation,
      // KEIN Cascade-Re-Pack.
      persistMutation.mutate({
        itemId: draggedPkg.dbItemId,
        posXCm: 0,
        posYCm: dropPosY,
        posZCm: 0,
      });
      insertMode.cancel();
      return;
    }
    // Reorder + Re-Pack.
    const reordered = computeInsertedOrder(
      placedNoUnplaced.map((p) => ({ id: p.id })),
      draggedId,
      t,
    )
      .map((x) => placedNoUnplaced.find((p) => p.id === x.id)!)
      .filter(Boolean);
    const repacked = placePackages(
      reordered.map((p) => ({
        id: p.id,
        shipmentId: p.shipmentId,
        shipmentNumber: p.shipmentNumber,
        packageIndex: p.packageIndex,
        dbItemId: p.dbItemId,
        lengthCm: p.lengthCm,
        widthCm: p.widthCm,
        heightCm: p.heightCm,
        weightKg: p.weightKg,
        color: p.color,
        isStackable: p.isStackable,
        rotationDeg: p.rotationDeg,
        stopOrder: p.stopOrder,
        // storedPos auf null setzen — sonst snapped placePackages
        // direkt zur gespeicherten Position und ignoriert die neue
        // Reihenfolge.
        storedPosX: null,
        storedPosY: null,
        storedPosZ: null,
      })),
      vehicleDims.lengthCm,
      vehicleDims.widthCm,
      vehicleDims.heightCm,
    );
    // Loop PATCH — Persist alle DB-Items. unplaced + Klone ohne
    // dbItemId werden uebersprungen (Phantom-Pos vermeiden).
    void (async () => {
      try {
        for (const pkg of repacked) {
          if (!pkg.dbItemId) continue;
          if (pkg.unplaced) continue;
          await apiClient.patch(
            `/loading/package-item/${pkg.dbItemId}/position`,
            {
              posXCm: Math.round(pkg.posX),
              posYCm: Math.round(pkg.posY),
              posZCm: Math.round(pkg.posZ),
              rotationDeg: pkg.rotationDeg ?? 0,
            },
          );
        }
        await queryClient.invalidateQueries({
          queryKey: ['loading', 'optimize', tourId],
        });
      } catch (_e) {
        // Partial-Failure-Risk im embedded ohne Sandbox bewusst
        // toleriert (Vollansicht hat fuer diesen Fall Sandbox-
        // Schutz). Re-Fetch via invalidate beim Catch-Cleanup.
        await queryClient.invalidateQueries({
          queryKey: ['loading', 'optimize', tourId],
        });
      }
      insertMode.cancel();
    })();
  };

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
      {/* D3a + Hoehen-Refactor: vertikaler flex-col Split. 3D-Wrapper
          flex-1, AxleLoadPanel shrink-0. Mirror NvBody. */}
      <div className="h-full flex flex-col min-h-0">
        {/* D3c: Insert-Mode-Banner (Hotkey 'i' aktiviert). Nur FV. */}
        {insertMode.active && (
          <div className="px-3 pt-3">
            <InsertModeBanner
              active={insertMode.active}
              onCancel={insertMode.cancel}
            />
          </div>
        )}
        <div className="flex-1 min-h-0">
          <LoadingPlan3D
            vehicle={vehicleDims}
            packages={renderedPackages}
            frameloop={frameloop}
            insertMode={insertMode.active}
            onInsertAt={handleInsertAt}
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
            onPackageContextMenu={(pkgId, x, y) => {
              // D3b: Regel #2 — Aktion auf ganze Sendung.
              const pkg = placedPackages.find((p) => p.id === pkgId);
              if (!pkg) return;
              setCtxMenu({
                pkgId,
                shipmentId: pkg.shipmentId,
                x,
                y,
              });
            }}
          />
        </div>
        {/* D3a: AchsLast-Panel. vehicleType aus recommendedVehicle.type
            (FV-Vollansicht-Pattern: selectedVehicle?.type ?? Sattel).
            packages aus placedPackages (PlacedPackage hat weightKg
            aus expandPackagesFromOrder), unplaced gefiltert. */}
        <div className="px-3 pb-3 shrink-0 overflow-y-auto">
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
      {/* D3b: ContextMenu — FV Direct-Aktionen (Stapelbar + Remove).
          1:1 aus LoadingPlanPage portiert, ohne Sandbox. */}
      {ctxMenu &&
        (() => {
          const ship = (tourQ.data?.loadingOrder ?? []).find(
            (s) => s.id === ctxMenu.shipmentId,
          );
          const isStackable = ship?.isStackable ?? true;
          const items: ContextMenuItem[] = [
            {
              label: isStackable
                ? 'Nicht stapelbar setzen'
                : 'Stapelbar setzen',
              onClick: () =>
                setStackableMutation.mutate({
                  shipmentId: ctxMenu.shipmentId,
                  stackable: !isStackable,
                }),
              separator: true,
            },
            {
              label: 'Sendung aus Tour entfernen',
              danger: true,
              icon: <Trash2 size={12} />,
              onClick: () => {
                if (
                  !window.confirm(
                    `Sendung ${ship?.shipmentNumber ?? ''} von Tour entfernen?`,
                  )
                ) {
                  return;
                }
                removeShipmentMutation.mutate(ctxMenu.shipmentId);
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

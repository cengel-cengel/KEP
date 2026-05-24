/**
 * S-2b LoadingPlanPanel — 3D-Beladeplan als Workspace-Panel.
 *
 * READ-ONLY-View für die aktive Tour (activeTourViewId aus
 * WorkspaceRuntime). Persistenz/Drag bleiben der Vollansicht-Route
 * vorbehalten (/loading|/nv-loading/:tourId).
 *
 * Modus-bewusst:
 *   - mode=nv: GET /nv-touren/:tourId/loading → flattenPackages →
 *              Plan3DPackage[] (per-package, mit DB-Positionen).
 *   - mode=fv: GET /loading/tour/:tourId/optimize → layout.items
 *              (shipment-level, pre-placed 2D). Heightes aus
 *              loadingOrder. Read-only-genug — Detail-Aufbau ist
 *              Vollansicht-Aufgabe.
 *
 * frameloop-Gating:
 *   useDockPanelApi() liefert dockview-Panel-Api → isVisible +
 *   onDidVisibilityChange. Sichtbar='always', versteckt='never'.
 *   Damit frisst der 3D-Canvas im Hintergrund-Tab KEINE GPU.
 *
 * Vollansicht-Link: öffnet Route im selben Tab (Spec lässt offen,
 * default same-tab; Cmd-Click = neuer Tab via Browser-Default).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { getVehicleDims, resolveFahrzeugTyp } from '../../lib/vehicleTypes';

/** Fallback wenn FV-recommendedVehicle fehlt. */
const FV_DEFAULT_DIMS = { lengthCm: 1360, widthCm: 240, heightCm: 270 };

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

  const vehicle = useMemo(() => {
    const fz = resolveFahrzeugTyp(
      tourQ.data?.fahrzeug_typ,
      tourQ.data?.subunternehmer?.fahrzeug_typ,
    );
    return getVehicleDims(fz);
  }, [tourQ.data?.fahrzeug_typ, tourQ.data?.subunternehmer?.fahrzeug_typ]);

  const packages = useMemo(
    () =>
      flattenNvPackages(
        tourQ.data ?? null,
        vehicle.widthCm,
        vehicle.lengthCm,
      ),
    [tourQ.data, vehicle.widthCm, vehicle.lengthCm],
  );

  const code = tourQ.data?.nv_stamm_tour?.code ?? '—';

  return (
    <PanelShell
      title={`NV-Beladeplan · ${code}`}
      vehicleInfo={`${vehicle.type} · ${(vehicle.lengthCm / 100).toFixed(1)}×${(vehicle.widthCm / 100).toFixed(2)}×${(vehicle.heightCm / 100).toFixed(2)} m`}
      pkgCount={packages.length}
      fullViewHref={`/nv-loading/${tourId}`}
      isLoading={tourQ.isLoading}
      hasData={!!tourQ.data}
    >
      <LoadingPlan3D
        vehicle={{
          lengthCm: vehicle.lengthCm,
          widthCm: vehicle.widthCm,
          heightCm: vehicle.heightCm,
        }}
        packages={packages}
        frameloop={frameloop}
        readOnly
      />
    </PanelShell>
  );
}

/* ─── FV-Variante ──────────────────────────────────────────── */

interface FvLayoutItem {
  shipmentId: string;
  xPos: number;
  yPos: number;
  length: number;
  width: number;
  color: string;
}

interface FvOptimizeLite {
  recommendedVehicle?: {
    type?: string;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
  };
  loadingOrder?: Array<{
    id: string;
    shipmentNumber?: string;
    heightCm?: number;
  }>;
  layout?: {
    items?: FvLayoutItem[];
  };
}

function FvBody({
  tourId,
  frameloop,
}: {
  tourId: string;
  frameloop: 'always' | 'never';
}) {
  const tourQ = useQuery<FvOptimizeLite | null>({
    queryKey: ['loading', 'optimize', tourId],
    queryFn: async () => {
      const { data } = await apiClient.get<FvOptimizeLite>(
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
    if (!v || !v.lengthCm || !v.widthCm || !v.heightCm) return FV_DEFAULT_DIMS;
    return {
      lengthCm: v.lengthCm,
      widthCm: v.widthCm,
      heightCm: v.heightCm,
    };
  }, [tourQ.data?.recommendedVehicle]);

  const packages: Plan3DPackage[] = useMemo(() => {
    const items = tourQ.data?.layout?.items ?? [];
    const order = tourQ.data?.loadingOrder ?? [];
    const orderById = new Map(order.map((s) => [s.id, s]));
    return items.map((it, idx) => {
      const ship = orderById.get(it.shipmentId);
      const rawHeight = Number(ship?.heightCm);
      const heightCm = rawHeight > 0 ? rawHeight : 120;
      return {
        id: `${it.shipmentId}:agg:${idx}`,
        lengthCm: it.length,
        widthCm: it.width,
        heightCm,
        posX: it.xPos,
        posY: it.yPos,
        posZ: 0,
        color: it.color,
      };
    });
  }, [tourQ.data?.layout?.items, tourQ.data?.loadingOrder]);

  const vehicleType = tourQ.data?.recommendedVehicle?.type ?? 'Jumbo';

  return (
    <PanelShell
      title={`FV-Beladeplan`}
      vehicleInfo={`${vehicleType} · ${(vehicleDims.lengthCm / 100).toFixed(1)}×${(vehicleDims.widthCm / 100).toFixed(2)}×${(vehicleDims.heightCm / 100).toFixed(2)} m`}
      pkgCount={packages.length}
      fullViewHref={`/loading/${tourId}`}
      isLoading={tourQ.isLoading}
      hasData={!!tourQ.data}
    >
      <LoadingPlan3D
        vehicle={vehicleDims}
        packages={packages}
        frameloop={frameloop}
        readOnly
      />
    </PanelShell>
  );
}

/* ─── Shell (Header + Slot) ────────────────────────────────── */

function PanelShell({
  title,
  vehicleInfo,
  pkgCount,
  fullViewHref,
  isLoading,
  hasData,
  children,
}: {
  title: string;
  vehicleInfo: string;
  pkgCount: number;
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

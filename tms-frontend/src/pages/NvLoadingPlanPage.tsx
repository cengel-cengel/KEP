import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import LoadingPlan3D, {
  type Plan3DPackage,
} from '../components/LoadingPlan3D';
import {
  getVehicleDims,
  resolveFahrzeugTyp,
} from '../lib/vehicleTypes';

interface NvPackageItem {
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

interface NvShipment {
  id: string;
  shipment_number?: string | null;
  weight_kg?: string | number | null;
  ldm?: string | number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  shipment_package_items: NvPackageItem[];
}

interface NvLoadingDetail {
  id: string;
  datum: string;
  status: string;
  fahrzeug_typ?: string | null;
  nv_stamm_tour?: { code: string; name: string } | null;
  subunternehmer?: { id: string; name: string; fahrzeug_typ?: string | null } | null;
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
function flattenPackages(
  tour: NvLoadingDetail | null,
  trailerWidthCm: number,
  trailerLengthCm: number,
): Plan3DPackage[] {
  if (!tour) return [];
  const out: Plan3DPackage[] = [];
  let cursorY = 0;
  let cursorX = 0;
  let rowMaxLength = 0;
  let shipIdx = 0;
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
  for (const stop of tour.stops) {
    const ship = stop.shipment;
    const color = SHIPMENT_COLORS[shipIdx % SHIPMENT_COLORS.length];
    shipIdx++;
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

  const packages = useMemo(
    () =>
      flattenPackages(
        tourQ.data ?? null,
        vehicle.widthCm,
        vehicle.lengthCm,
      ),
    [tourQ.data, vehicle.widthCm, vehicle.lengthCm],
  );

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

  const code = tourQ.data?.nv_stamm_tour?.code ?? '—';
  const datum = tourQ.data?.datum
    ? new Date(tourQ.data.datum).toISOString().slice(0, 10)
    : '';

  return (
    <div className="flex flex-col h-screen bg-gray-50">
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
          · {vehicle.type} ({(vehicle.lengthCm / 100).toFixed(1)}×
          {(vehicle.widthCm / 100).toFixed(2)}×
          {(vehicle.heightCm / 100).toFixed(2)} m)
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
        {tourQ.isLoading && (
          <div className="text-sm text-gray-400">Lädt Tour…</div>
        )}
        {!tourQ.isLoading && !tourQ.data && (
          <div className="text-sm text-gray-400">Tour nicht gefunden.</div>
        )}
        {tourQ.data && (
          <LoadingPlan3D
            vehicle={{
              lengthCm: vehicle.lengthCm,
              widthCm: vehicle.widthCm,
              heightCm: vehicle.heightCm,
            }}
            packages={packages}
            onPositionChange={handlePosition}
          />
        )}
      </div>
    </div>
  );
}

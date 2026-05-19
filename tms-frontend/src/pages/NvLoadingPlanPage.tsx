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

function flattenPackages(tour: NvLoadingDetail | null): Plan3DPackage[] {
  if (!tour) return [];
  const out: Plan3DPackage[] = [];
  let shipIdx = 0;
  for (const stop of tour.stops) {
    const ship = stop.shipment;
    const color = SHIPMENT_COLORS[shipIdx % SHIPMENT_COLORS.length];
    shipIdx++;
    const items = ship.shipment_package_items ?? [];
    // Sendung als 1 fully-stackable wenn alle items stackable!==false
    const shipFullyStackable = items.every((it) => it.stackable !== false);
    for (const it of items) {
      const qty = Math.max(1, Number(it.quantity ?? 1));
      // Pro item-quantity ein synth-Eintrag (id = item-id wenn qty=1,
      // sonst synth-id mit ":pkg:N"-Suffix — LoadingPlanPage-konsistent).
      for (let q = 0; q < qty; q++) {
        const synthSuffix = qty === 1 ? '' : `:pkg:${q}`;
        out.push({
          id: it.id + synthSuffix,
          lengthCm: Number(it.length_cm) || 0,
          widthCm: Number(it.width_cm) || 0,
          heightCm: Number(it.height_cm) || 0,
          posX: Number(it.pos_x_cm ?? 0) || 0,
          posY: Number(it.pos_y_cm ?? 0) || 0,
          posZ: Number(it.pos_z_cm ?? 0) || 0,
          weightKg: Number(it.weight_kg) || 0,
          color,
          isStackable: shipFullyStackable && it.stackable !== false,
          rotationDeg: Number(it.rotation_deg ?? 0) || 0,
        });
      }
    }
  }
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
    () => flattenPackages(tourQ.data ?? null),
    [tourQ.data],
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

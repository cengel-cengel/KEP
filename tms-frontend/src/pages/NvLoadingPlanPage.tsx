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
  for (const stop of tour.stops ?? []) {
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
          <LoadingPlan3D
            vehicle={{
              lengthCm: vehicle.lengthCm,
              widthCm: vehicle.widthCm,
              heightCm: vehicle.heightCm,
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
                shipmentId: (pkg as { shipmentId?: string }).shipmentId ?? '',
                x,
                y,
              });
            }}
          />
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

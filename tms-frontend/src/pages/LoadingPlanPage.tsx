import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingPlan3D from '../components/LoadingPlan3D';
import AxleLoadPanel from '../components/AxleLoadPanel';
import SecurementPanel from '../components/SecurementPanel';
import { api } from '../lib/api';
import { computeSecurement } from '../lib/loadSecurement';
import { computeStackingLdmMetrics } from '../lib/loadingLdm';
import { canStackOn } from '../lib/stackingRules';

/** Sattelzug-Standard, falls API keine Werte liefert */
const DEFAULT_TRAILER_CM = { lengthCm: 1360, widthCm: 240, heightCm: 270 };

const STOP_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ca8a04',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#ea580c',
  '#db2777',
] as const;

type LoadedItem = {
  shipmentId: string;
  xPos: number;
  yPos: number;
  length: number;
  width: number;
  color: string;
  label: string;
  row: number;
};

type Vehicle = {
  type: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  maxWeightKg?: number;
  maxLdm?: number;
};

const VEHICLES: Vehicle[] = [
  { type: 'Sprinter', lengthCm: 350, widthCm: 180, heightCm: 180, maxWeightKg: 1000, maxLdm: 2 },
  { type: 'Koffer 7t', lengthCm: 620, widthCm: 240, heightCm: 240, maxWeightKg: 3500, maxLdm: 6 },
  { type: 'Koffer 12t', lengthCm: 740, widthCm: 240, heightCm: 240, maxWeightKg: 6000, maxLdm: 8 },
  { type: 'Sattel', lengthCm: 1360, widthCm: 240, heightCm: 270, maxWeightKg: 24000, maxLdm: 13.6 },
  { type: 'Mega', lengthCm: 1360, widthCm: 240, heightCm: 300, maxWeightKg: 24000, maxLdm: 13.6 },
  { type: 'Jumbo', lengthCm: 1560, widthCm: 240, heightCm: 300, maxWeightKg: 24000, maxLdm: 15.6 },
];

function matchVehicleType(apiType: string | undefined): string {
  if (!apiType) return 'Jumbo';
  const t = apiType.trim().toLowerCase();
  const hit = VEHICLES.find((v) => v.type.toLowerCase() === t);
  return hit?.type ?? VEHICLES.find((v) => t.includes(v.type.toLowerCase()))?.type ?? 'Jumbo';
}

type ShipmentPackageItemLoad = {
  id: string;
  lineIndex: number;
  packageType: string;
  quantity: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  stackable: boolean;
  posXCm: number | null;
  posYCm: number | null;
  posZCm: number | null;
  rotationDeg: number;
};

type ShipmentLoad = {
  id: string;
  shipmentNumber: string;
  customer: string;
  deliveryCity: string;
  deliveryOrder: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  ldm: number;
  isStackable: boolean;
  packageCount: number;
  packageType: string;
  packageItems?: ShipmentPackageItemLoad[];
};

type OptimizeResponse = {
  recommendedVehicle: Vehicle;
  loadingOrder: ShipmentLoad[];
  layout: {
    vehicle: Vehicle;
    items: LoadedItem[];
    totalLdm: number;
    totalWeight: number;
    utilizationPercent: number;
    warnings: string[];
  };
  warnings: string[];
  draft?: { id: string; updated_at: string } | null;
  draftItems?: Array<{
    shipmentId: string;
    xPosCm: number;
    yPosCm: number;
    rotationAngle: number;
    stackLevel: number;
  }>;
};


interface Package {
  id: string;
  /** Real DB-uuid des shipment_package_items (falls vorhanden) — sonst undefined fuer synth. */
  dbItemId?: string;
  shipmentId: string;
  shipmentNumber: string;
  packageIndex: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  isStackable: boolean;
  color: string;
  stopOrder: number;
  /** Initial-Position aus DB falls vorhanden — sonst null = Auto-Placer. */
  storedPosX?: number | null;
  storedPosY?: number | null;
  storedPosZ?: number | null;
}

interface PlacedPackage extends Package {
  posX: number;
  posY: number;
  posZ: number;
  /** LP-1: 0 oder 90 (Y-axis Drag-Rotation, persistiert). */
  rotationDeg?: number;
}

function expandPackagesFromOrder(order: ShipmentLoad[]): Package[] {
  const list: Package[] = [];
  order.forEach((s, idx) => {
    const stopOrder = s.deliveryOrder ?? idx + 1;
    const color = STOP_COLORS[(Math.max(1, stopOrder) - 1) % STOP_COLORS.length];

    // Wenn DB-Items vorhanden: pro Quantity 1 Package (mit DB-uuid).
    if (s.packageItems && s.packageItems.length > 0) {
      // eslint-disable-next-line no-console
      console.log('[3D-DIAG] shipment', s.shipmentNumber, 'items:', s.packageItems.length);
      s.packageItems.forEach((it, i) => {
        const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
        const lengthCm = Number(it.lengthCm) || 120;
        const widthCm = Number(it.widthCm) || 80;
        const heightCm = Number(it.heightCm) || 120;
        const weightPerUnit = qty > 0 ? Number(it.weightKg) / qty : Number(it.weightKg);
        // eslint-disable-next-line no-console
        console.log(
          '[3D-DIAG]   item',
          it.id,
          'qty=', it.quantity, '→', qty,
          'L×W×H=', it.lengthCm, 'x', it.widthCm, 'x', it.heightCm,
          'kg=', it.weightKg, '→ /unit', weightPerUnit,
        );
        for (let q = 1; q <= qty; q++) {
          list.push({
            id: qty === 1 ? it.id : `${it.id}:q${q}`,
            // Nur das ERSTE der Quantity-Klone bekommt die echte DB-id
            // (PATCH /shipment-package-items/:id fuer Position).
            // Die anderen sind logische Duplikate ohne separater DB-Pos.
            dbItemId: q === 1 ? it.id : undefined,
            shipmentId: s.id,
            shipmentNumber: s.shipmentNumber,
            packageIndex: it.lineIndex || i + 1,
            lengthCm,
            widthCm,
            heightCm,
            weightKg: weightPerUnit,
            isStackable: it.stackable !== false,
            color,
            stopOrder,
            // storedPos nur fuer ersten Quantity-Klon
            storedPosX: q === 1 ? it.posXCm : null,
            storedPosY: q === 1 ? it.posYCm : null,
            storedPosZ: q === 1 ? it.posZCm : null,
          });
        }
      });
      return;
    }

    // Fallback: synthetische Pakete aus Aggregat-Daten.
    // eslint-disable-next-line no-console
    console.log('[3D-DIAG] shipment', s.shipmentNumber, 'NO packageItems → synth fallback', {
      packageCount: s.packageCount,
      lengthCm: s.lengthCm,
      widthCm: s.widthCm,
      heightCm: s.heightCm,
    });
    const n = Math.max(1, Math.round(Number(s.packageCount) || 1));
    const lc = Number(s.lengthCm);
    const wc = Number(s.widthCm);
    const hc = Number(s.heightCm);
    const hasAll = lc > 0 && wc > 0 && hc > 0;
    let lengthCm: number;
    let widthCm: number;
    let heightCm: number;
    if (hasAll) {
      lengthCm = lc;
      widthCm = wc;
      heightCm = hc;
    } else {
      const totalLdm = Math.max(0.01, Number(s.ldm) || 0.01);
      const singleLdm = totalLdm / n;
      lengthCm = singleLdm * 100;
      widthCm = 80;
      heightCm = 120;
    }
    const wKg = Number(s.weightKg) || 0;
    const weightKg = n > 0 ? wKg / n : 0;
    for (let i = 1; i <= n; i++) {
      list.push({
        id: `${s.id}:pkg:${i}`,
        shipmentId: s.id,
        shipmentNumber: s.shipmentNumber,
        packageIndex: i,
        lengthCm,
        widthCm,
        heightCm,
        weightKg,
        isStackable: s.isStackable,
        color,
        stopOrder,
      });
    }
  });
  return list;
}

function rectsOverlap2D(
  ax: number,
  ay: number,
  aw: number,
  al: number,
  bx: number,
  by: number,
  bw: number,
  bl: number,
): boolean {
  return ax < bx + bw - 1e-6 && bx < ax + aw - 1e-6 && ay < by + bl - 1e-6 && by < ay + al - 1e-6;
}

function getStackHeight(
  placed: PlacedPackage[],
  x: number,
  y: number,
  footprintW: number,
  footprintL: number,
): number {
  let maxTop = 0;
  for (const p of placed) {
    if (
      rectsOverlap2D(x, y, footprintW, footprintL, p.posX, p.posY, p.widthCm, p.lengthCm)
    ) {
      maxTop = Math.max(maxTop, p.posZ + p.heightCm);
    }
  }
  return maxTop;
}

/** Stapelplatz mit gleicher Bodenfläche (Breite×Länge), bevorzugt hinten (kleines posY) dann links. */
function findPreferredStackSlot(
  pkg: Package,
  placed: PlacedPackage[],
  pw: number,
  pl: number,
  ph: number,
  trailerH: number,
): { posX: number; posY: number; posZ: number } | null {
  if (!pkg.isStackable) return null;
  const seen = new Set<string>();
  const candidates: { x: number; y: number; posZ: number }[] = [];
  for (const p of placed) {
    if (p.widthCm !== pw || p.lengthCm !== pl) continue;
    // Basis muss stapelbar sein (Carlos-Regel via canStackOn)
    if (!canStackOn(p, pkg).allowed) continue;
    const key = `${p.posX},${p.posY}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sh = getStackHeight(placed, p.posX, p.posY, pw, pl);
    if (sh < 1e-6) continue;
    if (sh + ph > trailerH + 1e-6) continue;
    candidates.push({ x: p.posX, y: p.posY, posZ: sh });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 1e-6) return a.y - b.y;
    return a.x - b.x;
  });
  const c = candidates[0];
  return { posX: c.x, posY: c.y, posZ: c.posZ };
}

function placePackages(packages: Package[], trailerL: number, trailerW: number, trailerH: number): PlacedPackage[] {
  const placed: PlacedPackage[] = [];

  // Phase 1: Pakete mit gespeicherter Position direkt setzen.
  // Diese wirken im Anschluss als "Hindernisse" fuer Auto-Placer.
  const remaining: Package[] = [];
  for (const pkg of packages) {
    if (
      pkg.storedPosX != null &&
      pkg.storedPosY != null &&
      pkg.storedPosZ != null
    ) {
      const pw = Math.min(pkg.widthCm, trailerW);
      const pl = Math.min(pkg.lengthCm, trailerL);
      const ph = Math.min(pkg.heightCm, trailerH);
      placed.push({
        ...pkg,
        widthCm: pw,
        lengthCm: pl,
        heightCm: ph,
        posX: pkg.storedPosX,
        posY: pkg.storedPosY,
        posZ: pkg.storedPosZ,
      });
    } else {
      remaining.push(pkg);
    }
  }

  let currentY = 0;
  let currentX = 0;
  let rowMaxLength = 0;

  for (const pkg of remaining) {
    const pw = Math.min(pkg.widthCm, trailerW);
    const pl = Math.min(pkg.lengthCm, trailerL);
    const ph = Math.min(pkg.heightCm, trailerH);
    if (pw <= 0 || pl <= 0 || ph <= 0) continue;

    const stackSlot = findPreferredStackSlot(pkg, placed, pw, pl, ph, trailerH);
    if (stackSlot) {
      placed.push({
        ...pkg,
        widthCm: pw,
        lengthCm: pl,
        heightCm: ph,
        posX: stackSlot.posX,
        posY: stackSlot.posY,
        posZ: stackSlot.posZ,
      });
      continue;
    }

    let cx = currentX;
    let cy = currentY;
    let localRowMax = rowMaxLength;
    let placedOne = false;

    for (let guard = 0; guard < 200000; guard++) {
      if (placedOne) break;
      if (cx + pw > trailerW + 1e-6) {
        cy += localRowMax;
        cx = 0;
        localRowMax = 0;
      }
      if (cy + pl > trailerL + 1e-6) {
        placed.push({
          ...pkg,
          widthCm: pw,
          lengthCm: pl,
          heightCm: ph,
          posX: Math.max(0, trailerW - pw),
          posY: Math.max(0, trailerL - pl),
          posZ: 0,
        });
        currentX = 0;
        currentY = Math.min(trailerL, cy);
        rowMaxLength = 0;
        placedOne = true;
        break;
      }
      const stackH = getStackHeight(placed, cx, cy, pw, pl);
      let useZ = 0;
      if (stackH > 1e-6) {
        if (pkg.isStackable && stackH + ph <= trailerH + 1e-6) {
          useZ = stackH;
        } else {
          cx += Math.max(1, pw);
          continue;
        }
      }
      placed.push({
        ...pkg,
        widthCm: pw,
        lengthCm: pl,
        heightCm: ph,
        posX: cx,
        posY: cy,
        posZ: useZ,
      });
      currentX = cx + pw;
      currentY = cy;
      rowMaxLength = Math.max(localRowMax, pl);
      placedOne = true;
    }

    if (!placedOne) {
      placed.push({
        ...pkg,
        widthCm: pw,
        lengthCm: pl,
        heightCm: ph,
        posX: Math.max(0, trailerW - pw),
        posY: Math.max(0, trailerL - pl),
        posZ: 0,
      });
    }
  }

  return placed;
}

function trailerVolumeCm3(L: number, W: number, H: number): number {
  return L * W * H;
}

function packagesVolumeCm3(packs: PlacedPackage[]): number {
  let v = 0;
  for (const p of packs) {
    v += p.lengthCm * p.widthCm * p.heightCm;
  }
  return v;
}

/** Quader: x,y,z = Ecke unten-hinten-links in Trailer-Koordinaten; dx=Breite, dy=Tiefe, dz=Höhe */

export default function LoadingPlanPage() {
  const { tourId } = useParams<{ tourId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [manualPosById, setManualPosById] = useState<
    Record<string, { xPosCm: number; yPosCm: number; rotationAngle: number; stackLevel: number }>
  >({});
  // Phase G: viewMode entfernt — nur LoadingPlan3D bleibt.
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>('Jumbo');
  const [securementMu, setSecurementMu] = useState<number>(0.4);
  const [removedShipmentIds, setRemovedShipmentIds] = useState<string[]>([]);

  const optimizeQuery = useQuery({
    queryKey: ['loading', 'optimize', tourId],
    enabled: !!tourId,
    queryFn: async () => {
      const { data } = await api.get<OptimizeResponse>(`/loading/tour/${tourId}/optimize`);
      return data;
    },
    retry: 1,
  });

  const optimizeErrorText = (() => {
    const err = optimizeQuery.error as
      | { response?: { data?: { message?: string } }; message?: string }
      | undefined;
    if (!err) return '';
    const msg =
      err.response?.data &&
      typeof err.response.data === 'object' &&
      'message' in err.response.data &&
      typeof (err.response.data as { message?: string }).message === 'string'
        ? (err.response.data as { message: string }).message
        : err.message;
    return msg || 'Unbekannter Fehler';
  })();

  const effectiveOrder = useMemo(() => {
    const base = optimizeQuery.data?.loadingOrder ?? [];
    if (!manualOrder) return base;
    const map = new Map(base.map((s) => [s.id, s]));
    const fromManual = manualOrder.map((id) => map.get(id)).filter(Boolean) as ShipmentLoad[];
    const missing = base.filter((s) => !manualOrder.includes(s.id));
    return [...fromManual, ...missing];
  }, [optimizeQuery.data?.loadingOrder, manualOrder]);

  const activeOrder = useMemo(
    () => effectiveOrder.filter((s) => !removedShipmentIds.includes(s.id)),
    [effectiveOrder, removedShipmentIds],
  );

  const selectedVehicle = useMemo(() => {
    const byType = VEHICLES.find((v) => v.type === selectedVehicleType);
    if (byType) return byType;
    return optimizeQuery.data?.recommendedVehicle ?? VEHICLES[5];
  }, [selectedVehicleType, optimizeQuery.data?.recommendedVehicle]);

  const vehicleDims = useMemo(() => {
    const v = selectedVehicle;
    if (!v) return DEFAULT_TRAILER_CM;
    return {
      lengthCm: v.lengthCm > 0 ? v.lengthCm : DEFAULT_TRAILER_CM.lengthCm,
      widthCm: v.widthCm > 0 ? v.widthCm : DEFAULT_TRAILER_CM.widthCm,
      heightCm: v.heightCm > 0 ? v.heightCm : DEFAULT_TRAILER_CM.heightCm,
    };
  }, [selectedVehicle]);

  const packagesFlat = useMemo(() => expandPackagesFromOrder(activeOrder), [activeOrder]);



  const placedPackages = useMemo(
    () => {
      const r = placePackages(
        packagesFlat,
        vehicleDims.lengthCm,
        vehicleDims.widthCm,
        vehicleDims.heightCm,
      );
      // eslint-disable-next-line no-console
      console.log(
        '[3D-DIAG] placedPackages count=',
        r.length,
        'trailer=',
        vehicleDims,
        'sample=',
        r.slice(0, 5).map((p) => ({
          id: p.id,
          ship: p.shipmentNumber,
          lwh: [p.lengthCm, p.widthCm, p.heightCm],
          pos: [p.posX, p.posY, p.posZ],
          color: p.color,
        })),
      );
      return r;
    },
    [packagesFlat, vehicleDims.lengthCm, vehicleDims.widthCm, vehicleDims.heightCm],
  );

  const volUtil = useMemo(() => {
    const tv = trailerVolumeCm3(vehicleDims.lengthCm, vehicleDims.widthCm, vehicleDims.heightCm);
    const cv = packagesVolumeCm3(placedPackages);
    if (tv <= 0) return 0;
    return (cv / tv) * 100;
  }, [placedPackages, vehicleDims]);

  const maxLdmDisplay = useMemo(() => {
    const v = selectedVehicle;
    return v?.maxLdm && v.maxLdm > 0 ? v.maxLdm : 13.6;
  }, [selectedVehicle]);

  const maxWeightDisplay = useMemo(() => {
    const v = selectedVehicle;
    return v?.maxWeightKg && v.maxWeightKg > 0 ? v.maxWeightKg : 24000;
  }, [selectedVehicle]);

  const ldmMetrics = useMemo(
    () => computeStackingLdmMetrics(maxLdmDisplay, activeOrder),
    [maxLdmDisplay, activeOrder],
  );

  const weightUtil = useMemo(() => {
    const totalW = activeOrder.reduce((sum, s) => sum + (Number(s.weightKg) || 0), 0);
    if (maxWeightDisplay <= 0) return null;
    return (totalW / maxWeightDisplay) * 100;
  }, [activeOrder, maxWeightDisplay]);

  const trailerVolM3 = useMemo(() => {
    const v = trailerVolumeCm3(vehicleDims.lengthCm, vehicleDims.widthCm, vehicleDims.heightCm);
    return v / 1e6;
  }, [vehicleDims]);

  const cargoVolM3 = useMemo(() => packagesVolumeCm3(placedPackages) / 1e6, [placedPackages]);
  const totalWeightActive = useMemo(
    () => activeOrder.reduce((sum, s) => sum + (Number(s.weightKg) || 0), 0),
    [activeOrder],
  );
  const isOverloaded =
    ldmMetrics.floorPct > 100 ||
    ldmMetrics.effectivePct > 100 ||
    volUtil > 100 ||
    (weightUtil != null && weightUtil > 100);


  const applyOrderMutation = useMutation({
    mutationFn: async (shipmentIds: string[]) => {
      const { data } = await api.post(`/loading/tour/${tourId}/apply-order`, { shipmentIds });
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] }),
        queryClient.invalidateQueries({ queryKey: ['loading', 'tour-optimize-brief'] }),
        queryClient.invalidateQueries({ queryKey: ['shipments'] }),
        queryClient.invalidateQueries({ queryKey: ['tours'] }),
      ]);
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async (payload: {
      items: Array<{
        shipmentId: string;
        xPosCm: number;
        yPosCm: number;
        rotationAngle?: number;
        stackLevel?: number;
      }>;
    }) => {
      const { data } = await api.post(`/loading/tour/${tourId}/draft`, payload);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] });
    },
  });

  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 2500);
  }

  const persistItemPositionMutation = useMutation({
    mutationFn: async (vars: {
      itemId: string;
      posXCm: number;
      posYCm: number;
      posZCm: number;
      rotationDeg?: number;
    }) => {
      const { itemId, posXCm, posYCm, posZCm, rotationDeg } = vars;
      const body: Record<string, number> = {
        posXCm: Math.round(posXCm),
        posYCm: Math.round(posYCm),
        posZCm: Math.round(posZCm),
      };
      if (rotationDeg !== undefined) body.rotationDeg = Math.round(rotationDeg);
      await api.patch(`/loading/package-item/${itemId}/position`, body);
    },
    onSuccess: () => {
      showToast('Position gespeichert');
    },
    onError: (e) => {
      // eslint-disable-next-line no-console
      console.warn('persistItemPosition failed:', e);
      showToast('Speichern fehlgeschlagen', 'err');
    },
  });

  const resetPositionsMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/loading/tour/${tourId}/reset-positions`);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] });
      showToast('Positionen zurückgesetzt');
    },
    onError: () => {
      showToast('Reset fehlgeschlagen', 'err');
    },
  });

  function handleResetPositions() {
    if (!window.confirm('Alle gespeicherten Positionen verwerfen und Auto-Placement neu berechnen?')) return;
    resetPositionsMutation.mutate();
  }

  const handlePackagePosition = (
    id: string,
    posXCm: number,
    posYCm: number,
    posZCm: number,
    rotationDeg?: number,
  ) => {
    // Heuristik: synth-IDs enthalten ":pkg:" — die koennen wir nicht persistieren.
    if (!id || id.includes(':pkg:')) {
      // eslint-disable-next-line no-console
      console.info('synth package, kann nicht persistiert werden:', id);
      return;
    }
    persistItemPositionMutation.mutate({
      itemId: id,
      posXCm,
      posYCm,
      posZCm,
      rotationDeg,
    });
  };

  const clearDraftMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.delete(`/loading/tour/${tourId}/draft`);
      return data;
    },
    onSuccess: async () => {
      setManualPosById({});
      await queryClient.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] });
    },
  });
  const removeShipmentsMutation = useMutation({
    mutationFn: async (shipmentIds: string[]) => {
      if (!tourId) return null;
      for (const shipmentId of shipmentIds) {
        await api.post(`/tours/${tourId}/remove-shipment`, { shipmentId });
      }
      return { ok: true };
    },
    onSuccess: async () => {
      setRemovedShipmentIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] }),
        queryClient.invalidateQueries({ queryKey: ['loading', 'tour-optimize-brief'] }),
        queryClient.invalidateQueries({ queryKey: ['tours'] }),
        queryClient.invalidateQueries({ queryKey: ['shipments'] }),
      ]);
    },
  });


  useEffect(() => {
    setManualPosById({});
    setRemovedShipmentIds([]);
  }, [tourId]);

  useEffect(() => {
    if (!optimizeQuery.isSuccess || !optimizeQuery.data?.recommendedVehicle) return;
    setSelectedVehicleType(matchVehicleType(optimizeQuery.data.recommendedVehicle.type));
  }, [tourId, optimizeQuery.isSuccess, optimizeQuery.data?.recommendedVehicle?.type]);


  useEffect(() => {
    const rows = optimizeQuery.data?.draftItems ?? [];
    if (!rows.length) return;
    setManualPosById((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        next[row.shipmentId] = {
          xPosCm: row.xPosCm,
          yPosCm: row.yPosCm,
          rotationAngle: row.rotationAngle ?? 0,
          stackLevel: Math.max(1, Math.min(6, row.stackLevel ?? 1)),
        };
      }
      return next;
    });
  }, [optimizeQuery.data?.draft?.updated_at, optimizeQuery.data?.draftItems, tourId]);





  const removeShipment = (shipmentId: string) => {
    setRemovedShipmentIds((prev) => (prev.includes(shipmentId) ? prev : [...prev, shipmentId]));
  };

  const undoRemoveShipment = (shipmentId: string) => {
    setRemovedShipmentIds((prev) => prev.filter((id) => id !== shipmentId));
  };




  return (
    <div className="w-full min-h-screen bg-white flex flex-col">
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
      <main className="w-full flex-1 px-4 sm:px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Beladeplan</h1>

        {optimizeQuery.isLoading ? (
          <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
            Lade Laderaumoptimierung…
          </div>
        ) : optimizeQuery.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-2">
            <div className="font-medium">Beladeplan konnte nicht geladen werden.</div>
            <div className="text-red-700">{optimizeErrorText}</div>
            {(optimizeErrorText.includes('Cannot GET') ||
              (optimizeQuery.error as { response?: { status?: number } })?.response?.status ===
                404) && (
              <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
                <strong>Hinweis (404):</strong> Häufig läuft noch ein <strong>alter</strong> Backend-Prozess
                auf Port 3001 (ohne Loading-API). Bitte alle Node/Nest-Prozesse für dieses Backend beenden,
                im Ordner <code className="bg-amber-100 px-1 rounded">tms-backend</code> neu bauen (
                <code className="bg-amber-100 px-1 rounded">npm run build</code>) und{' '}
                <code className="bg-amber-100 px-1 rounded">npm run start:dev</code> erneut starten.
                API-Doku:{' '}
                <a className="underline text-[#1e40af]" href="http://localhost:3001/docs" target="_blank" rel="noreferrer">
                  http://localhost:3001/docs
                </a>{' '}
                – dort sollte <code className="bg-amber-100 px-1 rounded">GET /api/loading/tour/&#123;tourId&#125;/optimize</code>{' '}
                sichtbar sein.
              </div>
            )}
            <div className="text-xs text-red-600">
              Prüfen Sie außerdem, ob die Tour existiert. Touren ohne Sendungen sollten trotzdem eine leere
              Optimierung liefern.
            </div>
          </div>
        ) : !optimizeQuery.data ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Keine Daten verfügbar.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-4 bg-gray-100 p-2 rounded border border-gray-200 text-sm flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-gray-700">Fahrzeug:</span>
                  <select
                    className="rounded border border-gray-300 px-2 py-1 text-xs bg-white"
                    value={selectedVehicleType}
                    onChange={(e) => setSelectedVehicleType(e.target.value)}
                  >
                    {VEHICLES.map((v) => (
                      <option key={v.type} value={v.type}>
                        {v.type}: {v.lengthCm}×{v.widthCm}×{v.heightCm}cm · max {(v.maxWeightKg ?? 0) / 1000}t ·{' '}
                        {v.maxLdm ?? 0} ldm
                      </option>
                    ))}
                  </select>
                  {matchVehicleType(optimizeQuery.data.recommendedVehicle.type) === selectedVehicleType ? (
                    <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-300">
                      ⭐ Empfohlen
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm items-center">
                  <span
                    className={ldmMetrics.floorPct > 100 ? 'text-red-600 font-bold' : 'text-gray-800'}
                    title="Ohne Stapelvorteil: Summe Lademeter / Kapazität (Anzeige max. 100 %)"
                  >
                    Boden-ldm: {Math.min(100, ldmMetrics.floorPct).toFixed(0)}%
                  </span>
                  <span
                    className={ldmMetrics.effectivePct > 100 ? 'text-red-600 font-semibold' : 'text-emerald-800'}
                    title="Stapelbar zählt mit Faktor ½ — so viel „Platz“ bleibt rechnerisch frei"
                  >
                    Effektiv: {ldmMetrics.effectivePct.toFixed(0)}%
                  </span>
                  <span className={volUtil > 100 ? 'text-red-600 font-bold' : 'text-gray-700'}>
                    Vol: {volUtil.toFixed(0)}%
                  </span>
                  <span className={weightUtil != null && weightUtil > 100 ? 'text-red-600 font-bold' : 'text-gray-700'}>
                    Gew: {weightUtil?.toFixed(0) ?? '—'}%
                  </span>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="text-gray-800 leading-relaxed bg-blue-50 p-3 rounded border border-blue-200 space-y-2">
                  <div className="font-medium text-gray-900">Lademeter</div>
                  <div className="grid sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                    <div>
                      <span className="text-gray-600">Boden (ohne Stapelvorteil):</span>{' '}
                      <strong>
                        {ldmMetrics.floorUsed.toFixed(2)} / {ldmMetrics.maxLdm.toFixed(1)} ldm
                      </strong>
                      <div className="mt-1 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${ldmMetrics.floorPct > 100 ? 'bg-red-500' : 'bg-[#1e40af]'}`}
                          style={{ width: `${Math.min(100, ldmMetrics.floorPct)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-500">Balken max. 100 % (reiner Bodenbedarf)</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Effektiv (stapelbar ÷2):</span>{' '}
                      <strong>
                        {ldmMetrics.effectiveUsed.toFixed(2)} / {ldmMetrics.maxLdm.toFixed(1)} ldm
                      </strong>
                      <div className="mt-1 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${ldmMetrics.effectivePct > 100 ? 'bg-red-500' : 'bg-emerald-600'}`}
                          style={{ width: `${Math.min(100, ldmMetrics.effectivePct)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-500">
                        Zusätzlich frei durch Stapeln:{' '}
                        <strong>{ldmMetrics.freeEffectiveLdm.toFixed(2)} ldm</strong> (vs. Boden{' '}
                        {ldmMetrics.freeFloorLdm.toFixed(2)} ldm)
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                    Stapel-Potenzial: <strong>{ldmMetrics.headroomLdm.toFixed(2)} ldm</strong> — Summe der Hälfte aller
                    stapelbaren Sendungen (Faktor 2 auf den Boden-Lademeter). Packstücke werden in der Route-Reihenfolge
                    automatisch gestapelt, wenn Höhe und Stapelbarkeit passen.
                  </div>
                </div>
                <div className="text-gray-700 bg-slate-50 p-2 rounded border border-slate-200 text-xs sm:text-sm">
                  📐 {cargoVolM3.toFixed(1)} m³ / {trailerVolM3.toFixed(1)} m³ ({volUtil.toFixed(0)}% Volumen) · ⚖{' '}
                  {totalWeightActive.toLocaleString('de-DE')} kg / {maxWeightDisplay.toLocaleString('de-DE')} kg (
                  {weightUtil?.toFixed(0) ?? '—'}% Gewicht)
                </div>
              </div>
              {isOverloaded ? (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 space-y-1">
                  <div className="font-medium">⚠ Überladung für gewähltes Fahrzeug</div>
                  {ldmMetrics.floorPct > 100 ? (
                    <div>
                      Boden-ldm: {ldmMetrics.floorUsed.toFixed(1)} / {ldmMetrics.maxLdm.toFixed(1)} ldm
                    </div>
                  ) : null}
                  {ldmMetrics.effectivePct > 100 ? (
                    <div>
                      Effektiv-ldm: {ldmMetrics.effectiveUsed.toFixed(1)} / {ldmMetrics.maxLdm.toFixed(1)} ldm
                    </div>
                  ) : null}
                  {volUtil > 100 ? (
                    <div>
                      Volumen: {cargoVolM3.toFixed(1)} / {trailerVolM3.toFixed(1)} m³
                    </div>
                  ) : null}
                  {weightUtil != null && weightUtil > 100 ? (
                    <div>
                      Gewicht: {totalWeightActive.toLocaleString('de-DE')} /{' '}
                      {maxWeightDisplay.toLocaleString('de-DE')} kg
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-gray-900">3D Laderaum</div>
                </div>

                {(() => {
                  // P3: Spanngurte nur fuer Items mit positionierter Lage.
                  const positionedPackages = placedPackages.filter(
                    (p) =>
                      Number.isFinite(p.posX) &&
                      Number.isFinite(p.posY) &&
                      Number.isFinite(p.posZ),
                  );
                  const securementResult = computeSecurement(
                    positionedPackages.map((p) => ({
                      id: p.id,
                      shipmentId: p.shipmentId,
                      weightKg: p.weightKg,
                    })),
                    { mu: securementMu },
                  );
                  const totalStraps = securementResult.totalStraps;
                  // Per-shipment Farb-Mapping (3D-spezifisch, SVG bleibt Stop-Farbe)
                  const SHIPMENT_COLORS = [
                    '#2563eb', '#16a34a', '#ca8a04', '#dc2626', '#9333ea',
                    '#0891b2', '#ea580c', '#db2777', '#0f766e', '#7c3aed',
                  ];
                  const shipIdx = new Map<string, number>();
                  for (const p of placedPackages) {
                    if (!shipIdx.has(p.shipmentId)) shipIdx.set(p.shipmentId, shipIdx.size);
                  }
                  return (
                    <>
                      <div className="flex justify-end mb-2">
                        <button
                          type="button"
                          onClick={handleResetPositions}
                          disabled={resetPositionsMutation.isPending}
                          className="text-xs rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
                          title="Auto-Placement neu berechnen (alle gespeicherten Positionen löschen)"
                        >
                          {resetPositionsMutation.isPending
                            ? 'Setze zurück…'
                            : '↺ Auto-Placement neu berechnen'}
                        </button>
                      </div>
                      <LoadingPlan3D
                        vehicle={{
                          lengthCm: vehicleDims.lengthCm,
                          widthCm: vehicleDims.widthCm,
                          heightCm: vehicleDims.heightCm,
                        }}
                        vehicleType={selectedVehicle?.type ?? selectedVehicleType}
                        securementStraps={totalStraps}
                        onPositionChange={handlePackagePosition}
                        packages={placedPackages.map((p) => ({
                          id: p.id,
                          lengthCm: p.lengthCm,
                          widthCm: p.widthCm,
                          heightCm: p.heightCm,
                          posX: p.posX,
                          posY: p.posY,
                          posZ: p.posZ,
                          weightKg: p.weightKg,
                          color:
                            SHIPMENT_COLORS[
                              (shipIdx.get(p.shipmentId) ?? 0) % SHIPMENT_COLORS.length
                            ],
                          isStackable: p.isStackable,
                          rotationDeg: p.rotationDeg,
                        }))}
                      />
                      <AxleLoadPanel
                        packages={placedPackages.map((p) => ({
                          posY: p.posY,
                          weightKg: p.weightKg,
                        }))}
                        vehicleType={selectedVehicle?.type ?? selectedVehicleType}
                        trailerLength_m={vehicleDims.lengthCm / 100}
                        groundedCount={placedPackages.filter((p) => p.posZ < 1e-6).length}
                        totalCount={placedPackages.length}
                      />
                      <SecurementPanel
                        packages={positionedPackages.map((p) => ({
                          id: p.id,
                          shipmentId: p.shipmentId,
                          weightKg: p.weightKg,
                        }))}
                        mu={securementMu}
                        onMuChange={setSecurementMu}
                      />
                    </>
                  );
                })()}

              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-gray-900">Tour-Reihenfolge</div>
                  <button
                    type="button"
                    onClick={() => setManualOrder(null)}
                    className="text-xs rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
                  >
                    Optimale Reihenfolge
                  </button>
                </div>
                <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1 mb-3">
                  {activeOrder.map((s, index) => (
                    <div
                      key={s.id}
                      className="rounded border border-gray-200 px-2 py-1.5 bg-white flex items-center gap-2 text-xs"
                      draggable
                      onDragStart={() => setDraggingId(s.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (!draggingId || draggingId === s.id) return;
                        const visibleIds = activeOrder.map((x) => x.id);
                        const from = visibleIds.indexOf(draggingId);
                        const to = visibleIds.indexOf(s.id);
                        if (from < 0 || to < 0) return;
                        const nextVisible = [...visibleIds];
                        nextVisible.splice(from, 1);
                        nextVisible.splice(to, 0, draggingId);
                        const tail = effectiveOrder.map((x) => x.id).filter((id) => !nextVisible.includes(id));
                        setManualOrder([...nextVisible, ...tail]);
                        setDraggingId(null);
                      }}
                    >
                      <span className="text-gray-400 w-4 shrink-0">{index + 1}</span>
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0 border border-gray-600"
                        style={{
                          backgroundColor:
                            STOP_COLORS[
                              (Math.max(1, s.deliveryOrder ?? index + 1) - 1) % STOP_COLORS.length
                            ],
                        }}
                      />
                      <span className="font-medium text-gray-900 truncate">{s.shipmentNumber}</span>
                      <span className="text-gray-500 truncate">{s.deliveryCity}</span>
                    </div>
                  ))}
                </div>

                <div className="font-medium text-gray-900 mb-2">Packstücke</div>
                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1 text-xs font-mono leading-relaxed">
                  {activeOrder.map((s) => {
                    const pkgs = packagesFlat.filter((x) => x.shipmentId === s.id);
                    const swatch =
                      STOP_COLORS[(Math.max(1, s.deliveryOrder ?? 1) - 1) % STOP_COLORS.length];
                    if (pkgs.length === 0) return null;
                    return (
                      <div key={s.id}>
                        <div className="flex items-center justify-between gap-2 font-sans font-semibold text-gray-900 text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block w-3 h-3 rounded border border-gray-700 shrink-0"
                              style={{ backgroundColor: swatch }}
                            />
                            {s.shipmentNumber} · {pkgs.length} Pakete · {(Number(s.ldm) || 0).toFixed(2)} ldm
                          </div>
                          <button
                            type="button"
                            onClick={() => removeShipment(s.id)}
                            className="text-red-500 hover:text-red-700"
                            title="Sendung von Tour entfernen"
                          >
                            ✕
                          </button>
                        </div>
                        <ul className="mt-1 pl-2 border-l border-gray-200 ml-1.5 space-y-0.5">
                          {pkgs.map((pkg, i) => (
                            <li key={pkg.id}>
                              {i === pkgs.length - 1 ? '└── ' : '├── '}
                              Paket {pkg.packageIndex}: {Math.round(pkg.lengthCm)}×{Math.round(pkg.widthCm)}×
                              {Math.round(pkg.heightCm)} cm · {pkg.weightKg.toLocaleString('de-DE')} kg ·{' '}
                              {pkg.isStackable ? 'Stapelbar ✓' : 'Nicht stapelbar ✗'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                {removedShipmentIds.length > 0 ? (
                  <div className="mt-3 p-2 rounded border border-amber-200 bg-amber-50 text-xs">
                    <div className="font-medium text-amber-900 mb-1">Entfernt:</div>
                    <div className="flex flex-wrap gap-2">
                      {removedShipmentIds.map((id) => {
                        const s = effectiveOrder.find((x) => x.id === id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => undoRemoveShipment(id)}
                            className="px-2 py-1 rounded border border-amber-300 bg-white hover:bg-amber-100"
                          >
                            {s?.shipmentNumber ?? id} [Zurück]
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                  <div className="text-xs font-medium text-gray-700">
                    Feinplatzierung je Sendung (Δ Länge / Δ Breite cm,{' '}
                    <span title="Zusätzliche Schicht: eine Pakethöhe pro Stufe (niedrigstes Packstück)">Stapel</span>
                    , Drehung)
                  </div>
                  <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1">
                    {activeOrder.map((s) => {
                      const cur = manualPosById[s.id] ?? {
                        xPosCm: 0,
                        yPosCm: 0,
                        rotationAngle: 0,
                        stackLevel: 1,
                      };
                      return (
                        <div
                          key={s.id}
                          className="grid grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_2.5rem_3.25rem] gap-1 items-center text-xs"
                        >
                          <div className="truncate font-sans" title={s.shipmentNumber}>
                            {s.shipmentNumber}
                          </div>
                          <input
                            type="number"
                            className="w-full min-w-0 rounded border border-gray-300 px-1 py-0.5"
                            value={cur.xPosCm}
                            onChange={(e) =>
                              setManualPosById((prev) => ({
                                ...prev,
                                [s.id]: {
                                  ...cur,
                                  xPosCm: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                          <input
                            type="number"
                            className="w-full min-w-0 rounded border border-gray-300 px-1 py-0.5"
                            value={cur.yPosCm}
                            onChange={(e) =>
                              setManualPosById((prev) => ({
                                ...prev,
                                [s.id]: {
                                  ...cur,
                                  yPosCm: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                          <input
                            type="number"
                            min={1}
                            max={6}
                            title="Stapel"
                            className="w-full min-w-0 rounded border border-gray-300 px-1 py-0.5"
                            value={cur.stackLevel}
                            onChange={(e) =>
                              setManualPosById((prev) => ({
                                ...prev,
                                [s.id]: {
                                  ...cur,
                                  stackLevel: Math.min(
                                    6,
                                    Math.max(1, Math.round(Number(e.target.value) || 1)),
                                  ),
                                },
                              }))
                            }
                          />
                          <select
                            className="w-full min-w-0 rounded border border-gray-300 px-0.5 py-0.5 text-[11px]"
                            value={cur.rotationAngle}
                            onChange={(e) =>
                              setManualPosById((prev) => ({
                                ...prev,
                                [s.id]: {
                                  ...cur,
                                  rotationAngle: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          >
                            <option value={0}>0°</option>
                            <option value={90}>90°</option>
                            <option value={180}>180°</option>
                            <option value={270}>270°</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        saveDraftMutation.mutate({
                          items: activeOrder.map((row) => {
                            const cur = manualPosById[row.id] ?? {
                              xPosCm: 0,
                              yPosCm: 0,
                              rotationAngle: 0,
                              stackLevel: 1,
                            };
                            return {
                              shipmentId: row.id,
                              xPosCm: cur.xPosCm,
                              yPosCm: cur.yPosCm,
                              rotationAngle: cur.rotationAngle,
                              stackLevel: cur.stackLevel,
                            };
                          }),
                        })
                      }
                      disabled={saveDraftMutation.isPending}
                      className="px-2 py-1 rounded border border-gray-300 bg-white text-xs hover:bg-gray-50 disabled:opacity-60"
                    >
                      Feinplatzierung speichern
                    </button>
                    <button
                      type="button"
                      onClick={() => clearDraftMutation.mutate()}
                      disabled={clearDraftMutation.isPending}
                      className="px-2 py-1 rounded border border-gray-300 bg-white text-xs hover:bg-gray-50 disabled:opacity-60"
                    >
                      Draft zurücksetzen
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {optimizeQuery.data.warnings.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <div className="font-medium text-red-700 mb-2">⚠ Warnungen</div>
                {optimizeQuery.data.warnings.map((w, idx) => (
                  <div key={idx} className="text-red-600 text-sm">
                    • {w}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => window.open(`/api/loading/tour/${tourId}/loading-plan-pdf`, '_blank')}
                className="px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm"
              >
                Beladeplan drucken
              </button>
              <button
                type="button"
                disabled={applyOrderMutation.isPending}
                onClick={() => applyOrderMutation.mutate(activeOrder.map((s) => s.id))}
                className="px-3 py-2 rounded-lg bg-[#1e40af] text-white hover:bg-[#1e3a8a] text-sm disabled:opacity-60"
              >
                Reihenfolge in Tour speichern
              </button>
              <button
                type="button"
                disabled={removedShipmentIds.length === 0 || removeShipmentsMutation.isPending}
                onClick={() => {
                  const ok = window.confirm(
                    `${removedShipmentIds.length} Sendung(en) werden von Tour entfernt. Fortfahren?`,
                  );
                  if (!ok) return;
                  removeShipmentsMutation.mutate(removedShipmentIds);
                }}
                className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm disabled:opacity-60"
              >
                Änderungen speichern
              </button>
              <button
                type="button"
                disabled={removedShipmentIds.length === 0}
                onClick={() => setRemovedShipmentIds([])}
                className="px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm disabled:opacity-60"
              >
                Alles zurücksetzen
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm"
              >
                Schließen
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

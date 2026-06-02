/**
 * F①-a: FV-Beladeplan shared types + helpers (1:1 ausgelagert aus
 * pages/LoadingPlanPage.tsx). PURE MOVE — KEIN Verhaltenswechsel.
 *
 * Vorbereitung fuer F①-b: LoadingPlanPanel.FvBody soll dieselben
 * Symbole nutzen wie die Vollansicht, damit beide Konsumenten
 * dieselben Quantity-Klon-/Vehicle-/Type-Regeln teilen waehrend
 * der Coexistenz-Phase (bis F⑤ die Vollansicht-Route entfernt).
 *
 * SCOPE: nur Symbol-Move + Re-Export. expandPackagesFromOrder,
 * matchVehicleType, VEHICLES, OptimizeResponse, Package,
 * PlacedPackage + transitive Deps (Vehicle, ShipmentLoad,
 * ShipmentPackageItemLoad, LoadedItem). DEFAULT_TRAILER_CM
 * mitgenommen weil natuerlich konsumiert wenn API leere Dims
 * liefert.
 *
 * NICHT gewandert: trailerVolumeCm3, packagesVolumeCm3 (bleiben
 * inline in LoadingPlanPage bis sie geteilt werden muessen).
 *
 * Regel #1: NV-Pendant ist nv-spezifisch (NvLoadingPlanPage hat
 * eigene Helpers). FV-Move beruehrt NV nicht.
 */

/** Sattelzug-Standard, falls API keine Werte liefert */
export const DEFAULT_TRAILER_CM = {
  lengthCm: 1360,
  widthCm: 240,
  heightCm: 270,
};

/** Farb-Palette pro Stop-Order (cycle through 8 Stops).
 *  Exportiert weil sowohl expandPackagesFromOrder (Package-Color)
 *  als auch die Page-/Panel-JSX (Stop-Liste-Color-Indikator) sie
 *  konsumiert. */
export const STOP_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ca8a04',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#ea580c',
  '#db2777',
] as const;

/** Ein bereits platziertes Layout-Item aus dem BE-Optimizer-Output. */
export type LoadedItem = {
  shipmentId: string;
  xPos: number;
  yPos: number;
  length: number;
  width: number;
  color: string;
  label: string;
  row: number;
};

/** Fahrzeug-Typ (Box-Dim + optional Kapazitaeten). */
export type Vehicle = {
  type: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  maxWeightKg?: number;
  maxLdm?: number;
};

/** Kanonische Fahrzeug-Typen fuer FV-Beladeplan. */
export const VEHICLES: Vehicle[] = [
  {
    type: 'Sprinter',
    lengthCm: 350,
    widthCm: 180,
    heightCm: 180,
    maxWeightKg: 1000,
    maxLdm: 2,
  },
  {
    type: 'Koffer 7t',
    lengthCm: 620,
    widthCm: 240,
    heightCm: 240,
    maxWeightKg: 3500,
    maxLdm: 6,
  },
  {
    type: 'Koffer 12t',
    lengthCm: 740,
    widthCm: 240,
    heightCm: 240,
    maxWeightKg: 6000,
    maxLdm: 8,
  },
  {
    type: 'Sattel',
    lengthCm: 1360,
    widthCm: 240,
    heightCm: 270,
    maxWeightKg: 24000,
    maxLdm: 13.6,
  },
];

/** Mapt einen FREITEXT-Fahrzeug-Typ (API-Response) auf einen
 *  kanonischen VEHICLES-Eintrag. Default Sattel. */
export function matchVehicleType(apiType: string | undefined): string {
  if (!apiType) return 'Sattel';
  const t = apiType.trim().toLowerCase();
  const hit = VEHICLES.find((v) => v.type.toLowerCase() === t);
  return (
    hit?.type ??
    VEHICLES.find((v) => t.includes(v.type.toLowerCase()))?.type ??
    'Sattel'
  );
}

/** Packstueck-Level aus BE-Optimize-Response. */
export type ShipmentPackageItemLoad = {
  id: string;
  lineIndex: number;
  packageType: string;
  quantity: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  stackable: boolean;
  /** Legacy (palette_index=0-Spiegel). Bleibt fuer Konsumenten —
   *  H4 wird auf positions[] umschalten. */
  posXCm: number | null;
  posYCm: number | null;
  posZCm: number | null;
  rotationDeg: number;
  /** H2: Per-Palette-Positionen vom BE (mit Fallback auf legacy
   *  fuer palette_index=0). Optional, weil aelterer BE-Stand
   *  das Feld nicht liefert; aktueller BE (H2) garantiert
   *  mindestens 1 Eintrag. H4 wird darauf umstellen. */
  positions?: Array<{
    paletteIndex: number;
    posXCm: number | null;
    posYCm: number | null;
    posZCm: number | null;
    rotationDeg: number;
  }>;
};

/** Sendungs-Level aus BE-Optimize-Response. */
export type ShipmentLoad = {
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

/** Komplette BE-Antwort von GET /loading/tour/:id/optimize. */
export type OptimizeResponse = {
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

/** Ein logisches Packstueck (per-Quantity-Expansion) mit DB-uuid
 *  fuer das ERSTE Quantity-Item (Position-Persist via PATCH). */
export interface Package {
  id: string;
  /** Real DB-uuid des shipment_package_items (falls vorhanden) —
   *  sonst undefined fuer synth/Quantity-Klon. */
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

export interface PlacedPackage extends Package {
  posX: number;
  posY: number;
  posZ: number;
  /** LP-1: 0 oder 90 (Y-axis Drag-Rotation, persistiert). */
  rotationDeg?: number;
}

/** Expand: aus OptimizeResponse.loadingOrder pro Sendung n
 *  (= quantity) Packstuecke erzeugen. Erstes Quantity-Item
 *  traegt die DB-uuid + storedPos; weitere sind logische
 *  Duplikate ohne separate DB-Pos (`${it.id}:q${q}`). */
export function expandPackagesFromOrder(order: ShipmentLoad[]): Package[] {
  const list: Package[] = [];
  order.forEach((s, idx) => {
    const stopOrder = s.deliveryOrder ?? idx + 1;
    const color = STOP_COLORS[(Math.max(1, stopOrder) - 1) % STOP_COLORS.length];

    // Wenn DB-Items vorhanden: pro Quantity 1 Package (mit DB-uuid).
    if (s.packageItems && s.packageItems.length > 0) {
      s.packageItems.forEach((it, i) => {
        const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
        const lengthCm = Number(it.lengthCm) || 120;
        const widthCm = Number(it.widthCm) || 80;
        const heightCm = Number(it.heightCm) || 120;
        const weightPerUnit = qty > 0 ? Number(it.weightKg) / qty : Number(it.weightKg);
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

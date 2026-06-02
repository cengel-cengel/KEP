import { Injectable } from '@nestjs/common';

export interface ShipmentPackageItem {
  id: string;
  lineIndex: number;
  packageType: string;
  quantity: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  stackable: boolean;
  /** Legacy: Position des Bundles (= palette_index=0-Spiegel).
   *  Bleibt fuer bestehende Konsumenten — H4 schaltet auf
   *  positions[] um. */
  posXCm: number | null;
  posYCm: number | null;
  posZCm: number | null;
  rotationDeg: number;
  /** H2: Per-Palette-Positionen. Array hat mindestens 1 Eintrag
   *  (paletteIndex=0 als Fallback aus den Legacy-Spalten, wenn
   *  noch keine H1-Tabelle-Rows existieren). */
  positions?: Array<{
    paletteIndex: number;
    posXCm: number | null;
    posYCm: number | null;
    posZCm: number | null;
    rotationDeg: number;
  }>;
}

export interface ShipmentLoad {
  id: string;
  shipmentNumber: string;
  customer: string;
  deliveryCity: string;
  deliveryOrder: number; // Stoppreihenfolge auf Tour
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  ldm: number;
  isStackable: boolean;
  packageCount: number;
  packageType: string;
  /** Pakete der Sendung mit moeglichen gespeicherten Drag-Positionen. */
  packageItems?: ShipmentPackageItem[];
  /**
   * F2.3.0: FIX-Kriterien-Felder fuer den FV-Swap-Optimizer.
   * isFixSendung (FE lib/nvSwapOptimizer) liest sie + customer.
   * priority_tier. Alle optional + Add-only — recommendVehicle/
   * optimizeLoadingOrder/calculateLoadingLayout/checkOverload
   * lesen sie NICHT, also kein Verhalten-Bruch.
   */
  customerId?: string | null;
  loadingDate?: string | null;
  status?: string | null;
  hasActiveLock?: boolean | null;
  isHazmat?: boolean | null;
  customerPriorityTier?: string | null;
}

export interface Vehicle {
  type: string; // SPRINTER, KOFFER_7t, KOFFER_12t, SATTEL
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  maxWeightKg: number;
  maxLdm: number;
}

export const VEHICLES: Vehicle[] = [
  {
    type: 'SPRINTER',
    lengthCm: 350,
    widthCm: 180,
    heightCm: 180,
    maxWeightKg: 1000,
    maxLdm: 2.0,
  },
  {
    type: 'KOFFER_7t',
    lengthCm: 620,
    widthCm: 240,
    heightCm: 240,
    maxWeightKg: 3500,
    maxLdm: 6.0,
  },
  {
    type: 'KOFFER_12t',
    lengthCm: 740,
    widthCm: 240,
    heightCm: 240,
    maxWeightKg: 6000,
    maxLdm: 8.0,
  },
  {
    type: 'SATTEL',
    lengthCm: 1360,
    widthCm: 240,
    heightCm: 270,
    maxWeightKg: 24000,
    maxLdm: 13.6,
  },
];

export interface LoadedItem {
  shipmentId: string;
  xPos: number; // Position von hinten in cm
  yPos: number; // Position von links in cm
  length: number;
  width: number;
  color: string;
  label: string;
  row: number;
}

export interface LoadingLayout {
  vehicle: Vehicle;
  items: LoadedItem[];
  totalLdm: number;
  totalWeight: number;
  utilizationPercent: number;
  warnings: string[];
}

const STOP_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
];

@Injectable()
export class LoadingOptimizerService {
  recommendVehicle(shipments: ShipmentLoad[]): Vehicle {
    const totalLdm = shipments.reduce((acc, s) => acc + (Number(s.ldm) || 0), 0);
    const totalWeight = shipments.reduce(
      (acc, s) => acc + (Number(s.weightKg) || 0),
      0,
    );
    const ldmWithBuffer = totalLdm * 1.1;

    const sorted = [...VEHICLES].sort((a, b) => a.maxLdm - b.maxLdm);
    const match = sorted.find(
      (v) => v.maxLdm >= ldmWithBuffer && v.maxWeightKg >= totalWeight,
    );

    return match ?? VEHICLES.find((v) => v.type === 'SATTEL') ?? VEHICLES[0];
  }

  optimizeLoadingOrder(shipments: ShipmentLoad[]): ShipmentLoad[] {
    return [...shipments].sort((a, b) => {
      if (b.deliveryOrder !== a.deliveryOrder) {
        return b.deliveryOrder - a.deliveryOrder; // letzter stop zuerst laden
      }
      const volA = a.lengthCm * a.widthCm * Math.max(1, a.heightCm);
      const volB = b.lengthCm * b.widthCm * Math.max(1, b.heightCm);
      if (volB !== volA) return volB - volA;
      return (b.weightKg || 0) - (a.weightKg || 0);
    });
  }

  calculateLoadingLayout(
    shipments: ShipmentLoad[],
    vehicle: Vehicle,
  ): LoadingLayout {
    const sorted = this.optimizeLoadingOrder(shipments);
    const uniqueStops = [...new Set(sorted.map((s) => s.deliveryOrder))];
    const stopToColor = new Map<number, string>();
    uniqueStops.forEach((stop, idx) => {
      stopToColor.set(stop, STOP_COLORS[idx % STOP_COLORS.length]);
    });

    const items: LoadedItem[] = [];
    let xCursor = 0;
    let yCursor = 0;
    let row = 0;
    let maxLenInRow = 0;

    for (const s of sorted) {
      const width = Math.max(10, Number(s.widthCm) || 80);
      const length = Math.max(10, Number(s.lengthCm) || 120);

      if (yCursor + width > vehicle.widthCm) {
        xCursor += maxLenInRow;
        yCursor = 0;
        maxLenInRow = 0;
        row += 1;
      }

      items.push({
        shipmentId: s.id,
        xPos: xCursor,
        yPos: yCursor,
        length,
        width,
        color: stopToColor.get(s.deliveryOrder) ?? STOP_COLORS[0],
        label: `${s.shipmentNumber} · Stop ${s.deliveryOrder}`,
        row,
      });

      yCursor += width;
      if (length > maxLenInRow) maxLenInRow = length;
    }

    const totalLdm = sorted.reduce((acc, s) => acc + (Number(s.ldm) || 0), 0);
    const totalWeight = sorted.reduce(
      (acc, s) => acc + (Number(s.weightKg) || 0),
      0,
    );
    const utilizationPercent =
      vehicle.maxLdm > 0
        ? Math.min(999, Number(((totalLdm / vehicle.maxLdm) * 100).toFixed(1)))
        : 0;

    const warnings = this.checkOverload(sorted, vehicle);

    return {
      vehicle,
      items,
      totalLdm,
      totalWeight,
      utilizationPercent,
      warnings,
    };
  }

  checkOverload(shipments: ShipmentLoad[], vehicle: Vehicle): string[] {
    const warnings: string[] = [];
    const totalWeight = shipments.reduce(
      (acc, s) => acc + (Number(s.weightKg) || 0),
      0,
    );
    const totalLdm = shipments.reduce((acc, s) => acc + (Number(s.ldm) || 0), 0);

    if (totalWeight > vehicle.maxWeightKg) {
      warnings.push(
        `Gewicht überschritten: ${totalWeight.toLocaleString('de-DE')} kg von max. ${vehicle.maxWeightKg.toLocaleString('de-DE')} kg`,
      );
    }
    if (totalLdm > vehicle.maxLdm) {
      warnings.push(
        `Lademeter überschritten: ${totalLdm.toFixed(1)} ldm von max. ${vehicle.maxLdm.toFixed(1)} ldm`,
      );
    }

    const nonStackable = shipments.filter((s) => !s.isStackable);
    if (nonStackable.length > 0 && shipments.length > nonStackable.length) {
      for (const s of nonStackable) {
        warnings.push(
          `Sendung ${s.shipmentNumber} nicht stapelbar, aber andere Sendung darüber`,
        );
      }
    }

    return warnings;
  }
}


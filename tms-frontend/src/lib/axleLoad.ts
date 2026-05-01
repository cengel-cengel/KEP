/**
 * Achs-Modell + Achslast-Berechnung
 *
 * Pure-Function-Library: keine UI, kein React-State.
 * Wird in F2 (UI) und F3 (3D-Marker) konsumiert.
 *
 * Konventionen:
 *   posY (cm) = Position eines Pakets entlang der LAENGE
 *               des Trailers, gemessen von der Front (=0).
 *               Aus placePackages-Logik in LoadingPlanPage.
 *   Vehicle-Empty-Weight: wirkt vereinfacht bei
 *               trailerLength/2  (Mitte des Aufliegers).
 *
 * Statisch unbestimmtes System bei 3+ Achsen wird
 * vereinfacht modelliert:
 *   - 2-Achs: klassisches Hebelgesetz
 *   - 3+: Aufteilung in Front-Achse vs. Hinten-Cluster
 *         via Hebel; Cluster proportional zu maxLoad.
 */

export interface AxleConfig {
  label: string;
  /** Position der Achse in Metern, von Front gemessen. */
  distanceFromFront_m: number;
  /** Gesetzliches Maximum dieser Achse in kg. */
  maxLoad_kg: number;
}

export interface VehicleAxleConfig {
  /** Muss exakt mit VEHICLES.type aus LoadingPlanPage matchen. */
  type: string;
  emptyWeightKg: number;
  axles: AxleConfig[];
}

/**
 * Default-EU-Werte fuer alle 6 VEHICLE_PRESETS Typen.
 * Distanzen sind pragmatisch geschaetzt; einzelne Fahrzeuge
 * koennen spaeter spezifischer konfiguriert werden (eigener Sprint).
 */
export const VEHICLE_AXLES: Record<string, VehicleAxleConfig> = {
  Sprinter: {
    type: 'Sprinter',
    emptyWeightKg: 2000,
    axles: [
      { label: 'Vorderachse', distanceFromFront_m: 0.6, maxLoad_kg: 1850 },
      { label: 'Hinterachse', distanceFromFront_m: 3.2, maxLoad_kg: 2500 },
    ],
  },
  'Koffer 7t': {
    type: 'Koffer 7t',
    emptyWeightKg: 3500,
    axles: [
      { label: 'Vorderachse', distanceFromFront_m: 1.0, maxLoad_kg: 3500 },
      { label: 'Hinterachse', distanceFromFront_m: 5.4, maxLoad_kg: 5000 },
    ],
  },
  'Koffer 12t': {
    type: 'Koffer 12t',
    emptyWeightKg: 6500,
    axles: [
      { label: 'Vorderachse', distanceFromFront_m: 1.0, maxLoad_kg: 6300 },
      { label: 'Hinterachse', distanceFromFront_m: 6.4, maxLoad_kg: 11500 },
    ],
  },
  Sattel: {
    type: 'Sattel',
    emptyWeightKg: 14500,
    axles: [
      { label: 'Vorderachse',     distanceFromFront_m: 0.7,  maxLoad_kg: 7500 },
      { label: 'Antriebsachse',   distanceFromFront_m: 4.5,  maxLoad_kg: 11500 },
      { label: 'Tridem-Auflieger',distanceFromFront_m: 12.0, maxLoad_kg: 24000 },
    ],
  },
  Mega: {
    type: 'Mega',
    emptyWeightKg: 14500,
    axles: [
      { label: 'Vorderachse',     distanceFromFront_m: 0.7,  maxLoad_kg: 7500 },
      { label: 'Antriebsachse',   distanceFromFront_m: 4.5,  maxLoad_kg: 11500 },
      { label: 'Tridem-Auflieger',distanceFromFront_m: 12.0, maxLoad_kg: 24000 },
    ],
  },
  Jumbo: {
    type: 'Jumbo',
    emptyWeightKg: 18000,
    axles: [
      { label: 'Vorderachse Zugm.',  distanceFromFront_m: 0.7,  maxLoad_kg: 7500 },
      { label: 'Antriebsachse Zugm.',distanceFromFront_m: 4.0,  maxLoad_kg: 11500 },
      { label: 'Vorderachse Hänger', distanceFromFront_m: 9.0,  maxLoad_kg: 10000 },
      { label: 'Hinterachse Hänger', distanceFromFront_m: 14.0, maxLoad_kg: 10000 },
    ],
  },
};

export type AxleStatus = 'ok' | 'warning' | 'critical';

export interface AxleLoadEntry {
  label: string;
  distanceFromFront_m: number;
  load_kg: number;
  maxLoad_kg: number;
  loadPercent: number;
  status: AxleStatus;
}

export interface AxleLoadResult {
  totalWeight_kg: number;
  cargoWeight_kg: number;
  emptyWeightKg: number;
  centerOfGravity_m: number;
  axles: AxleLoadEntry[];
  /** Falls vehicleType unbekannt oder keine Pakete -> graceful fallback. */
  warnings: string[];
}

export interface AxleLoadPackage {
  posY: number; // cm
  weightKg: number;
}

function statusFor(percent: number): AxleStatus {
  if (percent >= 95) return 'critical';
  if (percent >= 80) return 'warning';
  return 'ok';
}

/** 2-Achs-Hebelgesetz: Last F_a auf Achse a (vorn), F_b auf b (hinten). */
function lever2(
  totalKg: number,
  cog_m: number,
  axleA: AxleConfig,
  axleB: AxleConfig,
): { a: number; b: number } {
  const xa = axleA.distanceFromFront_m;
  const xb = axleB.distanceFromFront_m;
  const span = xb - xa;
  if (span <= 0) {
    return { a: totalKg / 2, b: totalKg / 2 };
  }
  const a = (totalKg * (xb - cog_m)) / span;
  const b = totalKg - a;
  return { a: Math.max(0, a), b: Math.max(0, b) };
}

export function computeAxleLoads(
  packages: AxleLoadPackage[],
  vehicleType: string,
  trailerLength_m: number,
): AxleLoadResult {
  const cfg = VEHICLE_AXLES[vehicleType];
  if (!cfg) {
    return {
      totalWeight_kg: 0,
      cargoWeight_kg: 0,
      emptyWeightKg: 0,
      centerOfGravity_m: 0,
      axles: [],
      warnings: [`Unbekannter Vehicle-Typ: ${vehicleType}`],
    };
  }

  // Cargo
  const cargoWeight = packages.reduce((s, p) => s + Math.max(0, p.weightKg || 0), 0);
  const cargoMomentSum = packages.reduce(
    (s, p) => s + Math.max(0, p.weightKg || 0) * (p.posY / 100),
    0,
  );

  const empty = cfg.emptyWeightKg;
  const emptyCenter_m = trailerLength_m > 0 ? trailerLength_m / 2 : 0;
  const total = cargoWeight + empty;
  const cog =
    total > 0
      ? (cargoMomentSum + empty * emptyCenter_m) / total
      : emptyCenter_m;

  // Achs-Verteilung
  const axles = cfg.axles;
  const loads: number[] = new Array(axles.length).fill(0);

  if (axles.length === 0) {
    // unmoeglich, aber defensiv
  } else if (axles.length === 1) {
    loads[0] = total;
  } else if (axles.length === 2) {
    const { a, b } = lever2(total, cog, axles[0], axles[1]);
    loads[0] = a;
    loads[1] = b;
  } else {
    // 3+ Achsen: Front vs. Hinten-Cluster (alle ausser Front)
    const front = axles[0];
    const rearCluster = axles.slice(1);
    // Effektiver Cluster-Schwerpunkt = Mittel der Achspositionen,
    // gewichtet nach maxLoad.
    const wSum = rearCluster.reduce((s, a) => s + a.maxLoad_kg, 0);
    const clusterPos =
      wSum > 0
        ? rearCluster.reduce((s, a) => s + a.distanceFromFront_m * a.maxLoad_kg, 0) / wSum
        : rearCluster.reduce((s, a) => s + a.distanceFromFront_m, 0) / rearCluster.length;
    const clusterAxle: AxleConfig = {
      label: 'rear-cluster',
      distanceFromFront_m: clusterPos,
      maxLoad_kg: wSum,
    };
    const { a: frontLoad, b: clusterLoad } = lever2(total, cog, front, clusterAxle);
    loads[0] = frontLoad;
    // Cluster-Last proportional zu maxLoad verteilen
    for (let i = 0; i < rearCluster.length; i++) {
      const share = wSum > 0 ? rearCluster[i].maxLoad_kg / wSum : 1 / rearCluster.length;
      loads[i + 1] = clusterLoad * share;
    }
  }

  const result: AxleLoadEntry[] = axles.map((a, i) => {
    const load = loads[i] ?? 0;
    const pct = a.maxLoad_kg > 0 ? (load / a.maxLoad_kg) * 100 : 0;
    return {
      label: a.label,
      distanceFromFront_m: a.distanceFromFront_m,
      load_kg: load,
      maxLoad_kg: a.maxLoad_kg,
      loadPercent: pct,
      status: statusFor(pct),
    };
  });

  return {
    totalWeight_kg: total,
    cargoWeight_kg: cargoWeight,
    emptyWeightKg: empty,
    centerOfGravity_m: cog,
    axles: result,
    warnings: [],
  };
}

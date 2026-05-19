/**
 * P0-8: NV-Beladeplan-Vehicle-Lookup.
 *
 * Lookup-Reihenfolge:
 *   1. nv_touren.fahrzeug_typ (per-Tour-Override)
 *   2. nv_subunternehmer.fahrzeug_typ (Default des Subs)
 *   3. 'Koffer 7t' (Default-Fallback)
 *
 * Dim-Werte spiegeln das FV-LoadingPlanPage VEHICLES-Array
 * (Z.46-53). Falls dort erweitert: hier mit-pflegen.
 */

export interface VehicleDims {
  type: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  maxWeightKg: number;
  maxLdm: number;
}

export const VEHICLE_DIMS: VehicleDims[] = [
  { type: 'Sprinter',   lengthCm: 350,  widthCm: 180, heightCm: 180, maxWeightKg: 1000,  maxLdm: 2 },
  { type: 'Koffer 3.5t',lengthCm: 430,  widthCm: 210, heightCm: 220, maxWeightKg: 1500,  maxLdm: 4 },
  { type: 'Koffer 7t',  lengthCm: 620,  widthCm: 240, heightCm: 240, maxWeightKg: 3500,  maxLdm: 6 },
  { type: 'Koffer 12t', lengthCm: 740,  widthCm: 240, heightCm: 240, maxWeightKg: 6000,  maxLdm: 8 },
  { type: 'Sattel',     lengthCm: 1360, widthCm: 240, heightCm: 270, maxWeightKg: 24000, maxLdm: 13.6 },
  { type: 'Mega',       lengthCm: 1360, widthCm: 240, heightCm: 300, maxWeightKg: 24000, maxLdm: 13.6 },
  { type: 'Jumbo',      lengthCm: 1560, widthCm: 240, heightCm: 300, maxWeightKg: 24000, maxLdm: 15.6 },
];

export const VEHICLE_DEFAULT_TYPE = 'Koffer 7t';

/**
 * Resolve dim-tupel aus fahrzeug_typ-String (case-insensitive
 * Match auf VEHICLE_DIMS.type). Fallback: 'Koffer 7t'.
 */
export function getVehicleDims(
  fahrzeugTyp?: string | null | undefined,
): VehicleDims {
  const fallback =
    VEHICLE_DIMS.find((v) => v.type === VEHICLE_DEFAULT_TYPE) ??
    VEHICLE_DIMS[2];
  if (!fahrzeugTyp) return fallback;
  const norm = fahrzeugTyp.trim().toLowerCase();
  if (!norm) return fallback;
  const hit = VEHICLE_DIMS.find((v) => v.type.toLowerCase() === norm);
  return hit ?? fallback;
}

/**
 * Resolve fahrzeug_typ aus Tour + Subunternehmer.
 * NULL-safe: jeder Schritt kann null sein.
 */
export function resolveFahrzeugTyp(
  tourFahrzeugTyp?: string | null,
  subFahrzeugTyp?: string | null,
): string {
  return (
    (tourFahrzeugTyp ?? '').trim() ||
    (subFahrzeugTyp ?? '').trim() ||
    VEHICLE_DEFAULT_TYPE
  );
}

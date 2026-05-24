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

/**
 * F1.a-Fix: Tonnen-Notation in NV-Stammdaten (z.B. "7_5T", "12T",
 * "18T") canonical-Match fuer VEHICLE_DIMS funktioniert NICHT — die
 * Liste kennt nur "Sprinter|Koffer 3.5t|Koffer 7t|Koffer 12t|
 * Sattel|Mega|Jumbo". Stiller Fallback "Koffer 7t" (6 ldm) hatte
 * Auslastungs-% von ~300% zur Folge.
 *
 * Tabelle aus gepflegten Subs (Carlos-Vorgabe):
 *    7,5 t →  8.0 ldm / 3000 kg
 *   12  t →  8.0 ldm / 3000 kg   (Default; variiert in echt 8↔12)
 *   18  t → 13.6 ldm / 11000 kg
 *
 * Normalisierung: '_' → '.', Whitespaces + 'T'/'TO'/'TONNE' weg,
 * Komma/Punkt vereinheitlichen → parseFloat. Wenn das misslingt,
 * NULL zurueck.
 */
const TONNEN_CAPACITY: ReadonlyArray<{
  minTons: number;
  maxLdm: number;
  maxWeightKg: number;
}> = [
  { minTons: 7,  maxLdm: 8,    maxWeightKg: 3000 },  // 7,5 t
  { minTons: 12, maxLdm: 8,    maxWeightKg: 3000 },  // 12 t — Default
  { minTons: 18, maxLdm: 13.6, maxWeightKg: 11000 }, // 18 t
];

function parseTonnen(raw?: string | null): number | null {
  if (!raw) return null;
  const norm = raw
    .toLowerCase()
    .replace(/_/g, '.')
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .replace(/tonne(n)?$/i, '')
    .replace(/to$/, '')
    .replace(/t$/, '');
  // Erlaubte Token jetzt: '7.5', '12', '18'. parseFloat ist tolerant.
  const n = parseFloat(norm);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tonnenCapacity(tons: number): {
  maxLdm: number;
  maxWeightKg: number;
} | null {
  // groesster Eintrag, dessen minTons <= tons. Sortierung des Arrays
  // garantiert monoton steigend.
  let hit: (typeof TONNEN_CAPACITY)[number] | null = null;
  for (const row of TONNEN_CAPACITY) {
    if (tons + 0.001 >= row.minTons) hit = row;
  }
  return hit ? { maxLdm: hit.maxLdm, maxWeightKg: hit.maxWeightKg } : null;
}

export interface ResolvedVehicleCapacity {
  /** Quelle (fuers UI-Badge / Logging). */
  source: 'sub' | 'tonnen' | 'vehicle-dims' | 'fallback-unknown';
  maxLdm: number;
  maxWeightKg: number;
  /**
   * F1.a-Fix-2: Trailer-Geometrie GEHOERT zur Kapazitaet (nicht zu
   * getVehicleDims, das matched nur canonical-Keys + faellt sonst
   * still auf "Koffer 7t" zurueck → 779% Vol-%). Aus maxLdm
   * abgeleitet wenn keine kanonische Quelle:
   *   length_cm = maxLdm × 100 (1 ldm = 1 m bei 2.4 m Breite)
   *   width_cm  = 240 (NV-Standard)
   *   height_cm = 240 / 270 / 300 je Tonnen-Klasse
   */
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/** F1.a-Fix-2: Box-Ableitung wenn keine canonical VehicleDims-Quelle. */
function deriveBoxFromLdm(maxLdm: number): {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
} {
  const lengthCm = Math.max(100, Math.round(maxLdm * 100));
  const widthCm = 240;
  // Schwellen: Koffer-Klasse <= 8 ldm, Sattel ~13.6, Mega/Jumbo > 13.6.
  const heightCm = maxLdm > 13.6 ? 300 : maxLdm > 8 ? 270 : 240;
  return { lengthCm, widthCm, heightCm };
}

/**
 * F1.a-Fix Cascade fuer NV-Beladeplan-Kapazitaet:
 *   PRIMAER:  sub.max_ldm > 0 → { sub.max_ldm, sub.max_gewicht_kg ?? 0 }
 *   FALLBACK: Tonnen-Parsing (tour-first, dann sub) → TONNEN_CAPACITY
 *   DANN:     getVehicleDims(typ) wenn canonical-Match
 *   LETZTER:  VEHICLE_DEFAULT, source 'fallback-unknown' (UI markiert).
 */
export function resolveVehicleCapacity(
  tour: { fahrzeug_typ?: string | null } | null | undefined,
  sub:
    | {
        fahrzeug_typ?: string | null;
        max_ldm?: number | string | null;
        max_gewicht_kg?: number | string | null;
      }
    | null
    | undefined,
): ResolvedVehicleCapacity {
  const tourTyp = (tour?.fahrzeug_typ ?? '').trim();
  const subTyp = (sub?.fahrzeug_typ ?? '').trim();

  // Optional: canonical VEHICLE_DIMS-Match aus fahrzeug_typ — gibt
  // uns die echte Trailer-Box (Sattel 1360×240×270 etc.), auch wenn
  // die Kapazitaet primaer aus sub-Stammdaten kommt.
  let canonicalDims: VehicleDims | null = null;
  for (const raw of [tourTyp, subTyp]) {
    if (!raw) continue;
    const hit = VEHICLE_DIMS.find(
      (v) => v.type.toLowerCase() === raw.toLowerCase(),
    );
    if (hit) {
      canonicalDims = hit;
      break;
    }
  }

  // PRIMAER: Sub-Stammdaten-Override (Decimal kommt aus Prisma evtl.
  // als string).
  const subMaxLdm =
    sub?.max_ldm != null ? Number(sub.max_ldm) : 0;
  if (Number.isFinite(subMaxLdm) && subMaxLdm > 0) {
    const subMaxKg =
      sub?.max_gewicht_kg != null ? Number(sub.max_gewicht_kg) : 0;
    const box = canonicalDims ?? deriveBoxFromLdm(subMaxLdm);
    return {
      source: 'sub',
      maxLdm: subMaxLdm,
      maxWeightKg: Number.isFinite(subMaxKg) && subMaxKg > 0 ? subMaxKg : 0,
      lengthCm: box.lengthCm,
      widthCm: box.widthCm,
      heightCm: box.heightCm,
    };
  }

  // FALLBACK: Tonnen-Parsing aus fahrzeug_typ (tour-first).
  for (const raw of [tourTyp, subTyp]) {
    const tons = parseTonnen(raw);
    if (tons != null) {
      const cap = tonnenCapacity(tons);
      if (cap) {
        const box = canonicalDims ?? deriveBoxFromLdm(cap.maxLdm);
        return {
          source: 'tonnen',
          maxLdm: cap.maxLdm,
          maxWeightKg: cap.maxWeightKg,
          lengthCm: box.lengthCm,
          widthCm: box.widthCm,
          heightCm: box.heightCm,
        };
      }
    }
  }

  // DANN: canonical VEHICLE_DIMS-Match (Sattel/Jumbo/Koffer 7t etc.).
  if (canonicalDims) {
    return {
      source: 'vehicle-dims',
      maxLdm: canonicalDims.maxLdm,
      maxWeightKg: canonicalDims.maxWeightKg,
      lengthCm: canonicalDims.lengthCm,
      widthCm: canonicalDims.widthCm,
      heightCm: canonicalDims.heightCm,
    };
  }

  // LETZTER: Default-Fallback, source-markiert damit UI badge zeigen
  // kann + console.warn fuer Diagnose (Stammdaten unvollstaendig).
  const fallback =
    VEHICLE_DIMS.find((v) => v.type === VEHICLE_DEFAULT_TYPE) ??
    VEHICLE_DIMS[2];
  // eslint-disable-next-line no-console
  console.warn(
    '[vehicleTypes] resolveVehicleCapacity: kein Match fuer tour=%s ' +
      'sub=%s — Default %s (%s ldm, %s kg). Stammdaten pruefen.',
    tourTyp || 'null',
    subTyp || 'null',
    fallback.type,
    fallback.maxLdm,
    fallback.maxWeightKg,
  );
  return {
    source: 'fallback-unknown',
    maxLdm: fallback.maxLdm,
    maxWeightKg: fallback.maxWeightKg,
    lengthCm: fallback.lengthCm,
    widthCm: fallback.widthCm,
    heightCm: fallback.heightCm,
  };
}

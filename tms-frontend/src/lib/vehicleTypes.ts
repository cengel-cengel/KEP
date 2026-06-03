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
 * Liste kennt nur "Sprinter|Koffer 3.5t|Koffer 7t|Koffer 12t|Sattel".
 * Stiller Fallback "Koffer 7t" (6 ldm) hatte Auslastungs-% von
 * ~300% zur Folge.
 *
 * T1 (S-6.3): Tabelle synchronisiert mit Carlos-Spec (Nutzlast +
 * realistisches Cargo-Vol pro Tonnen-Klasse):
 *    7,5 t →  8.0 ldm /  3000 kg / ≈ 40 m³ (800×240×210)
 *   12  t →  8.7 ldm /  6000 kg / ≈ 50 m³ (870×240×240)
 *   18  t → 10.4 ldm / 10000 kg / ≈ 60 m³ (1040×240×240)
 *   Sattel (canonical VEHICLE_DIMS): 13.6 ldm / 24000 kg / ≈ 88 m³.
 * ⚠ maxWeightKg = NUTZLAST, nicht zGG.
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
  { minTons: 7,  maxLdm: 8.0,  maxWeightKg: 3000 },  //  7,5 t →  40 m³
  { minTons: 12, maxLdm: 8.7,  maxWeightKg: 6000 },  // 12   t →  50 m³
  { minTons: 18, maxLdm: 10.4, maxWeightKg: 10000 }, // 18   t →  60 m³
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
  source: 'sub' | 'tonnen' | 'vehicle-dims' | 'recommended' | 'fallback-unknown';
  maxLdm: number;
  /** T1: NUTZLAST (kg) — nicht zulaessiges Gesamtgewicht (zGG).
   *  Sattel ≈ 24000, 18T ≈ 10000, 12T ≈ 6000, 7,5T ≈ 3000. */
  maxWeightKg: number;
  /** T1: Cargo-Volumen-Kapazitaet (m³), abgeleitet aus innerer Box
   *  (lengthCm × widthCm × heightCm / 1e6). Wird von Hof-FFD
   *  (yardFfd-opts) und Overflow-Diagnose (YardPanel) konsumiert. */
  maxVolM3: number;
  /**
   * F1.a-Fix-2: Trailer-Geometrie GEHOERT zur Kapazitaet (nicht zu
   * getVehicleDims, das matched nur canonical-Keys + faellt sonst
   * still auf "Koffer 7t" zurueck → 779% Vol-%). Aus maxLdm
   * abgeleitet wenn keine kanonische Quelle:
   *   length_cm = maxLdm × 100 (1 ldm = 1 m bei 2.4 m Breite)
   *   width_cm  = 240 (NV-Standard)
   *   height_cm = 210 / 240 / 270 je Tonnen-Klasse
   */
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/** F1.a-Fix-2 + T1: Box-Ableitung wenn keine canonical VehicleDims-
 *  Quelle. Hoehe ist Tonnen-klassen-typisch:
 *    ≤ 8 ldm → 210 (7,5T-Koffer, niedriges Dach)
 *    8.1–13 → 240 (12T/18T-Koffer)
 *    > 13   → 270 (Sattel)
 *  T1.6: jetzt exportiert — FV-Hof verwendet das direkt mit
 *  tour.max_ldm (statt recommendedVehicle.lengthCm/widthCm/heightCm). */
export function deriveBoxFromLdm(maxLdm: number): {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
} {
  const lengthCm = Math.max(100, Math.round(maxLdm * 100));
  const widthCm = 240;
  let heightCm = 240;
  if (maxLdm <= 8.001) heightCm = 210;
  else if (maxLdm > 13) heightCm = 270;
  return { lengthCm, widthCm, heightCm };
}

/** T1: Vol-Helper. Pure cm³ → m³ Umrechnung. */
function calcVolM3(lengthCm: number, widthCm: number, heightCm: number): number {
  return (lengthCm * widthCm * heightCm) / 1e6;
}

/**
 * Cascade fuer Beladeplan-Kapazitaet (Sprint Geo-Hof C1 erweitert):
 *   PRIMAER:  sub.max_ldm > 0 → { sub.max_ldm, sub.max_gewicht_kg ?? 0 }
 *   FALLBACK: Tonnen-Parsing (tour-first, dann sub) → TONNEN_CAPACITY
 *   DANN:     getVehicleDims(typ) wenn canonical-Match
 *   DANN:     recommendedVehicle (Optimizer-Hint) — entweder canonical
 *             via .type ODER explizite Dims/Kapazitaet. Loest den
 *             SATTEL-Bug fuer Touren ohne fahrzeug_typ/sub, wo
 *             Cost+AxleLoad sonst still auf Koffer 7t fielen.
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
  recommendedVehicle?:
    | {
        type?: string | null;
        lengthCm?: number | null;
        widthCm?: number | null;
        heightCm?: number | null;
        maxLdm?: number | null;
        maxWeightKg?: number | null;
      }
    | null,
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
      maxVolM3: calcVolM3(box.lengthCm, box.widthCm, box.heightCm),
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
          maxVolM3: calcVolM3(box.lengthCm, box.widthCm, box.heightCm),
          lengthCm: box.lengthCm,
          widthCm: box.widthCm,
          heightCm: box.heightCm,
        };
      }
    }
  }

  // DANN: canonical VEHICLE_DIMS-Match (Sprinter/Koffer/Sattel).
  if (canonicalDims) {
    return {
      source: 'vehicle-dims',
      maxLdm: canonicalDims.maxLdm,
      maxWeightKg: canonicalDims.maxWeightKg,
      maxVolM3: calcVolM3(
        canonicalDims.lengthCm,
        canonicalDims.widthCm,
        canonicalDims.heightCm,
      ),
      lengthCm: canonicalDims.lengthCm,
      widthCm: canonicalDims.widthCm,
      heightCm: canonicalDims.heightCm,
    };
  }

  // DANN: recommendedVehicle (Optimizer-Hint). Erlaubt zwei Eingabe-
  // formen:
  //   (a) .type matcht canonical VEHICLE_DIMS → Cap aus VEHICLE_DIMS
  //   (b) .maxLdm explizit gesetzt → Box aus .lengthCm/widthCm/heightCm
  //       wenn alle drei vorhanden, sonst deriveBoxFromLdm.
  // Beides bevor wir auf den lauten Default-Fallback fallen.
  if (recommendedVehicle) {
    const recType = (recommendedVehicle.type ?? '').trim();
    if (recType) {
      const hit = VEHICLE_DIMS.find(
        (v) => v.type.toLowerCase() === recType.toLowerCase(),
      );
      if (hit) {
        return {
          source: 'recommended',
          maxLdm: hit.maxLdm,
          maxWeightKg: hit.maxWeightKg,
          maxVolM3: calcVolM3(hit.lengthCm, hit.widthCm, hit.heightCm),
          lengthCm: hit.lengthCm,
          widthCm: hit.widthCm,
          heightCm: hit.heightCm,
        };
      }
    }
    const recMaxLdm = Number(recommendedVehicle.maxLdm ?? 0);
    if (Number.isFinite(recMaxLdm) && recMaxLdm > 0) {
      const recLen = Number(recommendedVehicle.lengthCm ?? 0);
      const recWid = Number(recommendedVehicle.widthCm ?? 0);
      const recHei = Number(recommendedVehicle.heightCm ?? 0);
      const explicitBox =
        recLen > 0 && recWid > 0 && recHei > 0
          ? { lengthCm: recLen, widthCm: recWid, heightCm: recHei }
          : null;
      const box = explicitBox ?? deriveBoxFromLdm(recMaxLdm);
      const recKg = Number(recommendedVehicle.maxWeightKg ?? 0);
      return {
        source: 'recommended',
        maxLdm: recMaxLdm,
        maxWeightKg: Number.isFinite(recKg) && recKg > 0 ? recKg : 0,
        maxVolM3: calcVolM3(box.lengthCm, box.widthCm, box.heightCm),
        lengthCm: box.lengthCm,
        widthCm: box.widthCm,
        heightCm: box.heightCm,
      };
    }
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
    maxVolM3: calcVolM3(
      fallback.lengthCm,
      fallback.widthCm,
      fallback.heightCm,
    ),
    lengthCm: fallback.lengthCm,
    widthCm: fallback.widthCm,
    heightCm: fallback.heightCm,
  };
}

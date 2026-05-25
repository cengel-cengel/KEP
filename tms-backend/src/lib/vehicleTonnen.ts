/**
 * T1.5 — BE-Mirror der FE-Tonnen-Kapazitaets-Tabelle + NV-Tour-Cap-
 * Cascade. Spiegelt 1:1 die Logik aus
 *   tms-frontend/src/lib/vehicleTypes.ts
 * (TONNEN_CAPACITY + parseTonnen + tonnenCapacity + Sub-Override-
 *  Cascade in resolveVehicleCapacity).
 *
 * ⚠ SYNC-PFLICHT
 *   Diese Werte MUESSEN identisch mit FE bleiben (sonst zeigt der
 *   Hof eine andere LKW-Zahl als die Overload-Badge im Tour-Header
 *   → Carlos kann nichts mehr vergleichen).
 *   Bei Aenderung an FE TONNEN_CAPACITY → HIER mit-pflegen.
 *
 *   Monorepo-Single-Source waere die saubere Loesung, scheitert aber
 *   an fehlendem Root-package.json / pnpm-workspace + getrennten
 *   tsconfig-rootDirs (FE Vite "bundler" vs BE Nest tsc-emit). 50
 *   Zeilen Spiegelung sind handhabbar; Workaround-Pfade (Symlinks,
 *   copy-step, npm-package) waeren Setup-Overhead fuer diesen Use-
 *   Case.
 *
 * Was T1.5 fixt
 *   Vor T1.5 endete der NV-Overload-Cascade nach sub.max_ldm →
 *   cap=null wenn Sub-Stammdaten fehlen. Touren mit nur tour.
 *   fahrzeug_typ='12T'/'18T' bekamen so KEINE Overload-Erkennung
 *   (Badge blieb gruen trotz Σ Vol > Kapazitaet). FE-Yard nutzte
 *   den Tonnen-Fallback bereits — BE zog jetzt nach.
 */

/** Mirror FE vehicleTypes.ts TONNEN_CAPACITY (Carlos-T1-Spec):
 *    7,5 t →  8.0 ldm /  3000 kg (≈ 40 m³ via deriveBoxFromLdm)
 *   12  t →  8.7 ldm /  6000 kg (≈ 50 m³)
 *   18  t → 10.4 ldm / 10000 kg (≈ 60 m³)
 *   Sattel-canonical kommt nicht hier durch — Sattel-Tour bekommt
 *   sub.max_ldm/max_gewicht_kg aus Stammdaten oder default 13.6/24000
 *   (siehe FV-tours; NV-Sattel ist selten ohne Sub-Stammdaten).
 */
const TONNEN_CAPACITY: ReadonlyArray<{
  minTons: number;
  maxLdm: number;
  maxWeightKg: number;
}> = [
  { minTons: 7,  maxLdm: 8.0,  maxWeightKg: 3000 },
  { minTons: 12, maxLdm: 8.7,  maxWeightKg: 6000 },
  { minTons: 18, maxLdm: 10.4, maxWeightKg: 10000 },
];

/** Mirror FE parseTonnen. Akzeptiert "7_5T", "12T", "18 to", "7,5",
 *  "18 Tonnen" usw. Returns die parseFloat-Zahl oder null. */
export function parseTonnen(raw?: string | null): number | null {
  if (!raw) return null;
  const norm = raw
    .toLowerCase()
    .replace(/_/g, '.')
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .replace(/tonne(n)?$/i, '')
    .replace(/to$/, '')
    .replace(/t$/, '');
  const n = parseFloat(norm);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Mirror FE tonnenCapacity. Gibt den groessten Eintrag zurueck, dessen
 *  minTons <= tons. */
export function tonnenCapacity(
  tons: number,
): { maxLdm: number; maxWeightKg: number } | null {
  let hit: (typeof TONNEN_CAPACITY)[number] | null = null;
  for (const row of TONNEN_CAPACITY) {
    if (tons + 0.001 >= row.minTons) hit = row;
  }
  return hit ? { maxLdm: hit.maxLdm, maxWeightKg: hit.maxWeightKg } : null;
}

export interface NvCapacity {
  /** Quelle (debug/audit). */
  source: 'sub' | 'tonnen' | 'none';
  maxLdm: number | null;
  maxWeightKg: number | null;
}

/**
 * NV-Tour-Cap-Cascade (1:1 Spiegelung FE resolveVehicleCapacity-
 * Reihenfolge, NV-Teil):
 *
 *   1. PRIMAER  Sub-Override: sub.max_ldm > 0 → SUB-Pfad.
 *               weightKg = sub.max_gewicht_kg wenn > 0, sonst null
 *               (null = "kein Weight-Cap", computeOverload returnt 0).
 *               Teilfall: nur max_ldm gesetzt → SUB-Pfad mit kg=null.
 *               Teilfall: nur max_gewicht_kg gesetzt → fall through
 *               (weil Bedingung "sub.max_ldm > 0" false ist).
 *   2. FALLBACK Tonnen aus fahrzeug_typ — TOUR-first, dann SUB.
 *   3. SONST    source='none', beide caps null (computeOverload
 *               returnt ratio=0 → keine Overload-Detection).
 *
 * ⚠ Reihenfolge-Parität-Tests in vehicleTonnen.spec.ts. Bei Aenderung
 * → FE-vehicleTypes.test.ts mit aktualisieren.
 */
export function resolveNvCapacity(
  tour: { fahrzeug_typ?: string | null } | null | undefined,
  sub:
    | {
        fahrzeug_typ?: string | null;
        // unknown — Prisma liefert Decimal-Instanzen; Number() handlet
        // alle Sub-Typen (Decimal/string/number) transparent.
        max_ldm?: unknown;
        max_gewicht_kg?: unknown;
      }
    | null
    | undefined,
): NvCapacity {
  // 1. PRIMAER: Sub-Override (Prisma Decimal kommt evtl. als string).
  const subMaxLdm = sub?.max_ldm != null ? Number(sub.max_ldm) : 0;
  if (Number.isFinite(subMaxLdm) && subMaxLdm > 0) {
    const subMaxKg =
      sub?.max_gewicht_kg != null ? Number(sub.max_gewicht_kg) : 0;
    return {
      source: 'sub',
      maxLdm: subMaxLdm,
      maxWeightKg:
        Number.isFinite(subMaxKg) && subMaxKg > 0 ? subMaxKg : null,
    };
  }

  // 2. FALLBACK: Tonnen-Parsing aus fahrzeug_typ (tour-first, dann sub).
  for (const raw of [
    tour?.fahrzeug_typ ?? null,
    sub?.fahrzeug_typ ?? null,
  ]) {
    const tons = parseTonnen(raw);
    if (tons != null) {
      const cap = tonnenCapacity(tons);
      if (cap) {
        return {
          source: 'tonnen',
          maxLdm: cap.maxLdm,
          maxWeightKg: cap.maxWeightKg,
        };
      }
    }
  }

  // 3. Keine Quelle → null. Overload-Badge bleibt gruen
  //    (computeOverload returnt ratio=0 bei max=null).
  return { source: 'none', maxLdm: null, maxWeightKg: null };
}

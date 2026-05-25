/**
 * T1.5 — Spec fuer vehicleTonnen.ts.
 *
 * Cascade-Paritaet zu FE (resolveVehicleCapacity in
 * tms-frontend/src/lib/vehicleTypes.ts):
 *   1. PRIMAER  sub.max_ldm > 0 → sub-Pfad (kg=null wenn fehlend)
 *   2. FALLBACK tour.fahrzeug_typ / sub.fahrzeug_typ → tonnen
 *   3. SONST    {maxLdm: null, maxWeightKg: null}
 *
 * Teilfall-Coverage explizit:
 *   · nur max_ldm gesetzt → SUB-Pfad mit kg=null
 *   · nur max_gewicht_kg gesetzt → fall through (Bedingung false)
 *   · max_ldm=0 → fall through
 *   · max_ldm="abc" → fall through (NaN)
 */
import { describe, expect, it } from '@jest/globals';
import {
  parseTonnen,
  tonnenCapacity,
  resolveNvCapacity,
} from './vehicleTonnen';

describe('parseTonnen', () => {
  it('parses tonnen-tokens', () => {
    expect(parseTonnen('7_5T')).toBe(7.5);
    expect(parseTonnen('7,5')).toBe(7.5);
    expect(parseTonnen('12T')).toBe(12);
    expect(parseTonnen('18 to')).toBe(18);
    expect(parseTonnen('18 Tonnen')).toBe(18);
    expect(parseTonnen('  7.5T  ')).toBe(7.5);
  });
  it('returns null for invalid input', () => {
    expect(parseTonnen(null)).toBeNull();
    expect(parseTonnen(undefined)).toBeNull();
    expect(parseTonnen('')).toBeNull();
    expect(parseTonnen('Sattel')).toBeNull();
    expect(parseTonnen('abc')).toBeNull();
  });
});

describe('tonnenCapacity', () => {
  it('matches largest entry with minTons <= tons', () => {
    expect(tonnenCapacity(7.5)).toEqual({ maxLdm: 8.0, maxWeightKg: 3000 });
    expect(tonnenCapacity(12)).toEqual({ maxLdm: 8.7, maxWeightKg: 6000 });
    expect(tonnenCapacity(18)).toEqual({ maxLdm: 10.4, maxWeightKg: 10000 });
    // Zwischenwerte mappen auf naechst-kleinere Klasse.
    expect(tonnenCapacity(10)).toEqual({ maxLdm: 8.0, maxWeightKg: 3000 });
    expect(tonnenCapacity(15)).toEqual({ maxLdm: 8.7, maxWeightKg: 6000 });
    expect(tonnenCapacity(25)).toEqual({ maxLdm: 10.4, maxWeightKg: 10000 });
  });
  it('returns null for tons < 7', () => {
    expect(tonnenCapacity(3)).toBeNull();
    expect(tonnenCapacity(6.99)).toBeNull();
  });
});

describe('resolveNvCapacity — Cascade-Paritaet zu FE', () => {
  describe('1. PRIMAER: Sub-Override (sub.max_ldm > 0)', () => {
    it('beide gesetzt → SUB mit beiden Werten', () => {
      const cap = resolveNvCapacity(
        { fahrzeug_typ: '12T' }, // wird ignoriert — sub gewinnt
        { max_ldm: 7.5, max_gewicht_kg: 2800 },
      );
      expect(cap).toEqual({
        source: 'sub',
        maxLdm: 7.5,
        maxWeightKg: 2800,
      });
    });
    it('Teilfall: nur max_ldm gesetzt → SUB mit kg=null', () => {
      const cap = resolveNvCapacity(
        { fahrzeug_typ: '12T' },
        { max_ldm: 8, max_gewicht_kg: null },
      );
      expect(cap).toEqual({
        source: 'sub',
        maxLdm: 8,
        maxWeightKg: null, // null = "kein Weight-Cap" (computeOverload → ratio 0)
      });
    });
    it('Decimal-string aus Prisma → numerisch', () => {
      const cap = resolveNvCapacity(null, {
        max_ldm: '13.6' as unknown as number,
        max_gewicht_kg: '24000' as unknown as number,
      });
      expect(cap.source).toBe('sub');
      expect(cap.maxLdm).toBe(13.6);
      expect(cap.maxWeightKg).toBe(24000);
    });
  });

  describe('2. FALLBACK: Tonnen aus fahrzeug_typ (tour-first)', () => {
    it('Teilfall: nur max_gewicht_kg gesetzt → fall through zu Tonnen', () => {
      const cap = resolveNvCapacity(
        { fahrzeug_typ: '12T' },
        { max_ldm: null, max_gewicht_kg: 5000 },
      );
      // Sub-Pfad NICHT genommen (max_ldm fehlt → Bedingung false).
      // Tour-fahrzeug_typ '12T' → Tonnen-Tabelle.
      expect(cap).toEqual({
        source: 'tonnen',
        maxLdm: 8.7,
        maxWeightKg: 6000,
      });
    });
    it('max_ldm=0 → fall through zu Tonnen', () => {
      const cap = resolveNvCapacity(
        { fahrzeug_typ: '18T' },
        { max_ldm: 0, max_gewicht_kg: 999 },
      );
      expect(cap).toEqual({
        source: 'tonnen',
        maxLdm: 10.4,
        maxWeightKg: 10000,
      });
    });
    it('max_ldm=NaN-Garbage → fall through zu Tonnen', () => {
      const cap = resolveNvCapacity(
        { fahrzeug_typ: '7_5T' },
        { max_ldm: 'abc' as unknown as number, max_gewicht_kg: null },
      );
      expect(cap).toEqual({
        source: 'tonnen',
        maxLdm: 8.0,
        maxWeightKg: 3000,
      });
    });
    it('tour leer, sub.fahrzeug_typ gesetzt → Tonnen aus sub', () => {
      const cap = resolveNvCapacity(
        { fahrzeug_typ: null },
        { fahrzeug_typ: '18T', max_ldm: null, max_gewicht_kg: null },
      );
      expect(cap).toEqual({
        source: 'tonnen',
        maxLdm: 10.4,
        maxWeightKg: 10000,
      });
    });
    it('tour-fahrzeug_typ gewinnt vor sub.fahrzeug_typ', () => {
      const cap = resolveNvCapacity(
        { fahrzeug_typ: '12T' },
        { fahrzeug_typ: '7_5T', max_ldm: null, max_gewicht_kg: null },
      );
      expect(cap.source).toBe('tonnen');
      expect(cap.maxLdm).toBe(8.7); // 12T, nicht 7,5T
      expect(cap.maxWeightKg).toBe(6000);
    });
  });

  describe('3. SONST: null', () => {
    it('keine Quelle → maxLdm/maxWeightKg=null', () => {
      const cap = resolveNvCapacity(
        { fahrzeug_typ: 'Sattel' }, // canonical-Match, kein Tonnen
        { max_ldm: null, max_gewicht_kg: null, fahrzeug_typ: null },
      );
      // 'Sattel' parseTonnen → null → kein Tonnen-Match → 'none'.
      // (Unterschied zu FE: dort schlaegt anschliessend VEHICLE_DIMS
      // canonical zu — BE braucht das nicht weil Sattel-Touren in
      // der Praxis sub-Stammdaten haben oder tour.max_ldm direkt.)
      expect(cap).toEqual({
        source: 'none',
        maxLdm: null,
        maxWeightKg: null,
      });
    });
    it('alles null/undefined → none', () => {
      expect(resolveNvCapacity(null, null)).toEqual({
        source: 'none',
        maxLdm: null,
        maxWeightKg: null,
      });
      expect(resolveNvCapacity(undefined, undefined)).toEqual({
        source: 'none',
        maxLdm: null,
        maxWeightKg: null,
      });
    });
  });
});

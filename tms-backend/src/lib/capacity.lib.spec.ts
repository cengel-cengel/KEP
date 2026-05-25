import {
  computeOverload,
  deriveMaxVolM3,
  formatOverloadMessage,
} from './capacity.lib';

describe('capacity.lib', () => {
  describe('computeOverload', () => {
    it('100% genau (vol + weight) → isOverloaded false', () => {
      // Vol-Ratio 100% (50/50 m³), Weight 100% (24000/24000)
      const o = computeOverload(13.6, 24000, 13.6, 24000, 50, 50);
      expect(o.ldm).toBeCloseTo(1.0);
      expect(o.weight).toBeCloseTo(1.0);
      expect(o.vol).toBeCloseTo(1.0);
      expect(o.isOverloaded).toBe(false);
    });

    it('O-3: ldm > 1 ALLEIN triggert NICHT (vol+weight ok)', () => {
      // ldm 13.74 / 13.6 = 1.01, vol+weight unter 100%.
      const o = computeOverload(13.74, 20000, 13.6, 24000, 40, 88);
      expect(o.ldm).toBeCloseTo(1.01, 2);
      expect(o.vol).toBeLessThan(1);
      expect(o.weight).toBeLessThan(1);
      // ldm triggert nicht mehr.
      expect(o.isOverloaded).toBe(false);
    });

    it('O-3: vol > 1 ALLEIN triggert', () => {
      // Vol 95/88, ldm+weight ok.
      const o = computeOverload(10, 20000, 13.6, 24000, 95, 88);
      expect(o.vol).toBeGreaterThan(1);
      expect(o.weight).toBeLessThan(1);
      expect(o.isOverloaded).toBe(true);
    });

    it('O-3: weight > 1 ALLEIN triggert', () => {
      const o = computeOverload(10, 26000, 13.6, 24000, 40, 88);
      expect(o.weight).toBeGreaterThan(1);
      expect(o.vol).toBeLessThan(1);
      expect(o.isOverloaded).toBe(true);
    });

    it('O-3: vol + weight beide > 1 → isOverloaded mit beiden Anteilen', () => {
      const o = computeOverload(10, 26000, 13.6, 24000, 95, 88);
      expect(o.vol).toBeGreaterThan(1);
      expect(o.weight).toBeGreaterThan(1);
      expect(o.isOverloaded).toBe(true);
    });

    it('max=null → ratio 0 (kein Overload, auch wenn total > 0)', () => {
      const o = computeOverload(100, 100, null, null, 100, null);
      expect(o.ldm).toBe(0);
      expect(o.weight).toBe(0);
      expect(o.vol).toBe(0);
      expect(o.isOverloaded).toBe(false);
    });

    it('max=0 → ratio 0 (kein Limit)', () => {
      const o = computeOverload(100, 100, 0, 0, 100, 0);
      expect(o.isOverloaded).toBe(false);
    });

    it('partial limits (ldm gesetzt, weight+vol null) → kein Trigger', () => {
      // ldm > 1 alleine reicht nicht.
      const o = computeOverload(15, 20000, 13.6, null, 40, null);
      expect(o.ldm).toBeGreaterThan(1);
      expect(o.weight).toBe(0);
      expect(o.vol).toBe(0);
      expect(o.isOverloaded).toBe(false);
    });

    it('legacy 4-Arg-Aufruf: vol default = 0 → kein Vol-Trigger', () => {
      // Aufrufer der noch nicht migriert ist liefert kein vol.
      // ldm/weight wie alt; isOverloaded bleibt false weil weder
      // vol noch weight ueberlauft (selbst wenn ldm tut).
      const o = computeOverload(15, 20000, 13.6, 24000);
      expect(o.vol).toBe(0);
      expect(o.isOverloaded).toBe(false);
    });
  });

  describe('formatOverloadMessage', () => {
    it('O-3: vol + weight beide → beide im String', () => {
      const msg = formatOverloadMessage({
        ldm: 1.15,
        weight: 1.02,
        vol: 1.08,
        isOverloaded: true,
      });
      expect(msg).toContain('1.08× Volumen');
      expect(msg).toContain('1.02× Gewicht');
      // O-3: ldm erscheint NICHT mehr in der Message.
      expect(msg).not.toContain('LDM');
    });

    it('O-3: nur vol overloaded', () => {
      const msg = formatOverloadMessage({
        ldm: 0.5,
        weight: 0.5,
        vol: 1.2,
        isOverloaded: true,
      });
      expect(msg).toContain('1.20× Volumen');
      expect(msg).not.toContain('Gewicht');
      expect(msg).not.toContain('LDM');
    });

    it('O-3: ldm > 1 ALLEIN → "innerhalb Kapazität" (ldm nicht im String)', () => {
      const msg = formatOverloadMessage({
        ldm: 1.5,
        weight: 0.5,
        vol: 0.5,
        isOverloaded: false,
      });
      expect(msg).toBe('Tour innerhalb Kapazität');
    });

    it('keiner overloaded', () => {
      const msg = formatOverloadMessage({
        ldm: 0.5,
        weight: 0.5,
        vol: 0.5,
        isOverloaded: false,
      });
      expect(msg).toBe('Tour innerhalb Kapazität');
    });
  });

  describe('deriveMaxVolM3 — T1.5 height-Schwellen (210/240/270)', () => {
    it('Sattel (13.6 ldm) → 88.128 m³ (height 270, da > 13)', () => {
      expect(deriveMaxVolM3(13.6)).toBeCloseTo(88.128, 3);
    });

    it('18T (10.4 ldm) → 59.9 m³ (height 240)', () => {
      // T1.5: 1040 × 240 × 240 / 1e6 = 59.904. Carlos-Spec ≈ 60.
      expect(deriveMaxVolM3(10.4)).toBeCloseTo(59.9, 1);
    });

    it('12T (8.7 ldm) → 50.1 m³ (height 240)', () => {
      // T1.5: 870 × 240 × 240 / 1e6 = 50.112. Carlos-Spec ≈ 50.
      expect(deriveMaxVolM3(8.7)).toBeCloseTo(50.1, 1);
    });

    it('7,5T (8 ldm) → 40.3 m³ (T1.5: height 210, vorher 240→46.08)', () => {
      // Carlos-T1: 800 × 240 × 210 / 1e6 = 40.32. ≈ 40.
      expect(deriveMaxVolM3(8)).toBeCloseTo(40.32, 2);
    });

    it('Koffer 7t (6 ldm) → 30.24 m³ (T1.5: height 210, vorher 240→34.56)', () => {
      expect(deriveMaxVolM3(6)).toBeCloseTo(30.24, 2);
    });

    it('Sprinter (2 ldm) → 10.08 m³ (T1.5: height 210)', () => {
      // 200 × 240 × 210 / 1e6 = 10.08
      expect(deriveMaxVolM3(2)).toBeCloseTo(10.08, 2);
    });

    it('null / undefined → null', () => {
      expect(deriveMaxVolM3(null)).toBeNull();
      expect(deriveMaxVolM3(undefined)).toBeNull();
    });

    it('0 oder negativ → null', () => {
      expect(deriveMaxVolM3(0)).toBeNull();
      expect(deriveMaxVolM3(-5)).toBeNull();
    });

    it('Mindest-length-Floor (sehr kleines maxLdm < 1)', () => {
      // 0.5 ldm × 100 = 50 cm — floor auf 100 cm.
      // T1.5: 100 × 240 × 210 / 1e6 = 5.04
      expect(deriveMaxVolM3(0.5)).toBeCloseTo(5.04, 2);
    });
  });
});

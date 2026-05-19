import {
  computeOverload,
  formatOverloadMessage,
} from './capacity.lib';

describe('capacity.lib', () => {
  describe('computeOverload', () => {
    it('100% genau → isOverloaded false', () => {
      const o = computeOverload(13.6, 24000, 13.6, 24000);
      expect(o.ldm).toBeCloseTo(1.0);
      expect(o.weight).toBeCloseTo(1.0);
      expect(o.isOverloaded).toBe(false);
    });

    it('101% LDM → true mit ldm:1.01', () => {
      const o = computeOverload(13.74, 20000, 13.6, 24000);
      expect(o.ldm).toBeCloseTo(1.01, 2);
      expect(o.isOverloaded).toBe(true);
    });

    it('beide overloaded', () => {
      const o = computeOverload(15, 26000, 13.6, 24000);
      expect(o.ldm).toBeGreaterThan(1);
      expect(o.weight).toBeGreaterThan(1);
      expect(o.isOverloaded).toBe(true);
    });

    it('max=null → ratio 0', () => {
      const o = computeOverload(100, 100, null, null);
      expect(o.ldm).toBe(0);
      expect(o.weight).toBe(0);
      expect(o.isOverloaded).toBe(false);
    });

    it('max=0 → ratio 0 (kein Limit)', () => {
      const o = computeOverload(100, 100, 0, 0);
      expect(o.isOverloaded).toBe(false);
    });

    it('partial limits', () => {
      const o = computeOverload(15, 20000, 13.6, null);
      expect(o.ldm).toBeGreaterThan(1);
      expect(o.weight).toBe(0);
      expect(o.isOverloaded).toBe(true);
    });
  });

  describe('formatOverloadMessage', () => {
    it('beide overloaded', () => {
      const msg = formatOverloadMessage({
        ldm: 1.15,
        weight: 1.02,
        isOverloaded: true,
      });
      expect(msg).toContain('1.15× LDM');
      expect(msg).toContain('1.02× Gewicht');
    });
    it('nur ldm overloaded', () => {
      const msg = formatOverloadMessage({
        ldm: 1.2,
        weight: 0.5,
        isOverloaded: true,
      });
      expect(msg).toContain('1.20× LDM');
      expect(msg).not.toContain('Gewicht');
    });
    it('keiner overloaded', () => {
      const msg = formatOverloadMessage({
        ldm: 0.5,
        weight: 0.5,
        isOverloaded: false,
      });
      expect(msg).toBe('Tour innerhalb Kapazität');
    });
  });
});

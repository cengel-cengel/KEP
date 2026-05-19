import {
  canPair,
  isShipmentFullyStackable,
  DEFAULT_MAX_STACK_HEIGHT_CM,
  DEFAULT_MAX_STACK_WEIGHT_KG,
} from './stackable.lib';

describe('stackable.lib', () => {
  const bottomOk = { height_cm: 100, weight_kg: 500, stackable: true };
  const topOk = { height_cm: 100, weight_kg: 500, stackable: false };

  describe('canPair', () => {
    it('erlaubt Paar wenn bottom.stackable=true und Limits eingehalten', () => {
      expect(canPair(bottomOk, topOk)).toBe(true);
    });

    it('blockiert wenn bottom.stackable=false', () => {
      expect(canPair({ ...bottomOk, stackable: false }, topOk)).toBe(false);
    });

    it('ignoriert top.stackable', () => {
      expect(canPair(bottomOk, { ...topOk, stackable: false })).toBe(true);
      expect(canPair(bottomOk, { ...topOk, stackable: true })).toBe(true);
    });

    it('blockiert wenn height überschritten', () => {
      const tallBottom = { ...bottomOk, height_cm: 150 };
      const tallTop = { ...topOk, height_cm: 100 };
      expect(canPair(tallBottom, tallTop)).toBe(false);
      expect(150 + 100).toBeGreaterThan(DEFAULT_MAX_STACK_HEIGHT_CM);
    });

    it('blockiert wenn weight überschritten', () => {
      const heavy = { ...bottomOk, weight_kg: 900 };
      const heavyTop = { ...topOk, weight_kg: 700 };
      expect(canPair(heavy, heavyTop)).toBe(false);
      expect(900 + 700).toBeGreaterThan(DEFAULT_MAX_STACK_WEIGHT_KG);
    });

    it('akzeptiert custom Limits', () => {
      const tall = { height_cm: 200, weight_kg: 100, stackable: true };
      expect(canPair(tall, tall, { maxHeightCm: 500 })).toBe(true);
    });
  });

  describe('isShipmentFullyStackable', () => {
    it('true wenn alle items stackable!==false', () => {
      expect(
        isShipmentFullyStackable([
          { height_cm: 100, weight_kg: 100, stackable: true },
          { height_cm: 100, weight_kg: 100, stackable: true },
        ]),
      ).toBe(true);
    });
    it('false wenn mind. ein item stackable=false', () => {
      expect(
        isShipmentFullyStackable([
          { height_cm: 100, weight_kg: 100, stackable: true },
          { height_cm: 100, weight_kg: 100, stackable: false },
        ]),
      ).toBe(false);
    });
    it('true bei leerer Liste (vacuously)', () => {
      expect(isShipmentFullyStackable([])).toBe(true);
    });
  });
});

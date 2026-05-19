import {
  canPair,
  canPairShipments,
  computeEffectiveLdm,
  isShipmentFullyStackable,
  DEFAULT_MAX_STACK_HEIGHT_CM,
  DEFAULT_MAX_STACK_WEIGHT_KG,
  type StackShipment,
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

  describe('canPairShipments', () => {
    const okBottom: StackShipment = {
      ldm: 1.2,
      height_cm: 100,
      weight_kg: 500,
      stackable: true,
    };
    const okTop: StackShipment = {
      ldm: 1.2,
      height_cm: 100,
      weight_kg: 500,
      stackable: false,
    };
    it('erlaubt wenn bottom.stackable + Limits ok', () => {
      expect(canPairShipments(okBottom, okTop)).toBe(true);
    });
    it('blockiert bottom.stackable=false', () => {
      expect(canPairShipments({ ...okBottom, stackable: false }, okTop)).toBe(false);
    });
    it('blockiert bei height-Überschreitung', () => {
      expect(
        canPairShipments(
          { ...okBottom, height_cm: 150 },
          { ...okTop, height_cm: 100 },
        ),
      ).toBe(false);
    });
    it('blockiert bei weight-Überschreitung', () => {
      expect(
        canPairShipments(
          { ...okBottom, weight_kg: 900 },
          { ...okTop, weight_kg: 700 },
        ),
      ).toBe(false);
    });
    it('top.stackable wird ignoriert', () => {
      expect(canPairShipments(okBottom, { ...okTop, stackable: true })).toBe(true);
    });
  });

  describe('computeEffectiveLdm', () => {
    const mk = (
      ldm: number,
      h = 100,
      kg = 500,
      stackable = true,
    ): StackShipment => ({ ldm, height_cm: h, weight_kg: kg, stackable });

    it('2 stapelbare Sendungen je 1.2 LDM → 1.2 effective', () => {
      expect(computeEffectiveLdm([mk(1.2), mk(1.2)])).toBeCloseTo(1.2);
    });
    it('2 Sendungen, bottom non-stackable → 2.4 unpaired', () => {
      const ships = [mk(1.2, 100, 500, false), mk(1.2, 100, 500, false)];
      expect(computeEffectiveLdm(ships)).toBeCloseTo(2.4);
    });
    it('height-Limit verletzt → unpaired (2.4)', () => {
      const ships = [mk(1.2, 150), mk(1.2, 100)];
      expect(computeEffectiveLdm(ships)).toBeCloseTo(2.4);
    });
    it('weight-Limit verletzt → unpaired (2.4)', () => {
      const ships = [mk(1.2, 100, 900), mk(1.2, 100, 700)];
      expect(computeEffectiveLdm(ships)).toBeCloseTo(2.4);
    });
    it('3 Sendungen: 2 pair, 1 alone → 1.2 + 1.2 = 2.4', () => {
      expect(
        computeEffectiveLdm([mk(1.2), mk(1.2), mk(1.2)]),
      ).toBeCloseTo(2.4);
    });
    it('Greedy: größter bottom paart mit größtem passenden top', () => {
      const ships = [mk(2.0), mk(1.5), mk(0.8)];
      // 2.0 paart mit 1.5 → 2.0; 0.8 alone → 2.8
      expect(computeEffectiveLdm(ships)).toBeCloseTo(2.8);
    });
    it('non-stackable mit stapelbarem mix', () => {
      const ships = [
        mk(2.0, 100, 500, false), // unpaired bottom
        mk(1.2),                   // stack-pair-able
        mk(1.2),
      ];
      // 2.0 alone (non-stackable bottom) + 1.2-pair
      expect(computeEffectiveLdm(ships)).toBeCloseTo(3.2);
    });
    it('leere Liste → 0', () => {
      expect(computeEffectiveLdm([])).toBe(0);
    });
  });

  describe('isShipmentFullyStackable', () => {
    it('true wenn alle items stackable!==false', () => {
      expect(
        isShipmentFullyStackable([
          { stackable: true },
          { stackable: true },
        ]),
      ).toBe(true);
    });
    it('false wenn mind. ein item stackable=false', () => {
      expect(
        isShipmentFullyStackable([
          { stackable: true },
          { stackable: false },
        ]),
      ).toBe(false);
    });
    it('true bei leerer Liste (vacuously)', () => {
      expect(isShipmentFullyStackable([])).toBe(true);
    });
  });
});

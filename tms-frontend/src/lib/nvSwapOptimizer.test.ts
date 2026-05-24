/**
 * F2.1 + O-1 Tests fuer nvSwapOptimizer (pure, synthetisch).
 *
 * Heutiges Datum ist laut Projekt-Kontext 2026-05-24 → "2025-01-01"
 * ist eindeutig overdue (kein Datums-Mock noetig).
 *
 * O-1: Optimizer-Metriken sind Volumen (m³) + Gewicht (kg). ldm/
 * Stack-Faktor sind RAUS — Volumen ist die natuerliche 3D-Metrik
 * fuer eine voll gestapelte Tour.
 */
import { describe, expect, it } from 'vitest';
import {
  findSwapPlan,
  isFixSendung,
  subsetVolumeM3,
  subsetWeightKg,
  type SwapShipment,
} from './nvSwapOptimizer';

function mk(o: Partial<SwapShipment> & { id: string }): SwapShipment {
  return {
    volumeM3: 1,
    weightKg: 100,
    is_stamm_kunde: false,
    has_active_lock: false,
    is_hazmat: false,
    status: 'new',
    loading_date: '2026-05-24',
    ...o,
  };
}

describe('isFixSendung', () => {
  it('Stamm-Kunde → fix', () => {
    expect(isFixSendung(mk({ id: 's', is_stamm_kunde: true }))).toBe(true);
  });
  it('Ueberfaellig (status=new + loading_date past) → fix', () => {
    expect(
      isFixSendung(mk({ id: 's', loading_date: '2025-01-01', status: 'new' })),
    ).toBe(true);
  });
  it('Active-Lock → fix', () => {
    expect(isFixSendung(mk({ id: 's', has_active_lock: true }))).toBe(true);
  });
  it('Hazmat → fix', () => {
    expect(isFixSendung(mk({ id: 's', is_hazmat: true }))).toBe(true);
  });
  it('FV-Tier-Reuse: priorityTier="A" + fixTiers=[VIP,A] → fix', () => {
    expect(
      isFixSendung(mk({ id: 's', customer_priority_tier: 'A' }), {
        fixTiers: ['VIP', 'A'],
      }),
    ).toBe(true);
  });
  it('FV-Tier-Reuse: priorityTier="B" + fixTiers=[VIP,A] → NICHT fix', () => {
    expect(
      isFixSendung(mk({ id: 's', customer_priority_tier: 'B' }), {
        fixTiers: ['VIP', 'A'],
      }),
    ).toBe(false);
  });
  it('Standard-Sendung (kein Flag) → NICHT fix', () => {
    expect(isFixSendung(mk({ id: 's' }))).toBe(false);
  });
});

describe('subsetVolumeM3', () => {
  it('Summe der Volumen', () => {
    expect(
      subsetVolumeM3([
        mk({ id: 'a', volumeM3: 1.5 }),
        mk({ id: 'b', volumeM3: 2.25 }),
      ]),
    ).toBeCloseTo(3.75, 9);
  });
  it('leer → 0', () => {
    expect(subsetVolumeM3([])).toBe(0);
  });
  it('null/undefined Volumen → 0', () => {
    expect(
      subsetVolumeM3([
        mk({ id: 'a', volumeM3: null }),
        mk({ id: 'b', volumeM3: undefined }),
      ]),
    ).toBe(0);
  });
});

describe('subsetWeightKg', () => {
  it('Summe der Gewichte', () => {
    expect(
      subsetWeightKg([
        mk({ id: 'a', weightKg: 500 }),
        mk({ id: 'b', weightKg: 1200 }),
      ]),
    ).toBe(1700);
  });
  it('leer → 0', () => {
    expect(subsetWeightKg([])).toBe(0);
  });
});

describe('findSwapPlan', () => {
  it('kein-Swap-noetig (Vol+Weight beide passen) → null', () => {
    const result = findSwapPlan({
      fixShipments: [mk({ id: 'f1', volumeM3: 3, weightKg: 500 })],
      swappableShipments: [mk({ id: 's1', volumeM3: 2, weightKg: 300 })],
      maxVolM3: 10,
      maxWeightKg: 5000,
    });
    expect(result).toBeNull();
  });

  it('Stamm/Overdue/Lock/Hazmat NIE in ejectIds (Massentest)', () => {
    const fixs = [
      mk({ id: 'stamm', is_stamm_kunde: true, volumeM3: 1, weightKg: 200 }),
      mk({
        id: 'overdue',
        loading_date: '2025-01-01',
        status: 'new',
        volumeM3: 1,
        weightKg: 200,
      }),
      mk({ id: 'lock', has_active_lock: true, volumeM3: 1, weightKg: 200 }),
      mk({ id: 'hazmat', is_hazmat: true, volumeM3: 1, weightKg: 200 }),
    ];
    const result = findSwapPlan({
      fixShipments: fixs,
      // Viele swappable, sodass Vol ueberlaeuft (4 + 10 = 14 > 6).
      swappableShipments: Array.from({ length: 10 }, (_, i) =>
        mk({ id: `sw${i}`, volumeM3: 1, weightKg: 100 }),
      ),
      maxVolM3: 6,
      maxWeightKg: 10000,
    });
    expect(result).not.toBeNull();
    expect(result!.fixOverloaded).toBeFalsy();
    for (const id of ['stamm', 'overdue', 'lock', 'hazmat']) {
      expect(result!.ejectIds).not.toContain(id);
      expect(result!.keepIds).toContain(id);
    }
  });

  it('Carlos-Bsp Vol: frei knapp, neu (3 m³) vor alt (1 m³) → neu rein, alt raus', () => {
    // fix: 8 m³ Stamm. maxVol=11.5. effFix=8.
    // swappable: alt(vol=1) / neu(vol=3).
    // {alt,neu}: 8+1+3 = 12 > 11.5 ✗
    // {neu}:     8+3   = 11 ≤ 11.5 ✓ vol=11 ← MAX
    // {alt}:     8+1   = 9  ≤ 11.5 ✓ vol=9
    // → keep neu, eject alt.
    const result = findSwapPlan({
      fixShipments: [
        mk({ id: 'fix1', is_stamm_kunde: true, volumeM3: 8, weightKg: 1000 }),
      ],
      swappableShipments: [
        mk({ id: 'alt', volumeM3: 1, weightKg: 200 }),
        mk({ id: 'neu', volumeM3: 3, weightKg: 400 }),
      ],
      maxVolM3: 11.5,
      maxWeightKg: 5000,
    });
    expect(result).not.toBeNull();
    expect(result!.fixOverloaded).toBeFalsy();
    expect(result!.keepIds).toContain('fix1');
    expect(result!.keepIds).toContain('neu');
    expect(result!.ejectIds).toEqual(['alt']);
    expect(result!.volAfter).toBeCloseTo(11, 9);
    expect(result!.volBefore).toBeCloseTo(12, 9);
    expect(result!.maxVolM3).toBe(11.5);
  });

  it('Gewicht-Schranke: schwere Sendung sprengt maxWeight trotz Vol-Platz', () => {
    // fix: vol=2, weight=5000. maxVol=10 (viel Platz), maxWeight=10000.
    // swappable:
    //   alt: vol=1, weight=500
    //   neu: vol=2, weight=20000  ← Vol passt, Gewicht sprengt
    // Subsets:
    //   {alt,neu}: vol=5, w=25500 → w > 10000 ✗
    //   {neu}:    vol=4, w=25000 → ✗
    //   {alt}:    vol=3, w=5500  → ✓ vol=3
    //   {}:       vol=2, w=5000  → ✓ vol=2
    // → MAX vol feasible: {alt} (vol=3), eject neu.
    const result = findSwapPlan({
      fixShipments: [
        mk({ id: 'fix1', is_stamm_kunde: true, volumeM3: 2, weightKg: 5000 }),
      ],
      swappableShipments: [
        mk({ id: 'alt', volumeM3: 1, weightKg: 500 }),
        mk({ id: 'neu', volumeM3: 2, weightKg: 20000 }),
      ],
      maxVolM3: 10,
      maxWeightKg: 10000,
    });
    expect(result).not.toBeNull();
    expect(result!.fixOverloaded).toBeFalsy();
    expect(result!.keepIds).toContain('alt');
    expect(result!.ejectIds).toEqual(['neu']);
    expect(result!.weightAfter).toBeLessThanOrEqual(10000);
  });

  it('Tie-Break: bei gleichem Volumen MIN-Ejects', () => {
    // fix vol=7, maxVol=10, maxWeight=999999 (Weight inaktiv).
    // swappable: a(2), b(2), c(2) — alle non-stackable irrelevant.
    //   {a,b,c}: 7+6=13 > 10 ✗
    //   {a,b}:   7+4=11 > 10 ✗
    //   {a,c}:   7+4=11 > 10 ✗
    //   {a}:     7+2=9  ✓ eject 2
    //   {b}:     7+2=9  ✓ eject 2
    //   {c}:     7+2=9  ✓ eject 2
    //   {}:      7      ✓ eject 3
    // → 3 Subsets gleicher Score (9), eject je 2. Erst-gefunden
    //   bleibt (mask=001 = {a}). Eject sind dann [b, c].
    const result = findSwapPlan({
      fixShipments: [
        mk({ id: 'fix1', is_stamm_kunde: true, volumeM3: 7, weightKg: 100 }),
      ],
      swappableShipments: [
        mk({ id: 'a', volumeM3: 2 }),
        mk({ id: 'b', volumeM3: 2 }),
        mk({ id: 'c', volumeM3: 2 }),
      ],
      maxVolM3: 10,
      maxWeightKg: 999999,
    });
    expect(result).not.toBeNull();
    expect(result!.volAfter).toBeCloseTo(9, 9);
    expect(result!.ejectIds.length).toBe(2);
    expect(result!.keepIds).toContain('fix1');
  });

  it('Fixe-allein-ueberladen (Vol) → fixOverloaded=true', () => {
    const result = findSwapPlan({
      fixShipments: [
        mk({ id: 'fix1', is_stamm_kunde: true, volumeM3: 7, weightKg: 100 }),
        mk({ id: 'fix2', is_stamm_kunde: true, volumeM3: 5, weightKg: 100 }),
      ],
      swappableShipments: [
        mk({ id: 's1', volumeM3: 1, weightKg: 100 }),
        mk({ id: 's2', volumeM3: 1, weightKg: 100 }),
      ],
      maxVolM3: 10,
      maxWeightKg: 5000,
    });
    expect(result).not.toBeNull();
    expect(result!.fixOverloaded).toBe(true);
    expect(result!.keepIds).toEqual(['fix1', 'fix2']);
    expect(result!.ejectIds.sort()).toEqual(['s1', 's2']);
    expect(result!.volAfter).toBeCloseTo(12, 9);
  });

  it('Fixe-allein-ueberladen (Gewicht) → fixOverloaded=true', () => {
    const result = findSwapPlan({
      fixShipments: [
        mk({ id: 'fix1', is_stamm_kunde: true, volumeM3: 2, weightKg: 8000 }),
        mk({ id: 'fix2', is_stamm_kunde: true, volumeM3: 2, weightKg: 6000 }),
      ],
      swappableShipments: [mk({ id: 's1', volumeM3: 1, weightKg: 100 })],
      maxVolM3: 30,
      maxWeightKg: 10000,
    });
    expect(result).not.toBeNull();
    expect(result!.fixOverloaded).toBe(true);
    expect(result!.weightAfter).toBe(14000);
    expect(result!.ejectIds).toEqual(['s1']);
  });

  it('Leere Swappable + Tour leicht ueberladen → null/fixOverloaded je nach Fix-Last', () => {
    // fix vol=10, maxVol=10, maxWeight viel → vol=weight beide ≤ → null.
    expect(
      findSwapPlan({
        fixShipments: [
          mk({ id: 'f', is_stamm_kunde: true, volumeM3: 10, weightKg: 100 }),
        ],
        swappableShipments: [],
        maxVolM3: 10,
        maxWeightKg: 5000,
      }),
    ).toBeNull();
    // fix vol=11, maxVol=10 → fixOverloaded.
    const r = findSwapPlan({
      fixShipments: [
        mk({ id: 'f', is_stamm_kunde: true, volumeM3: 11, weightKg: 100 }),
      ],
      swappableShipments: [],
      maxVolM3: 10,
      maxWeightKg: 5000,
    });
    expect(r).not.toBeNull();
    expect(r!.fixOverloaded).toBe(true);
    expect(r!.ejectIds).toEqual([]);
  });
});

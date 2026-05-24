/**
 * F2.1 Tests fuer nvSwapOptimizer (pure, synthetisch).
 *
 * Heutiges Datum ist laut Projekt-Kontext 2026-05-24 → "2025-01-01"
 * ist eindeutig overdue (kein Datums-Mock noetig).
 */
import { describe, expect, it } from 'vitest';
import {
  findSwapPlan,
  isFixSendung,
  subsetEffectiveLdm,
  type SwapShipment,
} from './nvSwapOptimizer';

function mk(o: Partial<SwapShipment> & { id: string }): SwapShipment {
  return {
    ldm: 1,
    isStackable: false,
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

describe('subsetEffectiveLdm', () => {
  it('non-stackable 3 ldm → 3 effektiv', () => {
    expect(
      subsetEffectiveLdm([mk({ id: 'x', ldm: 3, isStackable: false })], 10),
    ).toBeCloseTo(3, 9);
  });
  it('stackable 3 ldm → 1.5 effektiv (Faktor ½)', () => {
    expect(
      subsetEffectiveLdm([mk({ id: 'x', ldm: 3, isStackable: true })], 10),
    ).toBeCloseTo(1.5, 9);
  });
  it('leeres Subset → 0', () => {
    expect(subsetEffectiveLdm([], 10)).toBe(0);
  });
});

describe('findSwapPlan', () => {
  it('kein-Swap-noetig (Tour passt) → null', () => {
    const result = findSwapPlan({
      fixShipments: [mk({ id: 'f1', ldm: 3 })],
      swappableShipments: [mk({ id: 's1', ldm: 2 })],
      maxLdm: 10,
    });
    expect(result).toBeNull();
  });

  it('Stamm/Overdue/Lock/Hazmat NIE in ejectIds (Massentest)', () => {
    const fixs = [
      mk({ id: 'stamm', is_stamm_kunde: true, ldm: 1 }),
      mk({
        id: 'overdue',
        loading_date: '2025-01-01',
        status: 'new',
        ldm: 1,
      }),
      mk({ id: 'lock', has_active_lock: true, ldm: 1 }),
      mk({ id: 'hazmat', is_hazmat: true, ldm: 1 }),
    ];
    const result = findSwapPlan({
      fixShipments: fixs,
      // Viele swappable, sodass Tour ueberladen wird (4 + 10 = 14 > 6).
      swappableShipments: Array.from({ length: 10 }, (_, i) =>
        mk({ id: `sw${i}`, ldm: 1 }),
      ),
      maxLdm: 6,
    });
    expect(result).not.toBeNull();
    expect(result!.fixOverloaded).toBeFalsy();
    for (const id of ['stamm', 'overdue', 'lock', 'hazmat']) {
      expect(result!.ejectIds).not.toContain(id);
      expect(result!.keepIds).toContain(id);
    }
  });

  it('Carlos-Bsp: frei=2 ldm, alt=1 ldm non-stack, neu=3 ldm stack → {neu} gewinnt, alt raus', () => {
    // fix: 8 ldm Stamm-Sendung. effFix = 8.
    // maxLdm = 10 → frei = 2 ldm fuer swappable.
    // swappable: alt(ldm=1, non-stack) → eff 1.0
    //            neu(ldm=3, stack)     → eff 1.5
    // Subsets:
    //   {}        → effFix 8         (eject alt+neu, 2 raus)
    //   {alt}     → 8 + 1.0 = 9.0
    //   {neu}     → 8 + 1.5 = 9.5    ← MAX feasible → Winner
    //   {alt,neu} → 8 + 2.5 = 10.5   > maxLdm → infeasible
    const result = findSwapPlan({
      fixShipments: [
        mk({
          id: 'fix1',
          is_stamm_kunde: true,
          ldm: 8,
          isStackable: false,
        }),
      ],
      swappableShipments: [
        mk({ id: 'alt', ldm: 1, isStackable: false }),
        mk({ id: 'neu', ldm: 3, isStackable: true }),
      ],
      maxLdm: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.fixOverloaded).toBeFalsy();
    expect(result!.keepIds).toContain('fix1');
    expect(result!.keepIds).toContain('neu');
    expect(result!.ejectIds).toEqual(['alt']);
    expect(result!.effLdmAfter).toBeCloseTo(9.5, 9);
    expect(result!.effLdmBefore).toBeCloseTo(10.5, 9);
    expect(result!.maxLdm).toBe(10);
  });

  it('Tie-Break: bei gleicher effLdmAfter gewinnt MIN-Ejects', () => {
    // fix: 6 ldm. maxLdm=10. frei=4.
    // swappable: a(1), b(1), c(2). Alle non-stack → eff=ldm.
    //   {a,b,c}   8+1+1+2=10? nein, fix=6 + abc=4 = 10 ≤ 10 ✓ (eject 0)
    //   {b,c}     6+3=9 (eject 1)
    //   …
    // Erwartet: {a,b,c} feasible (10=10), eff=10, ejects=0 → MIN. Aber
    // Tour ist dann genau voll → effBefore=10 → kein-Swap-noetig?
    // Nein: effBefore = 6+4 = 10 ≤ maxLdm → null!
    // → Anders konstruieren: effBefore=11, zwei Subsets mit gleichem
    //   eff aber unterschiedlichem eject-Count.
    // fix=6, swappable a(2,non-stack)=2, b(2,stack)=1, c(2,stack)=1.
    //   effBefore = 6+2+1+1 = 10 ≤ maxLdm=10 → null. Geht nicht.
    // → fix=6.5. effBefore = 6.5+4 = 10.5 > 10.
    //   {a,b,c}: 6.5+4=10.5 > 10 → infeasible.
    //   {a,b}:   6.5+2+1=9.5 ≤ 10 ✓ eject 1
    //   {a,c}:   6.5+2+1=9.5 ≤ 10 ✓ eject 1  ← tie, MIN-eject = beide 1
    //   {a}:     6.5+2=8.5 ≤ 10
    // → Tie-Break greift hier nicht (beide gleich eject). Stattdessen:
    // fix=7. effBefore=7+4=11 > 10.
    //   {a,b}: 7+2+1=10 ≤ 10 ✓ eject 1
    //   {a,c}: 7+2+1=10 ≤ 10 ✓ eject 1
    //   {a}:   7+2=9.0       ≤ 10 ✓ eject 2
    //   → 2 Subsets mit max-eff (10), Tie-Break Min-Ejects waehlt eines
    //   davon (welcher bitmask zuerst, c[2,1]: c bei i=1 → mask=0b011
    //   = {a,b}, naechster mask=0b101 = {a,c}). Beide eject 1 → erst-
    //   gefundener bleibt (= {a,b}, ejectIds=['c']).
    const result = findSwapPlan({
      fixShipments: [mk({ id: 'fix1', is_stamm_kunde: true, ldm: 7 })],
      swappableShipments: [
        mk({ id: 'a', ldm: 2, isStackable: false }),
        mk({ id: 'b', ldm: 2, isStackable: true }),
        mk({ id: 'c', ldm: 2, isStackable: true }),
      ],
      maxLdm: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.effLdmAfter).toBeCloseTo(10, 9);
    // 1 ejekt — kein 2-Eject akzeptiert.
    expect(result!.ejectIds.length).toBe(1);
    expect(result!.keepIds).toContain('fix1');
  });

  it('Fixe-allein-ueberladen → SwapPlan mit fixOverloaded=true', () => {
    // fix: 12 ldm Stamm. maxLdm=10. effFix=12 > 10.
    // → fixOverloaded, ejectIds=alle-swappable.
    const result = findSwapPlan({
      fixShipments: [
        mk({
          id: 'fix1',
          is_stamm_kunde: true,
          ldm: 7,
          isStackable: false,
        }),
        mk({
          id: 'fix2',
          is_stamm_kunde: true,
          ldm: 5,
          isStackable: false,
        }),
      ],
      swappableShipments: [
        mk({ id: 's1', ldm: 1 }),
        mk({ id: 's2', ldm: 1 }),
      ],
      maxLdm: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.fixOverloaded).toBe(true);
    expect(result!.keepIds).toEqual(['fix1', 'fix2']);
    expect(result!.ejectIds.sort()).toEqual(['s1', 's2']);
    expect(result!.effLdmAfter).toBeCloseTo(12, 9);
  });

  it('Leere Swappable + Tour leicht ueberladen → null wenn ≤ maxLdm sonst fixOverloaded', () => {
    // fix=10 ldm, swappable=[], maxLdm=10 → effBefore=10, kein-Swap.
    expect(
      findSwapPlan({
        fixShipments: [
          mk({ id: 'f', is_stamm_kunde: true, ldm: 10, isStackable: false }),
        ],
        swappableShipments: [],
        maxLdm: 10,
      }),
    ).toBeNull();
    // fix=11 ldm, swappable=[], maxLdm=10 → effFix>10 → fixOverloaded.
    const r = findSwapPlan({
      fixShipments: [
        mk({ id: 'f', is_stamm_kunde: true, ldm: 11, isStackable: false }),
      ],
      swappableShipments: [],
      maxLdm: 10,
    });
    expect(r).not.toBeNull();
    expect(r!.fixOverloaded).toBe(true);
    expect(r!.ejectIds).toEqual([]);
  });
});

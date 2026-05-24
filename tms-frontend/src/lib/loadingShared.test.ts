/**
 * BUG-F-PACK: placePackages-Verhalten bei Overflow + Mischpaletten-Stack.
 *
 * Diese Tests stellen sicher:
 *   1. Pakete, die physisch nicht in den Trailer passen, werden mit
 *      `unplaced: true` zurueckgegeben (statt sich alle am hinteren
 *      Eck zu durchstossen).
 *   2. Mischpaletten-Stack: kleineres + leichteres Paket darf auf
 *      groesserer + schwererer stapelbarer Basis sitzen (Footprint
 *      muss ≤ Basis sein, Gewicht ≤ Basis-Gewicht, Basis stapelbar).
 */
import { describe, it, expect } from 'vitest';
import { placePackages, type SharedPackage } from './loadingShared';

function mkPkg(opts: Partial<SharedPackage & { id: string }>): SharedPackage & {
  id: string;
} {
  return {
    id: opts.id ?? 'pkg',
    lengthCm: opts.lengthCm ?? 120,
    widthCm: opts.widthCm ?? 80,
    heightCm: opts.heightCm ?? 100,
    weightKg: opts.weightKg ?? 100,
    isStackable: opts.isStackable ?? true,
    storedPosX: opts.storedPosX ?? null,
    storedPosY: opts.storedPosY ?? null,
    storedPosZ: opts.storedPosZ ?? null,
  };
}

describe('placePackages — BUG-F-PACK Overflow → unplaced', () => {
  it('alle Pakete passen → niemand ist unplaced', () => {
    const out = placePackages(
      [mkPkg({ id: 'a' }), mkPkg({ id: 'b' })],
      1360,
      240,
      270,
    );
    expect(out).toHaveLength(2);
    expect(out.filter((p) => p.unplaced)).toHaveLength(0);
  });

  it('Trailer zu klein → Excess-Pakete sind unplaced statt am hinteren Eck', () => {
    // 4 nicht-stapelbare Paletten je 120×240 in Trailer 200×240 — passt nur
    // 1 nebeneinander (widthCm=240), Reihen 4× 120 cm Laenge = 480 cm.
    // Trailer-Laenge 200 cm → 1 Reihe (120) passt; 2./3./4. Reihe overflowen.
    const pkgs = [
      mkPkg({ id: 'a', isStackable: false, lengthCm: 120, widthCm: 240 }),
      mkPkg({ id: 'b', isStackable: false, lengthCm: 120, widthCm: 240 }),
      mkPkg({ id: 'c', isStackable: false, lengthCm: 120, widthCm: 240 }),
      mkPkg({ id: 'd', isStackable: false, lengthCm: 120, widthCm: 240 }),
    ];
    const out = placePackages(pkgs, 200, 240, 270);
    expect(out).toHaveLength(4);
    const placed = out.filter((p) => !p.unplaced);
    const unplaced = out.filter((p) => p.unplaced);
    expect(placed.length).toBeGreaterThanOrEqual(1);
    expect(unplaced.length).toBeGreaterThanOrEqual(1);
    // Erst-platziertes Paket sitzt korrekt bei posX=0, posY=0 (kein Eck-Push).
    expect(placed[0].posX).toBe(0);
    expect(placed[0].posY).toBe(0);
  });

  it('unplaced-Paket hat keine Eck-Position-Durchdringung', () => {
    // Klassischer BUG-F-PACK-Fall: 3 Paletten passen je 120×240 in 360×240
    // Trailer — die 4. sollte unplaced sein, NICHT bei (0, 240) (=
    // Eck-Punkt der alten Logik).
    const pkgs = [
      mkPkg({ id: 'a', isStackable: false, lengthCm: 120, widthCm: 240 }),
      mkPkg({ id: 'b', isStackable: false, lengthCm: 120, widthCm: 240 }),
      mkPkg({ id: 'c', isStackable: false, lengthCm: 120, widthCm: 240 }),
      mkPkg({ id: 'd', isStackable: false, lengthCm: 120, widthCm: 240 }),
    ];
    const out = placePackages(pkgs, 360, 240, 270);
    const last = out.find((p) => p.id === 'd');
    expect(last).toBeDefined();
    expect(last!.unplaced).toBe(true);
  });
});

describe('placePackages — BUG-F-PACK Mischpaletten-Stack', () => {
  it('kleineres + leichteres Paket darf auf groessere stapelbare Basis', () => {
    // Boden: 120×80, stapelbar, 500 kg.
    // Top:    80×60, stapelbar, 100 kg (kleiner + leichter → muss draufgehen).
    const out = placePackages(
      [
        mkPkg({
          id: 'base',
          lengthCm: 120,
          widthCm: 80,
          heightCm: 100,
          weightKg: 500,
          isStackable: true,
        }),
        mkPkg({
          id: 'top',
          lengthCm: 80,
          widthCm: 60,
          heightCm: 100,
          weightKg: 100,
          isStackable: true,
        }),
      ],
      1360,
      240,
      270,
    );
    const base = out.find((p) => p.id === 'base');
    const top = out.find((p) => p.id === 'top');
    expect(base?.posZ).toBe(0);
    // Top muss gestapelt sein (posZ > 0) — Mischpaletten-Erweiterung.
    expect(top?.posZ).toBeGreaterThan(0);
  });

  it('groesseres Top auf kleinere Basis → KEIN Stack (Ueberhang)', () => {
    // Boden: 60×60, Top: 100×100 — Top haengt ueber, daher kein Stack-Slot.
    const out = placePackages(
      [
        mkPkg({
          id: 'base',
          lengthCm: 60,
          widthCm: 60,
          heightCm: 100,
          weightKg: 50,
          isStackable: true,
        }),
        mkPkg({
          id: 'top',
          lengthCm: 100,
          widthCm: 100,
          heightCm: 100,
          weightKg: 200,
          isStackable: true,
        }),
      ],
      1360,
      240,
      270,
    );
    const top = out.find((p) => p.id === 'top');
    // Top landet auf Boden (posZ=0), neben der Basis.
    expect(top?.posZ).toBe(0);
  });

  it('schwereres Top → KEIN Stack (schwer-unten-leicht-oben)', () => {
    const out = placePackages(
      [
        mkPkg({
          id: 'base',
          lengthCm: 120,
          widthCm: 80,
          heightCm: 100,
          weightKg: 100,
          isStackable: true,
        }),
        mkPkg({
          id: 'top',
          lengthCm: 80,
          widthCm: 60,
          heightCm: 100,
          weightKg: 500, // schwerer als Basis
          isStackable: true,
        }),
      ],
      1360,
      240,
      270,
    );
    const top = out.find((p) => p.id === 'top');
    expect(top?.posZ).toBe(0);
  });

  it('nicht-stapelbare Basis → KEIN Stack (Carlos-Regel)', () => {
    const out = placePackages(
      [
        mkPkg({
          id: 'base',
          lengthCm: 120,
          widthCm: 80,
          heightCm: 100,
          weightKg: 500,
          isStackable: false, // nicht stapelbar
        }),
        mkPkg({
          id: 'top',
          lengthCm: 80,
          widthCm: 60,
          heightCm: 100,
          weightKg: 100,
          isStackable: true,
        }),
      ],
      1360,
      240,
      270,
    );
    const top = out.find((p) => p.id === 'top');
    expect(top?.posZ).toBe(0);
  });
});

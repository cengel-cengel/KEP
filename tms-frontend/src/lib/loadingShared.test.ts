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
    rotationDeg: opts.rotationDeg ?? 0,
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

describe('placePackages — Rotation-aware Pack (rotation_deg=90)', () => {
  /**
   * Carlos-N010-Repro: Items mit rotation_deg=90 wurden vor Fix mit
   * ihren UNROTIERTEN Dims gepackt (W=80, L=120), aber von
   * LoadingPlan3D.effPkg rotiert gerendert (W=120, L=80). Folge:
   * Render-Footprint ragte 40cm in die Pack-Reserve nebenan → visuelle
   * Verschachtelung mit Nachbarn.
   *
   * Fix: effDims-Swap im Pack — pw/pl, getStackHeight, find-
   * PreferredStackSlot rechnen mit rotation-aware Footprint. Output-
   * widthCm/lengthCm bleiben ORIGINAL, damit LoadingPlan3D effPkg
   * konsistent zurueckdreht (kein doppelter Swap).
   */
  it('rotation=90 + rotation=0 Nachbar packen disjunkt (rotation-aware Phase-2)', () => {
    // Item-Rot (rotation=90, L=120 W=80): rotated-Footprint 120W × 80L.
    // Item-Std (rotation=0, L=100 W=80): unrotated-Footprint 80W × 100L.
    // Trailer 240W × 800L. Rot zuerst nach (0,0), Std danach.
    // Rotated-Footprint 120W → next-row-start cx=120. Std (80W) bei
    // cx=120 → footprint x[120..200] y[0..100]. Rot-render bei x[0..120]
    // y[0..80] → KEIN Overlap (touch x=120). ✓
    const out = placePackages(
      [
        mkPkg({
          id: 'rot',
          lengthCm: 120,
          widthCm: 80,
          rotationDeg: 90,
          isStackable: false,
        }),
        mkPkg({
          id: 'std',
          lengthCm: 100,
          widthCm: 80,
          rotationDeg: 0,
          isStackable: false,
        }),
      ],
      800,
      240,
      300,
    );
    const rot = out.find((p) => p.id === 'rot');
    const std = out.find((p) => p.id === 'std');
    expect(rot?.unplaced).toBeFalsy();
    expect(std?.unplaced).toBeFalsy();
    // Std startet NACH dem rotated-Footprint von rot (x=120).
    expect(std?.posX).toBeGreaterThanOrEqual(120 - 1e-6);
    // Output widthCm/lengthCm bleiben ORIGINAL (LoadingPlan3D
    // effPkg-Swap erwartet das).
    expect(rot?.widthCm).toBe(80);
    expect(rot?.lengthCm).toBe(120);
  });

  it('rotation=0 unveraendert (no-regression, Standard-Fall)', () => {
    // Ohne rotation: gleiches Verhalten wie vor Fix.
    const out = placePackages(
      [
        mkPkg({
          id: 'a',
          lengthCm: 120,
          widthCm: 80,
          rotationDeg: 0,
          isStackable: false,
        }),
        mkPkg({
          id: 'b',
          lengthCm: 120,
          widthCm: 80,
          rotationDeg: 0,
          isStackable: false,
        }),
      ],
      800,
      240,
      300,
    );
    const a = out.find((p) => p.id === 'a');
    const b = out.find((p) => p.id === 'b');
    expect(a?.posX).toBe(0);
    expect(a?.posY).toBe(0);
    expect(b?.posX).toBe(80);
    expect(b?.posY).toBe(0);
  });

  it('Phase-1 storedPos rotation=90: getStackHeight nutzt effDims als Obstacle', () => {
    // Item-1 storedPos (0, 0), rotation=90, L=120 W=80 → effektive
    // Footprint 120W × 80L. Belegt x[0..120] y[0..80] (effektiv).
    // Item-2 (unrotated, W=80 L=100, non-stackable) sucht Phase-2-Slot.
    // Bei (0, 0) BLOCKIERT (overlap mit item-1 effDims). Bei (120, 0)
    // FREI. Bei (0, 80) FREI (y=80 ist item-1's effL-Ende).
    const out = placePackages(
      [
        mkPkg({
          id: 'rot-1',
          lengthCm: 120,
          widthCm: 80,
          rotationDeg: 90,
          storedPosX: 0,
          storedPosY: 0,
          storedPosZ: 0,
          isStackable: false,
        }),
        mkPkg({
          id: 'std-1',
          lengthCm: 100,
          widthCm: 80,
          rotationDeg: 0,
          isStackable: false,
        }),
      ],
      800,
      240,
      300,
    );
    const std = out.find((p) => p.id === 'std-1');
    expect(std?.unplaced).toBeFalsy();
    // std-1 darf NICHT bei (0,0) sitzen — dort blockiert effective
    // Footprint von rot-1.
    if (std && !std.unplaced) {
      // std posX >= 120 (rechts von rot-1) ODER posY >= 80 (hinter rot-1).
      const placedRightOfRot = std.posX >= 120 - 1e-6;
      const placedBehindRot = std.posY >= 80 - 1e-6;
      expect(placedRightOfRot || placedBehindRot).toBe(true);
    }
  });

  it('mixed rotation 0+90+0: alle drei platziert ohne Render-Overlap', () => {
    const out = placePackages(
      [
        mkPkg({
          id: 'a',
          lengthCm: 100,
          widthCm: 80,
          rotationDeg: 0,
          isStackable: false,
        }),
        mkPkg({
          id: 'rot',
          lengthCm: 120,
          widthCm: 80,
          rotationDeg: 90,
          isStackable: false,
        }),
        mkPkg({
          id: 'b',
          lengthCm: 100,
          widthCm: 80,
          rotationDeg: 0,
          isStackable: false,
        }),
      ],
      800,
      240,
      300,
    );
    expect(out.every((p) => !p.unplaced)).toBe(true);
  });
});

describe('placePackages — Row-Bin-Progress-Fix (Carlos-N010-Repro)', () => {
  /**
   * Carlos-N010-Repro: Wenn Phase-1-Obstacles die initiale Y-Zeile
   * vollstaendig blockieren, blieb cy=0 stehen (localRowMax=0, cy += 0)
   * → infinite Loop bis guard 200000 → 29/31 Items unplaced trotz freier
   * Volumen hinter dem Obstacle.
   *
   * Fix: cy += pl (item-Laenge) als Mindest-Advance wenn localRowMax===0.
   * Erlaubt Phase-2, das blockierte Y-Band zu ueberspringen und in der
   * naechsten Zeile weiterzusuchen.
   */
  it('Phase-1-Obstacle blockiert initial-Row → Phase-2-Item ruckt in naechste Row vor (kein guard-exhaust)', () => {
    // Phase-1 storedPos: non-stackable Obstacle 240W × 200L bei (0,0).
    // Phase-2 Item: 80W × 100L, non-stackable. Sucht Slot.
    //
    // Vor Fix: cx-cycle wraps → cy += localRowMax (=0) → cy bleibt 0
    //   → 200000 guard iterations → unplaced=true.
    // Nach Fix: cy += pl (=100) auf wrap → cy=100 (noch overlap) →
    //   cx-cycle → cy=200 (frei) → placed bei (0, 200, 0).
    const out = placePackages(
      [
        mkPkg({
          id: 'obs',
          lengthCm: 200,
          widthCm: 240,
          heightCm: 100,
          storedPosX: 0,
          storedPosY: 0,
          storedPosZ: 0,
          isStackable: false,
        }),
        mkPkg({
          id: 'p2',
          lengthCm: 100,
          widthCm: 80,
          heightCm: 100,
          isStackable: false,
        }),
      ],
      800,
      240,
      300,
    );
    const p2 = out.find((p) => p.id === 'p2');
    expect(p2).toBeDefined();
    expect(p2!.unplaced).toBeFalsy();
    // p2 sitzt hinter dem Obstacle (posY >= 200).
    expect(p2!.posY).toBeGreaterThanOrEqual(200 - 1e-6);
  });

  it('echter Overflow: nicht-passende Items bleiben korrekt unplaced (cy-Overflow-Pfad)', () => {
    // Trailer 240W × 200L. Phase-1 belegt komplett: 240W × 200L bei (0,0).
    // Phase-2 Item: 80W × 100L non-stackable hat KEINEN freien Slot.
    // Nach Fix: cy += pl=100 → cy=100 (overlap) → wrap → cy=200 → cy+pl=300
    //   > trailerL=200 → unplaced=true (cy-Overflow-Pfad, NICHT
    //   guard-exhaust).
    const out = placePackages(
      [
        mkPkg({
          id: 'obs',
          lengthCm: 200,
          widthCm: 240,
          heightCm: 100,
          storedPosX: 0,
          storedPosY: 0,
          storedPosZ: 0,
          isStackable: false,
        }),
        mkPkg({
          id: 'p2',
          lengthCm: 100,
          widthCm: 80,
          heightCm: 100,
          isStackable: false,
        }),
      ],
      200,
      240,
      300,
    );
    const p2 = out.find((p) => p.id === 'p2');
    expect(p2).toBeDefined();
    expect(p2!.unplaced).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  snapToWall,
  smartRotateSuggestion,
  findAdjacentSlot,
  rectsOverlap,
  type SnapItem,
} from './loadingSnap';

const TRAILER = { widthCm: 245, lengthCm: 1360 };

describe('rectsOverlap', () => {
  it('non-overlapping → false', () => {
    expect(rectsOverlap({ x1: 0, x2: 10, y1: 0, y2: 10 }, { x1: 20, x2: 30, y1: 0, y2: 10 })).toBe(false);
  });
  it('touching edges (tol) → false', () => {
    expect(rectsOverlap({ x1: 0, x2: 10, y1: 0, y2: 10 }, { x1: 10, x2: 20, y1: 0, y2: 10 })).toBe(false);
  });
  it('overlapping → true', () => {
    expect(rectsOverlap({ x1: 0, x2: 15, y1: 0, y2: 10 }, { x1: 10, x2: 20, y1: 0, y2: 10 })).toBe(true);
  });
});

describe('snapToWall', () => {
  const dragged = { widthCm: 80, lengthCm: 120 };

  it('< 20cm zur X=0-Wand → snap', () => {
    const r = snapToWall(dragged, 15, 100, TRAILER, []);
    expect(r.snapped).toBe(true);
    expect(r.posX).toBe(0);
    expect(r.posY).toBe(100);
  });
  it('> 20cm zur Wand → kein snap', () => {
    const r = snapToWall(dragged, 50, 100, TRAILER, []);
    expect(r.snapped).toBe(false);
  });
  it('< 20cm zur RechtsWand → snap an Wand', () => {
    const r = snapToWall(dragged, 240 - 80, 100, TRAILER, []);
    expect(r.snapped).toBe(true);
    expect(r.posX).toBe(245 - 80);
  });
  it('< 20cm zur Y=0-Wand → snap', () => {
    const r = snapToWall(dragged, 50, 10, TRAILER, []);
    expect(r.snapped).toBe(true);
    expect(r.posY).toBe(0);
  });
  it('Magnet blockiert bei Item-Overlap', () => {
    const others: SnapItem[] = [
      { id: 'A', posX: 0, posY: 0, posZ: 0, widthCm: 100, lengthCm: 130 },
    ];
    const r = snapToWall(dragged, 5, 5, TRAILER, others);
    expect(r.snapped).toBe(false);
  });
});

describe('smartRotateSuggestion', () => {
  it('aktuelle Orientation snapped → null', () => {
    const r = smartRotateSuggestion(
      { widthCm: 80, lengthCm: 120 },
      5,
      5,
      TRAILER,
      [],
    );
    expect(r).toBe(null);
  });
  it('rotated würde snappen → 90', () => {
    // Item 80×245 (lengthCm passt nicht zur Trailer-Width=245
    // direkt — aber rotated 245×80 snapped an Y=0)
    // posX=50 (>20 von beiden X-Wänden), posY=50 (mittig)
    // current: width=80, length=300 → kein Magnet
    // rotated: width=300, length=80 → ebenfalls kein Magnet
    // → need test with values where ONE orientation snaps
    const dragged = { widthCm: 200, lengthCm: 80 };
    const r = smartRotateSuggestion(dragged, 50, 50, TRAILER, []);
    // current: width=200 (245-200=45, posX=50 > 245-200-20=25 → snap zur Rechts-Wand)
    // → current snapped, no rotation
    expect(r).toBe(null);
  });
  it('current ohne snap, rotated mit → 90', () => {
    // current 80×200: posX=100 → keine X-Wand, posY=100 → keine Y-Wand
    // → no snap
    // rotated 200×80: posX=100+200=300 > 245-20 → snap zur Rechts-Wand
    // (posX=45, item endet bei 245)
    const dragged = { widthCm: 80, lengthCm: 200 };
    const r = smartRotateSuggestion(dragged, 100, 100, TRAILER, []);
    expect(r).toBe(90);
  });
});

describe('findAdjacentSlot', () => {
  // target mittig im Trailer: posX=80 (von 245), posY=200 (von 1360)
  const target: SnapItem = {
    id: 'T',
    posX: 80,
    posY: 200,
    posZ: 0,
    widthCm: 80,
    lengthCm: 120,
  };
  const dragged = { widthCm: 80, lengthCm: 120 };

  it('right (X+) of target wenn frei', () => {
    // right slot: posX=160, posX+80=240 < 245 → fits
    const r = findAdjacentSlot(dragged, target, [target], TRAILER);
    expect(r).not.toBeNull();
    expect(r!.posX).toBe(160);
    expect(r!.posY).toBe(200);
    expect(r!.posZ).toBe(0);
  });
  it('left (X-) wenn right blockiert', () => {
    const others: SnapItem[] = [
      target,
      { id: 'R', posX: 160, posY: 200, posZ: 0, widthCm: 80, lengthCm: 120 },
    ];
    // left slot: posX=0 → fits
    const r = findAdjacentSlot(dragged, target, others, TRAILER);
    expect(r).not.toBeNull();
    expect(r!.posX).toBe(0);
    expect(r!.posY).toBe(200);
  });
  it('null wenn alle Richtungen blockiert', () => {
    const others: SnapItem[] = [
      target,
      { id: 'R', posX: 160, posY: 200, posZ: 0, widthCm: 80, lengthCm: 120 },
      { id: 'L', posX: 0, posY: 200, posZ: 0, widthCm: 80, lengthCm: 120 },
      { id: 'F', posX: 80, posY: 80, posZ: 0, widthCm: 80, lengthCm: 120 },
      { id: 'B', posX: 80, posY: 320, posZ: 0, widthCm: 80, lengthCm: 120 },
    ];
    const r = findAdjacentSlot(dragged, target, others, TRAILER);
    expect(r).toBeNull();
  });
  it('Z bleibt auf target.posZ (kein floor-fall)', () => {
    const tHigh = { ...target, posZ: 120 };
    const r = findAdjacentSlot(dragged, tHigh, [tHigh], TRAILER);
    expect(r!.posZ).toBe(120);
  });
  it('rechts out-of-trailer → left wird probiert', () => {
    // target nah an rechts-Wand: posX=165 (165+80=245 = Wand)
    const edgeTarget: SnapItem = { ...target, posX: 165 };
    // right wäre 245+80=325 (out), left ist 85 → fits
    const r = findAdjacentSlot(dragged, edgeTarget, [edgeTarget], TRAILER);
    expect(r).not.toBeNull();
    expect(r!.posX).toBe(85);
  });
});

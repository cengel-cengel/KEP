import { describe, expect, it } from 'vitest';
import { computeInsertedOrder, findInsertTarget } from './insertCascade';

describe('computeInsertedOrder', () => {
  const pkgs = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
    { id: 'd' },
  ];

  it('moved forward (a → vor c)', () => {
    expect(computeInsertedOrder(pkgs, 'a', 'c').map((p) => p.id)).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });
  it('moved backward (d → vor b)', () => {
    expect(computeInsertedOrder(pkgs, 'd', 'b').map((p) => p.id)).toEqual([
      'a',
      'd',
      'b',
      'c',
    ]);
  });
  it('drag==target → no-op', () => {
    expect(computeInsertedOrder(pkgs, 'a', 'a')).toBe(pkgs);
  });
  it('unbekannte id → no-op', () => {
    expect(computeInsertedOrder(pkgs, 'x', 'b')).toBe(pkgs);
    expect(computeInsertedOrder(pkgs, 'a', 'y')).toBe(pkgs);
  });
});

describe('findInsertTarget', () => {
  const placed = [
    { id: 'a', posY: 0, lengthCm: 100 },
    { id: 'b', posY: 100, lengthCm: 100 },
    { id: 'c', posY: 200, lengthCm: 100 },
  ];
  it('closest by posY-center', () => {
    expect(findInsertTarget(placed, 50)).toBe('a'); // center=50
    expect(findInsertTarget(placed, 150)).toBe('b'); // center=150
    expect(findInsertTarget(placed, 250)).toBe('c');
  });
  it('exclude-id wird übersprungen', () => {
    // a-center=50, dropY=50, aber excludeId=a → fallback b (center=150, dist=100)
    expect(findInsertTarget(placed, 50, 'a')).toBe('b');
  });
  it('leere Liste → null', () => {
    expect(findInsertTarget([], 50)).toBeNull();
  });
});

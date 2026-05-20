import { describe, expect, it } from 'vitest';
import { planNvInsertShift } from './nvRepack';

const pkg = (
  id: string,
  posY: number,
  lengthCm = 100,
  posX = 0,
  widthCm = 80,
  posZ = 0,
) => ({ id, posX, posY, posZ, lengthCm, widthCm });

describe('planNvInsertShift', () => {
  it('verschiebt downstream + plaziert dragged an target.posY', () => {
    const packages = [
      pkg('a', 0),
      pkg('b', 105),
      pkg('c', 210),
    ];
    const out = planNvInsertShift({
      packages,
      draggedId: 'c',
      targetId: 'b',
      trailerLengthCm: 1360,
      trailerWidthCm: 245,
    });
    // c shifted target = b → dragged-Action ist letzte Aktion
    const draggedAction = out.find((a) => a.itemId === 'c');
    expect(draggedAction).toBeDefined();
    expect(draggedAction!.posYCm).toBe(105); // target.posY
    // b wird shifted um c.lengthCm+5 = 105
    const bAction = out.find((a) => a.itemId === 'b');
    expect(bAction).toBeDefined();
    expect(bAction!.posYCm).toBe(210);
  });

  it('Items vor target werden NICHT verschoben', () => {
    const packages = [pkg('a', 0), pkg('b', 105), pkg('c', 210)];
    const out = planNvInsertShift({
      packages,
      draggedId: 'c',
      targetId: 'b',
      trailerLengthCm: 1360,
      trailerWidthCm: 245,
    });
    expect(out.find((a) => a.itemId === 'a')).toBeUndefined();
  });

  it('Trailer-overflow → wrap zu next row', () => {
    const packages = [
      pkg('a', 0),
      pkg('b', 1200, 150), // ans Ende, lengthCm=150 → 1350 fast voll
    ];
    const out = planNvInsertShift({
      packages,
      draggedId: 'a',
      targetId: 'b',
      trailerLengthCm: 1360,
      trailerWidthCm: 245,
    });
    // b shifted = 1200 + (a.length=100 + 5) = 1305, +150=1455 > 1360
    //   → wrap zu posY=0, cursorX += 80+5 = 85
    const bAction = out.find((a) => a.itemId === 'b');
    expect(bAction).toBeDefined();
    expect(bAction!.posYCm).toBe(0);
    expect(bAction!.posXCm).toBeGreaterThan(0);
  });

  it('Empty / unbekannte ids → leeres Result', () => {
    expect(
      planNvInsertShift({
        packages: [],
        draggedId: 'x',
        targetId: 'y',
        trailerLengthCm: 1360,
        trailerWidthCm: 245,
      }),
    ).toEqual([]);
    expect(
      planNvInsertShift({
        packages: [pkg('a', 0)],
        draggedId: 'a',
        targetId: 'unknown',
        trailerLengthCm: 1360,
        trailerWidthCm: 245,
      }),
    ).toEqual([]);
  });
});

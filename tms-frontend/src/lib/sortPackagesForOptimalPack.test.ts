/**
 * B-1 SCHRITT 4: Tests für sortPackagesForOptimalPack.
 * F1.b: Helper jetzt in lib/loadingShared.ts (vorher pages/LoadingPlanPage).
 */
import { describe, it, expect } from 'vitest';
import { sortPackagesForOptimalPack } from './loadingShared';

interface TestPkg {
  id: string;
  shipmentId: string;
  shipmentNumber: string;
  packageIndex: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  isStackable: boolean;
  color: string;
  stopOrder: number;
}

function mkPkg(opts: Partial<TestPkg>): TestPkg {
  return {
    id: opts.id ?? 'pkg',
    shipmentId: 'sh',
    shipmentNumber: 'SH-1',
    packageIndex: 1,
    lengthCm: 80,
    widthCm: 120,
    heightCm: 100,
    weightKg: 100,
    isStackable: true,
    color: '#000',
    stopOrder: 1,
    ...opts,
  };
}

describe('sortPackagesForOptimalPack (Carlos-Stack-Rule)', () => {
  it('non-stackable wird vor stackable einsortiert', () => {
    const result = sortPackagesForOptimalPack([
      mkPkg({ id: 'a', isStackable: true }),
      mkPkg({ id: 'b', isStackable: false }),
      mkPkg({ id: 'c', isStackable: true }),
    ]);
    // non-stackable first
    expect(result[0].id).toBe('b');
    expect(result[0].isStackable).toBe(false);
  });

  it('innerhalb gleicher Stapelbarkeit: schwer-zuerst', () => {
    const result = sortPackagesForOptimalPack([
      mkPkg({ id: 'leicht', weightKg: 50, isStackable: true }),
      mkPkg({ id: 'schwer', weightKg: 500, isStackable: true }),
      mkPkg({ id: 'medium', weightKg: 200, isStackable: true }),
    ]);
    expect(result.map((p) => p.id)).toEqual(['schwer', 'medium', 'leicht']);
  });

  it('bei gleichem Gewicht: groß-zuerst', () => {
    const result = sortPackagesForOptimalPack([
      mkPkg({
        id: 'klein',
        lengthCm: 40,
        widthCm: 40,
        heightCm: 40,
        weightKg: 100,
      }),
      mkPkg({
        id: 'groß',
        lengthCm: 120,
        widthCm: 100,
        heightCm: 100,
        weightKg: 100,
      }),
    ]);
    expect(result[0].id).toBe('groß');
  });

  it('non-stackable überschattet weight-Sort', () => {
    // Schwere stackable kommt NACH leichte non-stackable.
    const result = sortPackagesForOptimalPack([
      mkPkg({ id: 'schwerStack', weightKg: 1000, isStackable: true }),
      mkPkg({ id: 'leichtNoStack', weightKg: 50, isStackable: false }),
    ]);
    expect(result[0].id).toBe('leichtNoStack');
    expect(result[1].id).toBe('schwerStack');
  });

  it('stabile Sortierung bei identischen Keys', () => {
    const arr = [
      mkPkg({ id: 'A', weightKg: 100, isStackable: true }),
      mkPkg({ id: 'B', weightKg: 100, isStackable: true }),
      mkPkg({ id: 'C', weightKg: 100, isStackable: true }),
    ];
    const result = sortPackagesForOptimalPack(arr);
    expect(result.map((p) => p.id)).toEqual(['A', 'B', 'C']);
  });

  it('leerer Input → leerer Output', () => {
    expect(sortPackagesForOptimalPack([])).toEqual([]);
  });

  it('mutiert input NICHT (immutable)', () => {
    const input = [
      mkPkg({ id: 'a', weightKg: 50 }),
      mkPkg({ id: 'b', weightKg: 200 }),
    ];
    const before = input.map((p) => p.id);
    sortPackagesForOptimalPack(input);
    expect(input.map((p) => p.id)).toEqual(before);
  });
});

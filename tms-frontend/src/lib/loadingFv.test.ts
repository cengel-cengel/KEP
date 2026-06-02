/**
 * Tests fuer expandPackagesFromOrder (FV-Pendant zu nvExpand).
 *
 * Was geprueft wird (H4-Fokus):
 *  · Per-Klon storedPos aus positions[] (BE H2-Response).
 *  · Fallback auf legacy posXCm/posYCm/posZCm wenn positions fehlt.
 *  · Robustheit gegen Reihenfolge der positions-Eintraege.
 *  · null-pos (Reset) wird durchgereicht.
 *  · dbItemId-Konvention (q===1 → it.id; q>1 → undefined).
 */
import { describe, it, expect } from 'vitest';
import { expandPackagesFromOrder, type ShipmentLoad } from './loadingFv';

function mkShip(overrides: Partial<ShipmentLoad> = {}): ShipmentLoad {
  return {
    id: 's-1',
    shipmentNumber: 'S-1',
    customer: 'K',
    deliveryCity: 'S',
    deliveryOrder: 1,
    lengthCm: 100,
    widthCm: 100,
    heightCm: 100,
    weightKg: 100,
    ldm: 1,
    isStackable: true,
    packageCount: 1,
    packageType: 'pallet_euro',
    ...overrides,
  };
}

describe('expandPackagesFromOrder — quantity & dbItemId', () => {
  it('quantity=1: 1 Package mit dbItemId=it.id', () => {
    const ship = mkShip({
      packageItems: [
        {
          id: 'pi-1',
          lineIndex: 1,
          packageType: 'pallet_euro',
          quantity: 1,
          lengthCm: 100,
          widthCm: 100,
          heightCm: 100,
          weightKg: 100,
          stackable: true,
          posXCm: null,
          posYCm: null,
          posZCm: null,
          rotationDeg: 0,
        },
      ],
    });
    const out = expandPackagesFromOrder([ship]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('pi-1');
    expect(out[0].dbItemId).toBe('pi-1');
  });

  it('quantity>1: nur q===1 hat dbItemId; q>=2 hat undefined', () => {
    const ship = mkShip({
      packageItems: [
        {
          id: 'pi-1',
          lineIndex: 1,
          packageType: 'pallet_euro',
          quantity: 3,
          lengthCm: 100,
          widthCm: 100,
          heightCm: 100,
          weightKg: 300,
          stackable: true,
          posXCm: null,
          posYCm: null,
          posZCm: null,
          rotationDeg: 0,
        },
      ],
    });
    const out = expandPackagesFromOrder([ship]);
    expect(out).toHaveLength(3);
    expect(out[0].id).toBe('pi-1:q1');
    expect(out[0].dbItemId).toBe('pi-1');
    expect(out[1].id).toBe('pi-1:q2');
    expect(out[1].dbItemId).toBeUndefined();
    expect(out[2].id).toBe('pi-1:q3');
    expect(out[2].dbItemId).toBeUndefined();
    // weightKg pro Klon = total/qty
    expect(out[0].weightKg).toBeCloseTo(100, 1);
  });
});

describe('expandPackagesFromOrder H4 — per-Klon storedPos aus positions[]', () => {
  it('positions[] gesetzt: jeder Klon q∈[1,quantity] liest paletteIndex===q-1', () => {
    const ship = mkShip({
      packageItems: [
        {
          id: 'pi-1',
          lineIndex: 1,
          packageType: 'pallet_euro',
          quantity: 3,
          lengthCm: 100,
          widthCm: 100,
          heightCm: 100,
          weightKg: 300,
          stackable: true,
          // Legacy ignoriert wenn positions[] da:
          posXCm: 999,
          posYCm: 999,
          posZCm: 999,
          rotationDeg: 0,
          positions: [
            {
              paletteIndex: 0,
              posXCm: 10,
              posYCm: 20,
              posZCm: 0,
              rotationDeg: 0,
            },
            {
              paletteIndex: 1,
              posXCm: 110,
              posYCm: 220,
              posZCm: 0,
              rotationDeg: 90,
            },
            // paletteIndex 2 fehlt → Klon q===3 = Auto-Placer
          ],
        },
      ],
    });
    const out = expandPackagesFromOrder([ship]);
    expect(out).toHaveLength(3);
    // q=1 → paletteIndex=0
    expect(out[0].storedPosX).toBe(10);
    expect(out[0].storedPosY).toBe(20);
    // q=2 → paletteIndex=1
    expect(out[1].storedPosX).toBe(110);
    expect(out[1].storedPosY).toBe(220);
    // q=3 → paletteIndex=2 fehlt → null
    expect(out[2].storedPosX).toBeNull();
    expect(out[2].storedPosY).toBeNull();
  });

  it('Reihenfolge der positions egal — find via paletteIndex', () => {
    const ship = mkShip({
      packageItems: [
        {
          id: 'pi-1',
          lineIndex: 1,
          packageType: 'pallet_euro',
          quantity: 2,
          lengthCm: 100,
          widthCm: 100,
          heightCm: 100,
          weightKg: 200,
          stackable: true,
          posXCm: null,
          posYCm: null,
          posZCm: null,
          rotationDeg: 0,
          positions: [
            // out-of-order:
            {
              paletteIndex: 1,
              posXCm: 99,
              posYCm: 88,
              posZCm: 0,
              rotationDeg: 0,
            },
            {
              paletteIndex: 0,
              posXCm: 11,
              posYCm: 22,
              posZCm: 0,
              rotationDeg: 0,
            },
          ],
        },
      ],
    });
    const out = expandPackagesFromOrder([ship]);
    expect(out[0].storedPosX).toBe(11);
    expect(out[1].storedPosX).toBe(99);
  });

  it('OHNE positions[]: Fallback auf legacy posXCm (q===1) + null fuer q>=2', () => {
    const ship = mkShip({
      packageItems: [
        {
          id: 'pi-1',
          lineIndex: 1,
          packageType: 'pallet_euro',
          quantity: 2,
          lengthCm: 100,
          widthCm: 100,
          heightCm: 100,
          weightKg: 200,
          stackable: true,
          posXCm: 55,
          posYCm: 66,
          posZCm: 0,
          rotationDeg: 0,
          // positions UNDEFINED → Legacy-Pfad
        },
      ],
    });
    const out = expandPackagesFromOrder([ship]);
    expect(out).toHaveLength(2);
    expect(out[0].storedPosX).toBe(55);
    expect(out[0].storedPosY).toBe(66);
    expect(out[1].storedPosX).toBeNull();
    expect(out[1].storedPosY).toBeNull();
  });

  it('positions mit null-pos (Reset) → storedPos null fuer den Klon', () => {
    const ship = mkShip({
      packageItems: [
        {
          id: 'pi-1',
          lineIndex: 1,
          packageType: 'pallet_euro',
          quantity: 1,
          lengthCm: 100,
          widthCm: 100,
          heightCm: 100,
          weightKg: 100,
          stackable: true,
          posXCm: null,
          posYCm: null,
          posZCm: null,
          rotationDeg: 0,
          positions: [
            {
              paletteIndex: 0,
              posXCm: null,
              posYCm: null,
              posZCm: null,
              rotationDeg: 0,
            },
          ],
        },
      ],
    });
    const out = expandPackagesFromOrder([ship]);
    expect(out).toHaveLength(1);
    expect(out[0].storedPosX).toBeNull();
    expect(out[0].storedPosY).toBeNull();
  });
});

/**
 * Tests fuer nvExpandPackages (Expand-Step der NV-Pack-Pipeline).
 *
 * Was geprueft wird:
 *  · Quantity-Expand: 1 item × qty=N → N pkgs mit selben Dimensionen
 *  · storedPos-Honor q==0: nur erster Klon traegt DB-Position
 *  · Color-Mapping: Pakete derselben Sendung → selbe Farbe
 *  · isStackable per-Sendung: Misch-Sendungen → alle non-stackable
 *  · Leer-Input: null + leere stops
 *  · dbItemId: fuer ALLE Klone gesetzt (H5a) — Klone teilen die
 *    line_index-Row-Id; paletteIndex unterscheidet sie
 *
 * Placement (posX/Y/Z, Stack-Slot) ist NICHT Teil dieses Tests —
 * gehoert in loadingShared.test.ts (bereits abgedeckt).
 */
import { describe, it, expect } from 'vitest';
import {
  nvExpandPackages,
  NV_SHIPMENT_COLORS,
  type NvExpandInput,
} from './nvExpand';

type Item = NonNullable<
  NonNullable<NvExpandInput['stops']>[number]['shipment']['shipment_package_items']
>[number];

function mkItem(opts: Partial<Item> & { id: string }): Item {
  return {
    quantity: 1,
    length_cm: 120,
    width_cm: 80,
    height_cm: 100,
    weight_kg: 100,
    stackable: true,
    pos_x_cm: null,
    pos_y_cm: null,
    pos_z_cm: null,
    rotation_deg: 0,
    ...opts,
  };
}

function mkTour(
  stops: Array<{ shipmentId: string; items: Item[] }>,
): NvExpandInput {
  return {
    stops: stops.map((s) => ({
      shipment: {
        id: s.shipmentId,
        shipment_package_items: s.items,
      },
    })),
  };
}

describe('nvExpandPackages — leer/edge', () => {
  it('tour=null → []', () => {
    expect(nvExpandPackages(null)).toEqual([]);
  });

  it('leere stops → []', () => {
    expect(nvExpandPackages({ stops: [] })).toEqual([]);
  });

  it('Sendung ohne items → []', () => {
    const tour: NvExpandInput = {
      stops: [{ shipment: { id: 'sh-1', shipment_package_items: [] } }],
    };
    expect(nvExpandPackages(tour)).toEqual([]);
  });
});

describe('nvExpandPackages — quantity expand', () => {
  it('qty=1 → 1 Klon mit Original-ID, dbItemId gesetzt', () => {
    const tour = mkTour([
      {
        shipmentId: 'sh-1',
        items: [mkItem({ id: 'it-1', quantity: 1 })],
      },
    ]);
    const out = nvExpandPackages(tour);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('it-1');
    expect(out[0].dbItemId).toBe('it-1');
  });

  it('qty=3 → 3 Klone mit Synth-Suffix, ALLE haben dbItemId + paletteIndex (H5a)', () => {
    const tour = mkTour([
      {
        shipmentId: 'sh-1',
        items: [mkItem({ id: 'it-1', quantity: 3 })],
      },
    ]);
    const out = nvExpandPackages(tour);
    expect(out).toHaveLength(3);
    expect(out[0].id).toBe('it-1:pkg:0');
    expect(out[0].dbItemId).toBe('it-1');
    expect(out[0].paletteIndex).toBe(0);
    expect(out[1].id).toBe('it-1:pkg:1');
    // H5a: dbItemId fuer ALLE Klone (line_index-Row-Id);
    // Klone unterscheiden sich nur durch paletteIndex.
    expect(out[1].dbItemId).toBe('it-1');
    expect(out[1].paletteIndex).toBe(1);
    expect(out[2].id).toBe('it-1:pkg:2');
    expect(out[2].dbItemId).toBe('it-1');
    expect(out[2].paletteIndex).toBe(2);
    // Alle Klone tragen dieselben Dimensionen + Sendung.
    expect(new Set(out.map((p) => p.lengthCm))).toEqual(new Set([120]));
    expect(new Set(out.map((p) => p.shipmentId))).toEqual(new Set(['sh-1']));
  });

  it('qty=0/null/undefined → mind. 1 Klon (Floor auf 1)', () => {
    const tour = mkTour([
      {
        shipmentId: 'sh-1',
        items: [mkItem({ id: 'it-1', quantity: 0 })],
      },
    ]);
    expect(nvExpandPackages(tour)).toHaveLength(1);
  });
});

describe('nvExpandPackages — storedPos honor (q==0)', () => {
  it('q==0 traegt DB-Position aus pos_*_cm', () => {
    const tour = mkTour([
      {
        shipmentId: 'sh-1',
        items: [
          mkItem({
            id: 'it-1',
            quantity: 1,
            pos_x_cm: 50,
            pos_y_cm: 100,
            pos_z_cm: 0,
          }),
        ],
      },
    ]);
    const out = nvExpandPackages(tour);
    expect(out[0].storedPosX).toBe(50);
    expect(out[0].storedPosY).toBe(100);
    expect(out[0].storedPosZ).toBe(0);
  });

  it('q>0 (Synth-Klone) bekommen storedPos=null', () => {
    const tour = mkTour([
      {
        shipmentId: 'sh-1',
        items: [
          mkItem({
            id: 'it-1',
            quantity: 3,
            pos_x_cm: 50,
            pos_y_cm: 100,
            pos_z_cm: 0,
          }),
        ],
      },
    ]);
    const out = nvExpandPackages(tour);
    // q==0 mit Pos
    expect(out[0].storedPosX).toBe(50);
    // q==1 + q==2 ohne Pos → placePackages Phase 2 platziert sie
    expect(out[1].storedPosX).toBeNull();
    expect(out[1].storedPosY).toBeNull();
    expect(out[2].storedPosX).toBeNull();
  });

  it('q==0 ohne pos_x_cm/pos_y_cm → storedPos=null (Phase 2 platziert)', () => {
    const tour = mkTour([
      {
        shipmentId: 'sh-1',
        items: [mkItem({ id: 'it-1', quantity: 1 })],
      },
    ]);
    const out = nvExpandPackages(tour);
    expect(out[0].storedPosX).toBeNull();
    expect(out[0].storedPosY).toBeNull();
  });
});

describe('nvExpandPackages — color mapping', () => {
  it('Pakete derselben Sendung → selbe Farbe', () => {
    const tour = mkTour([
      {
        shipmentId: 'sh-1',
        items: [
          mkItem({ id: 'it-1', quantity: 2 }),
          mkItem({ id: 'it-2', quantity: 1 }),
        ],
      },
    ]);
    const out = nvExpandPackages(tour);
    const colors = new Set(out.map((p) => p.color));
    expect(colors.size).toBe(1);
    // Erste Sendung → erste Farbe.
    expect(out[0].color).toBe(NV_SHIPMENT_COLORS[0]);
  });

  it('verschiedene Sendungen → verschiedene Farben', () => {
    const tour = mkTour([
      { shipmentId: 'sh-a', items: [mkItem({ id: 'a' })] },
      { shipmentId: 'sh-b', items: [mkItem({ id: 'b' })] },
      { shipmentId: 'sh-c', items: [mkItem({ id: 'c' })] },
    ]);
    const out = nvExpandPackages(tour);
    expect(out[0].color).toBe(NV_SHIPMENT_COLORS[0]);
    expect(out[1].color).toBe(NV_SHIPMENT_COLORS[1]);
    expect(out[2].color).toBe(NV_SHIPMENT_COLORS[2]);
  });
});

describe('nvExpandPackages — isStackable per-Sendung', () => {
  it('alle Items stackable → Sendung gilt als stackable', () => {
    const tour = mkTour([
      {
        shipmentId: 'sh-1',
        items: [
          mkItem({ id: 'a', stackable: true }),
          mkItem({ id: 'b', stackable: true }),
        ],
      },
    ]);
    const out = nvExpandPackages(tour);
    expect(out.every((p) => p.isStackable)).toBe(true);
  });

  it('mind. 1 Item non-stackable → komplette Sendung non-stackable', () => {
    // Carlos-Regel: Misch-Sendung bricht Stack-Faehigkeit (auch fuer
    // die einzelnen stackable-Items, damit sie nicht versehentlich
    // gestapelt werden).
    const tour = mkTour([
      {
        shipmentId: 'sh-1',
        items: [
          mkItem({ id: 'a', stackable: true }),
          mkItem({ id: 'b', stackable: false }),
        ],
      },
    ]);
    const out = nvExpandPackages(tour);
    expect(out.every((p) => p.isStackable === false)).toBe(true);
  });
});

// H4: Per-Klon storedPos aus positions[].
describe('nvExpandPackages H4 — per-Klon storedPos aus positions[]', () => {
  it('positions[] gesetzt: jeder Klon q∈[0,quantity-1] liest paletteIndex===q', () => {
    const tour: NvExpandInput = {
      stops: [
        {
          shipment: {
            id: 's1',
            shipment_package_items: [
              {
                id: 'pi-1',
                quantity: 3,
                length_cm: 100,
                width_cm: 100,
                height_cm: 100,
                weight_kg: 50,
                stackable: true,
                // Legacy pos_*-Felder ignoriert wenn positions[] da:
                pos_x_cm: 999,
                pos_y_cm: 999,
                pos_z_cm: 999,
                rotation_deg: 0,
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
                  // paletteIndex 2 fehlt → Klon q=2 = Auto-Placer
                ],
              },
            ],
          },
        },
      ],
    };
    const out = nvExpandPackages(tour);
    expect(out).toHaveLength(3);
    expect(out[0].storedPosX).toBe(10);
    expect(out[0].storedPosY).toBe(20);
    expect(out[0].rotationDeg).toBe(0);
    expect(out[1].storedPosX).toBe(110);
    expect(out[1].storedPosY).toBe(220);
    expect(out[1].rotationDeg).toBe(90);
    // q=2 hat keinen positions-Eintrag → null (Auto-Placer)
    expect(out[2].storedPosX).toBeNull();
    expect(out[2].storedPosY).toBeNull();
  });

  it('Reihenfolge der positions egal — find via paletteIndex (robust gegen Sortierung)', () => {
    const tour: NvExpandInput = {
      stops: [
        {
          shipment: {
            id: 's1',
            shipment_package_items: [
              {
                id: 'pi-1',
                quantity: 2,
                length_cm: 100,
                width_cm: 100,
                height_cm: 100,
                weight_kg: 50,
                stackable: true,
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
          },
        },
      ],
    };
    const out = nvExpandPackages(tour);
    expect(out[0].storedPosX).toBe(11);
    expect(out[1].storedPosX).toBe(99);
  });

  it('OHNE positions[]: Fallback auf legacy pos_*-Spalten als pIdx=0 (q≥1 Auto)', () => {
    const tour: NvExpandInput = {
      stops: [
        {
          shipment: {
            id: 's1',
            shipment_package_items: [
              {
                id: 'pi-1',
                quantity: 2,
                length_cm: 100,
                width_cm: 100,
                height_cm: 100,
                weight_kg: 50,
                stackable: true,
                pos_x_cm: 55,
                pos_y_cm: 66,
                pos_z_cm: 0,
                rotation_deg: 0,
                // positions UNDEFINED → Legacy-Pfad
              },
            ],
          },
        },
      ],
    };
    const out = nvExpandPackages(tour);
    expect(out).toHaveLength(2);
    expect(out[0].storedPosX).toBe(55);
    expect(out[0].storedPosY).toBe(66);
    expect(out[1].storedPosX).toBeNull();
    expect(out[1].storedPosY).toBeNull();
  });

  it('positions mit null-pos (Reset) → storedPos null fuer den Klon', () => {
    const tour: NvExpandInput = {
      stops: [
        {
          shipment: {
            id: 's1',
            shipment_package_items: [
              {
                id: 'pi-1',
                quantity: 1,
                length_cm: 100,
                width_cm: 100,
                height_cm: 100,
                weight_kg: 50,
                stackable: true,
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
          },
        },
      ],
    };
    const out = nvExpandPackages(tour);
    expect(out).toHaveLength(1);
    expect(out[0].storedPosX).toBeNull();
    expect(out[0].storedPosY).toBeNull();
  });
});

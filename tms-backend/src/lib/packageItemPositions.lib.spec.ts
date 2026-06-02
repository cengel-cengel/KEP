/**
 * H2 Tests fuer buildPositionsArray — Fallback-Logik + Mapping.
 */
import { buildPositionsArray } from './packageItemPositions.lib';

describe('packageItemPositions — buildPositionsArray', () => {
  it('rows leer + legacy gesetzt → 1 virtueller Eintrag pIdx=0 mit legacy-Werten', () => {
    const out = buildPositionsArray([], {
      pos_x_cm: 100,
      pos_y_cm: 200,
      pos_z_cm: 0,
      rotation_deg: 90,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      paletteIndex: 0,
      posXCm: 100,
      posYCm: 200,
      posZCm: 0,
      rotationDeg: 90,
    });
  });

  it('rows null + legacy alles null → 1 Eintrag pIdx=0 mit null-pos', () => {
    const out = buildPositionsArray(null, {
      pos_x_cm: null,
      pos_y_cm: null,
      pos_z_cm: null,
      rotation_deg: 0,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      paletteIndex: 0,
      posXCm: null,
      posYCm: null,
      posZCm: null,
      rotationDeg: 0,
    });
  });

  it('rows undefined → 1 Eintrag pIdx=0 (Prisma-Reader kann undefined liefern)', () => {
    const out = buildPositionsArray(undefined, {
      pos_x_cm: 10,
      pos_y_cm: 20,
      pos_z_cm: 30,
      rotation_deg: 0,
    });
    expect(out).toHaveLength(1);
    expect(out[0].posXCm).toBe(10);
  });

  it('rows non-empty → liefert genau diese Eintraege (legacy ignoriert)', () => {
    const out = buildPositionsArray(
      [
        {
          palette_index: 0,
          pos_x_cm: 1,
          pos_y_cm: 2,
          pos_z_cm: 3,
          rotation_deg: 0,
        },
        {
          palette_index: 2,
          pos_x_cm: 7,
          pos_y_cm: 8,
          pos_z_cm: 9,
          rotation_deg: 90,
        },
        {
          palette_index: 1,
          pos_x_cm: 4,
          pos_y_cm: 5,
          pos_z_cm: 6,
          rotation_deg: 0,
        },
      ],
      // Legacy wird ignoriert wenn rows nicht leer:
      { pos_x_cm: 999, pos_y_cm: 999, pos_z_cm: 999, rotation_deg: 0 },
    );
    expect(out).toHaveLength(3);
    // Sortierung nach paletteIndex
    expect(out.map((p) => p.paletteIndex)).toEqual([0, 1, 2]);
    expect(out[0]).toEqual({
      paletteIndex: 0,
      posXCm: 1,
      posYCm: 2,
      posZCm: 3,
      rotationDeg: 0,
    });
    expect(out[2]).toEqual({
      paletteIndex: 2,
      posXCm: 7,
      posYCm: 8,
      posZCm: 9,
      rotationDeg: 90,
    });
  });

  it('rows mit null-pos → durchreichen', () => {
    const out = buildPositionsArray(
      [
        {
          palette_index: 0,
          pos_x_cm: null,
          pos_y_cm: null,
          pos_z_cm: null,
          rotation_deg: 0,
        },
      ],
      { pos_x_cm: 100, pos_y_cm: 100, pos_z_cm: 100, rotation_deg: 0 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      paletteIndex: 0,
      posXCm: null,
      posYCm: null,
      posZCm: null,
      rotationDeg: 0,
    });
  });

  it('rows mit nur palette_index=1 (kein 0) → Array hat genau diesen Eintrag (KEIN synth-0)', () => {
    // Edge-Case: Carlos-Spec sagt "rows leer → Fallback".
    // Nicht "palette_index=0 fehlt → Fallback". Wenn die DB einen
    // pIdx=1 hat, geht er durch (User hat aktiv pIdx=0 geloescht
    // sollte nie passieren via UI — defensiver Default).
    const out = buildPositionsArray(
      [
        {
          palette_index: 1,
          pos_x_cm: 50,
          pos_y_cm: 60,
          pos_z_cm: 0,
          rotation_deg: 0,
        },
      ],
      { pos_x_cm: 100, pos_y_cm: 100, pos_z_cm: 100, rotation_deg: 0 },
    );
    expect(out).toHaveLength(1);
    expect(out[0].paletteIndex).toBe(1);
    expect(out[0].posXCm).toBe(50);
  });
});

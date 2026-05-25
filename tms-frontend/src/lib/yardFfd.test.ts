/**
 * S-6.3 C: FFD Sendungs-Bin-Pack-Tests.
 */
import { describe, expect, it } from 'vitest';
import { ffdPackShipments } from './yardFfd';

describe('ffdPackShipments — Regel #2 (ganze Sendung pro Trailer)', () => {
  it('einzelne kleine Sendung → 1 Trailer', () => {
    const t = ffdPackShipments([{ id: 's-1', volumeM3: 10, weightKg: 500 }]);
    expect(t).toHaveLength(1);
    expect(t[0].shipmentIds).toEqual(['s-1']);
    expect(t[0].volumeM3).toBe(10);
  });

  it('3 mittelgrosse Sendungen (je 40 m³) → 2 Trailer (40+40 + 40)', () => {
    const t = ffdPackShipments([
      { id: 'a', volumeM3: 40, weightKg: 1000 },
      { id: 'b', volumeM3: 40, weightKg: 1000 },
      { id: 'c', volumeM3: 40, weightKg: 1000 },
    ]);
    // 40+40 = 80 ≤ 88, dritter neuer Trailer.
    expect(t).toHaveLength(2);
    expect(t[0].shipmentIds).toHaveLength(2);
    expect(t[1].shipmentIds).toHaveLength(1);
  });

  it('Sendung wird NIE gesplittet — 60+50 m³ → 2 Trailer (kein 30/30-Split)', () => {
    const t = ffdPackShipments([
      { id: 'big', volumeM3: 60, weightKg: 5000 },
      { id: 'medium', volumeM3: 50, weightKg: 3000 },
    ]);
    expect(t).toHaveLength(2);
    expect(t[0].shipmentIds).toEqual(['big']);
    expect(t[1].shipmentIds).toEqual(['medium']);
  });

  it('Ueberdimensionale Sendung (vol > Sattel-Cap) bekommt eigenen Trailer', () => {
    const t = ffdPackShipments([
      { id: 'mega', volumeM3: 120, weightKg: 5000 },
    ]);
    expect(t).toHaveLength(1);
    expect(t[0].volumeM3).toBe(120);
  });

  it('Gewichts-Limit triggert neuen Trailer (auch wenn Vol noch passt)', () => {
    const t = ffdPackShipments([
      { id: 'heavy-a', volumeM3: 20, weightKg: 13000 },
      { id: 'heavy-b', volumeM3: 20, weightKg: 13000 },
    ]);
    // Vol: 20+20=40 ≤ 88 OK; Weight: 13000+13000=26000 > 24000 → NICHT zusammen.
    expect(t).toHaveLength(2);
  });

  it('FFD sortiert vor: groesste zuerst, kleine fuellen Reste', () => {
    const t = ffdPackShipments([
      { id: 'small', volumeM3: 5, weightKg: 100 },
      { id: 'medium', volumeM3: 30, weightKg: 1000 },
      { id: 'big', volumeM3: 50, weightKg: 2000 },
    ]);
    // Sortiert: big(50), medium(30), small(5).
    // Trailer1: big 50 → +medium 30 = 80; +small 5 = 85 ≤ 88. OK 1 Trailer.
    expect(t).toHaveLength(1);
    expect(t[0].shipmentIds).toContain('big');
    expect(t[0].shipmentIds).toContain('medium');
    expect(t[0].shipmentIds).toContain('small');
  });

  it('Custom opts: kleinerer Trailer fuehrt zu mehr Bins', () => {
    const t = ffdPackShipments(
      [
        { id: 'a', volumeM3: 20, weightKg: 500 },
        { id: 'b', volumeM3: 20, weightKg: 500 },
      ],
      { maxVolumeM3: 30, maxWeightKg: 5000 },
    );
    // 20+20=40 > 30 → 2 Trailer.
    expect(t).toHaveLength(2);
  });

  it('leerer Input → leeres Trailer-Array', () => {
    expect(ffdPackShipments([])).toEqual([]);
  });
});

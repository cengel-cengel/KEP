import { describe, expect, it } from 'vitest';
import { buildPreviewPolyline, haversineKm } from './haversine';

describe('haversineKm', () => {
  it('Hamburg → Berlin ~250km', () => {
    const hh = { lat: 53.55, lng: 9.99 };
    const b = { lat: 52.52, lng: 13.4 };
    const km = haversineKm(hh, b);
    expect(km).toBeGreaterThan(240);
    expect(km).toBeLessThan(270);
  });
  it('same point → 0', () => {
    expect(haversineKm({ lat: 53.55, lng: 9.99 }, { lat: 53.55, lng: 9.99 })).toBe(0);
  });
});

describe('buildPreviewPolyline', () => {
  const wh = { lat: 53.55, lng: 9.99 };
  const stops = [
    { lat: 53.4, lng: 9.4 },
    { lat: 53.3, lng: 9.3 },
  ];

  it('non-Charter: [WH, ...stops, WH]', () => {
    const r = buildPreviewPolyline({
      warehouse: wh,
      stops,
      isCharter: false,
    });
    expect(r).toHaveLength(4);
    expect(r[0]).toEqual([53.55, 9.99]);
    expect(r[3]).toEqual([53.55, 9.99]);
  });

  it('Charter: nur stops', () => {
    const r = buildPreviewPolyline({
      warehouse: wh,
      stops,
      isCharter: true,
    });
    expect(r).toEqual([
      [53.4, 9.4],
      [53.3, 9.3],
    ]);
  });

  it('non-Charter ohne WH → nur stops', () => {
    const r = buildPreviewPolyline({
      warehouse: null,
      stops,
      isCharter: false,
    });
    expect(r).toEqual([
      [53.4, 9.4],
      [53.3, 9.3],
    ]);
  });

  it('empty stops → empty', () => {
    expect(buildPreviewPolyline({ warehouse: wh, stops: [], isCharter: false })).toEqual([]);
  });
});

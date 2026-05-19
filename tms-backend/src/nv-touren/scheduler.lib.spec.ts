import { computeStopSchedule } from './scheduler.lib';

const datum = new Date('2026-05-19T00:00:00Z');

describe('computeStopSchedule', () => {
  it('start_zeit default 08:00 wenn nicht gesetzt', () => {
    const out = computeStopSchedule({
      datum,
      stops: [{ id: 's1', position: 0, servicezeit_min: 30 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].planned_arrival.getHours()).toBe(8);
    expect(out[0].planned_arrival.getMinutes()).toBe(0);
    // +30min service
    expect(out[0].planned_departure.getHours()).toBe(8);
    expect(out[0].planned_departure.getMinutes()).toBe(30);
  });

  it('start_zeit explizit', () => {
    const out = computeStopSchedule({
      datum,
      startZeit: '06:30',
      stops: [{ id: 's1', position: 0, servicezeit_min: 15 }],
    });
    expect(out[0].planned_arrival.getHours()).toBe(6);
    expect(out[0].planned_arrival.getMinutes()).toBe(30);
    expect(out[0].planned_departure.getMinutes()).toBe(45);
  });

  it('haversine travel: 2 Stops ~ 50km @ 40km/h = 75min', () => {
    // Stuttgart (48.78, 9.18) → Heilbronn (49.14, 9.22) ≈ 41km
    const out = computeStopSchedule({
      datum,
      stops: [
        { id: 's1', position: 0, lat: 48.78, lng: 9.18, servicezeit_min: 30 },
        { id: 's2', position: 1, lat: 49.14, lng: 9.22, servicezeit_min: 30 },
      ],
    });
    expect(out).toHaveLength(2);
    // s2.planned_arrival = 08:00 + 30(service s1) + ~60-80(travel)
    const s2Start = out[1].planned_arrival.getTime();
    const s1Start = out[0].planned_arrival.getTime();
    const diffMin = (s2Start - s1Start) / 60_000;
    expect(diffMin).toBeGreaterThan(80);  // 30 service + ~50 travel
    expect(diffMin).toBeLessThan(120);
  });

  it('Stop ohne Coord nutzt 20min default-hop', () => {
    const out = computeStopSchedule({
      datum,
      stops: [
        { id: 's1', position: 0, lat: 48.78, lng: 9.18, servicezeit_min: 30 },
        { id: 's2', position: 1, lat: null, lng: null, servicezeit_min: 30 },
      ],
    });
    const diffMin =
      (out[1].planned_arrival.getTime() - out[0].planned_arrival.getTime()) /
      60_000;
    // 30 service + 20 default-hop
    expect(diffMin).toBe(50);
  });

  it('sortiert nach position', () => {
    const out = computeStopSchedule({
      datum,
      stops: [
        { id: 's3', position: 3 },
        { id: 's1', position: 1 },
        { id: 's2', position: 2 },
      ],
    });
    expect(out.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('servicezeit null → default 30min', () => {
    const out = computeStopSchedule({
      datum,
      stops: [{ id: 's1', position: 0 }],
    });
    const diffMin =
      (out[0].planned_departure.getTime() -
        out[0].planned_arrival.getTime()) /
      60_000;
    expect(diffMin).toBe(30);
  });

  it('startCoord → erster Stop hat Travel-Zeit', () => {
    const out = computeStopSchedule({
      datum,
      startCoord: { lat: 48.78, lng: 9.18 },
      stops: [
        { id: 's1', position: 0, lat: 49.14, lng: 9.22, servicezeit_min: 30 },
      ],
    });
    // 41km @ 40km/h ≈ 61 min Travel ab 08:00 → arrival ~09:01
    const minutesSinceStart =
      (out[0].planned_arrival.getTime() -
        new Date(datum.getFullYear(), datum.getMonth(), datum.getDate(), 8, 0)
          .getTime()) /
      60_000;
    expect(minutesSinceStart).toBeGreaterThan(30);
    expect(minutesSinceStart).toBeLessThan(90);
  });
});

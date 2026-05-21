import {
  computeStopSchedule,
  computeRiskForStop,
} from './scheduler.lib';

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

  it('legDurationsSec override haversine', () => {
    const out = computeStopSchedule({
      datum,
      stops: [
        { id: 's1', position: 0, lat: 48.78, lng: 9.18, servicezeit_min: 30 },
        { id: 's2', position: 1, lat: 49.14, lng: 9.22, servicezeit_min: 30 },
      ],
      legDurationsSec: [0, 600], // 0s + 10min für s2
    });
    const diffMin =
      (out[1].planned_arrival.getTime() - out[0].planned_arrival.getTime()) /
      60_000;
    // 30 service + 10 OSRM-travel
    expect(diffMin).toBe(40);
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

describe('computeRiskForStop', () => {
  const day = new Date('2026-05-19T08:00:00Z');
  const at = (h: number, m: number): Date => {
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return d;
  };

  it('unknown wenn kein Fenster', () => {
    const r = computeRiskForStop(at(8, 0), 'PICKUP', {});
    expect(r.severity).toBe('unknown');
    expect(r.score).toBe(0);
  });

  it('ok bei genug Buffer', () => {
    const r = computeRiskForStop(at(8, 0), 'PICKUP', {
      loading_time_from: '07:00',
      loading_time_to: '12:00',
    });
    expect(r.severity).toBe('ok');
    expect(r.score).toBe(0);
  });

  it('warning bei knappem Buffer (<15min)', () => {
    const r = computeRiskForStop(at(11, 50), 'PICKUP', {
      loading_time_from: '07:00',
      loading_time_to: '12:00',
    });
    expect(r.severity).toBe('warning');
    expect(r.score).toBe(30);
  });

  it('ok bei zwischen-15-30min-Buffer mit kleinem score', () => {
    const r = computeRiskForStop(at(11, 40), 'PICKUP', {
      loading_time_from: '07:00',
      loading_time_to: '12:00',
    });
    expect(r.severity).toBe('ok');
    expect(r.score).toBe(15);
  });

  it('critical nach Fenster-Ende', () => {
    const r = computeRiskForStop(at(13, 0), 'PICKUP', {
      loading_time_from: '07:00',
      loading_time_to: '12:00',
    });
    expect(r.severity).toBe('critical');
    expect(r.score).toBe(90);
  });

  it('warning bei zu früh', () => {
    const r = computeRiskForStop(at(6, 0), 'PICKUP', {
      loading_time_from: '07:00',
      loading_time_to: '12:00',
    });
    expect(r.severity).toBe('warning');
    expect(r.score).toBe(70);
  });

  it('DELIVERY nutzt delivery_time_*', () => {
    const r = computeRiskForStop(at(15, 0), 'DELIVERY', {
      delivery_time_from: '14:00',
      delivery_time_to: '16:00',
      loading_time_from: '06:00',
      loading_time_to: '07:00',
    });
    expect(r.severity).toBe('ok');
  });
});

// ─── Map-Routing P0: is_charter-Konsequenz für Scheduler ──────
describe('Charter-Konsequenz: startCoord null', () => {
  it('Charter-Tour (startCoord=null) → planned_arrival[0] = startZeit', () => {
    const datum = new Date('2026-05-21T00:00:00Z');
    const stops = [
      {
        id: 's1',
        position: 1,
        lat: 53.5,
        lng: 9.99,
        stop_type: 'PICKUP',
        servicezeit_min: 30,
      },
      {
        id: 's2',
        position: 2,
        lat: 53.6,
        lng: 10.1,
        stop_type: 'DELIVERY',
        servicezeit_min: 30,
      },
    ];
    const out = computeStopSchedule({
      datum,
      startZeit: '08:00',
      stops,
      startCoord: null,
    });
    expect(out).toHaveLength(2);
    // Stop[0] startet exakt bei 08:00 (travelMin=0 wegen kein
    // prevCoord)
    expect(out[0].planned_arrival.getUTCHours()).toBe(8);
    expect(out[0].planned_arrival.getUTCMinutes()).toBe(0);
  });

  it('Non-Charter (startCoord=warehouse) → planned_arrival[0] = startZeit + travel(WH→Stop[0])', () => {
    const datum = new Date('2026-05-21T00:00:00Z');
    const stops = [
      {
        id: 's1',
        position: 1,
        lat: 53.5,
        lng: 9.99,
        stop_type: 'PICKUP',
        servicezeit_min: 30,
      },
    ];
    const wh = { lat: 50.0, lng: 8.0 }; // weit weg → ~400+km
    const out = computeStopSchedule({
      datum,
      startZeit: '08:00',
      stops,
      startCoord: wh,
    });
    expect(out).toHaveLength(1);
    // WH→Stop ~400km / 40km/h = ~10h → planned_arrival deutlich
    // nach 08:00.
    const arrivalH = out[0].planned_arrival.getUTCHours();
    expect(arrivalH).toBeGreaterThan(8);
  });
});

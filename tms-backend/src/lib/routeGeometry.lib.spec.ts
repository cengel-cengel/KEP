import { buildTourRoute } from './routeGeometry.lib';

const wh = { lat: 53.55, lng: 9.99 };
const hubStart = { lat: 53.5, lng: 9.5 };
const hubEnd = { lat: 53.6, lng: 10.0 };
const stops = [
  { id: 's1', lat: 53.4, lng: 9.4 },
  { id: 's2', lat: 53.3, lng: 9.3 },
];

describe('buildTourRoute', () => {
  it('NV non-Charter: [WH, ...stops, WH] (RoundTrip)', () => {
    const r = buildTourRoute({
      stops,
      startHub: wh,
      endHub: wh,
      isCharter: false,
    });
    expect(r).toHaveLength(4);
    expect(r[0].stopType).toBe('HUB_START');
    expect(r[0].coord).toEqual([9.99, 53.55]);
    expect(r[3].stopType).toBe('HUB_END');
    expect(r[3].coord).toEqual([9.99, 53.55]);
  });

  it('FV non-Charter: [hub_start, ...stops, hub_end]', () => {
    const r = buildTourRoute({
      stops,
      startHub: hubStart,
      endHub: hubEnd,
      isCharter: false,
    });
    expect(r).toHaveLength(4);
    expect(r[0].coord).toEqual([9.5, 53.5]);
    expect(r[3].coord).toEqual([10.0, 53.6]);
  });

  it('FV non-Charter mit fehlendem endHub → endHub = startHub', () => {
    const r = buildTourRoute({
      stops,
      startHub: hubStart,
      endHub: null,
      isCharter: false,
    });
    expect(r).toHaveLength(4);
    expect(r[3].coord).toEqual(r[0].coord);
  });

  it('Charter: nur Stops, kein Hub', () => {
    const r = buildTourRoute({
      stops,
      startHub: wh,
      endHub: wh,
      isCharter: true,
    });
    expect(r).toHaveLength(2);
    expect(r[0].stopType).toBe('STOP');
    expect(r[0].coord).toEqual([9.4, 53.4]);
    expect(r[1].coord).toEqual([9.3, 53.3]);
  });

  it('Empty stops → empty result', () => {
    const r = buildTourRoute({
      stops: [],
      startHub: wh,
      endHub: wh,
      isCharter: false,
    });
    expect(r).toEqual([]);
  });

  it('Non-Charter ohne Hubs → nur Stops', () => {
    const r = buildTourRoute({
      stops,
      startHub: null,
      endHub: null,
      isCharter: false,
    });
    expect(r).toHaveLength(2);
    expect(r[0].stopType).toBe('STOP');
  });
});

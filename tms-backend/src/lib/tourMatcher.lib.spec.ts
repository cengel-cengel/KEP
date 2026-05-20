import {
  findBestToursForShipment,
  type MatchShipmentInput,
  type MatchTourCandidate,
} from './tourMatcher.lib';

const stuttgart = { lat: 48.78, lng: 9.18 };
const heilbronn = { lat: 49.14, lng: 9.22 };
const hamburg = { lat: 53.55, lng: 9.99 };

const baseTour = (
  id: string,
  loc: { lat: number; lng: number },
  maxLdm = 13.6,
  usedLdm = 4,
): MatchTourCandidate => ({
  id,
  mode: 'nv',
  tour_number: `T${id.slice(-3)}`,
  datum: '2026-05-19',
  status: 'PLANNING',
  max_ldm: maxLdm,
  used_ldm: usedLdm,
  last_stop_lat: loc.lat,
  last_stop_lng: loc.lng,
  customer_ids: [],
});

describe('findBestToursForShipment', () => {
  it('perfect-match: gleicher Geo + Datum + Cluster', () => {
    const ship: MatchShipmentInput = {
      id: 's1',
      ldm: 2,
      loading_date: '2026-05-19',
      customer_id: 'cust-1',
      loading_lat: stuttgart.lat,
      loading_lng: stuttgart.lng,
    };
    const tours: MatchTourCandidate[] = [
      {
        ...baseTour('t1', stuttgart),
        customer_ids: ['cust-1'],
      },
    ];
    const r = findBestToursForShipment(ship, tours);
    expect(r).toHaveLength(1);
    expect(r[0].tour_id).toBe('t1');
    expect(r[0].score).toBeGreaterThan(80);
    expect(r[0].reason).toContain('gleicher Kunde');
  });

  it('capacity-block: filtert raus wenn ldm überlauf', () => {
    const ship: MatchShipmentInput = {
      id: 's1',
      ldm: 20, // > max 13.6
      loading_lat: stuttgart.lat,
      loading_lng: stuttgart.lng,
    };
    const tours = [baseTour('t1', stuttgart)];
    const r = findBestToursForShipment(ship, tours);
    expect(r).toHaveLength(0);
  });

  it('geo-far: niedrigerer Score', () => {
    const ship: MatchShipmentInput = {
      id: 's1',
      ldm: 2,
      loading_date: '2026-05-19',
      loading_lat: stuttgart.lat,
      loading_lng: stuttgart.lng,
    };
    const tours = [baseTour('t1', hamburg)]; // ~600 km
    const r = findBestToursForShipment(ship, tours);
    expect(r).toHaveLength(1);
    // Geo-Score 10, andere ok → unter 50
    expect(r[0].score).toBeLessThan(50);
  });

  it('Top-3 nach Score sortiert', () => {
    const ship: MatchShipmentInput = {
      id: 's1',
      ldm: 2,
      loading_date: '2026-05-19',
      customer_id: 'cust-1',
      loading_lat: stuttgart.lat,
      loading_lng: stuttgart.lng,
    };
    const tours = [
      baseTour('t-far', hamburg),
      { ...baseTour('t-near', stuttgart), customer_ids: ['cust-1'] },
      baseTour('t-mid', heilbronn),
      baseTour('t-far2', hamburg),
    ];
    const r = findBestToursForShipment(ship, tours, 3);
    expect(r).toHaveLength(3);
    expect(r[0].tour_id).toBe('t-near'); // perfect-match
    expect(r[1].tour_id).toBe('t-mid');
  });

  it('no-coords → Geo-Score 10 (sehr niedrig)', () => {
    const ship: MatchShipmentInput = {
      id: 's1',
      ldm: 2,
      loading_lat: null,
      loading_lng: null,
    };
    const tours = [baseTour('t1', stuttgart)];
    const r = findBestToursForShipment(ship, tours);
    expect(r).toHaveLength(1);
    expect(r[0].score).toBeLessThan(60);
  });

  it('Datum-Mismatch reduziert Score', () => {
    const ship: MatchShipmentInput = {
      id: 's1',
      ldm: 2,
      loading_date: '2026-05-25', // 6 Tage entfernt
      loading_lat: stuttgart.lat,
      loading_lng: stuttgart.lng,
    };
    const tours = [baseTour('t1', stuttgart)];
    const r = findBestToursForShipment(ship, tours);
    expect(r).toHaveLength(1);
    // time=0 reduziert um W_TIME=25% des max
    expect(r[0].score).toBeLessThan(70);
  });
});

// ─── T-3.3.1 OSRM-Precise Tests ────────────────────────────────
import {
  findBestToursForShipmentPrecise,
  _clearPreciseCacheForTests,
} from './tourMatcher.lib';

describe('findBestToursForShipmentPrecise', () => {
  beforeEach(() => {
    _clearPreciseCacheForTests();
  });

  const baseShip: MatchShipmentInput = {
    id: 's1',
    ldm: 2,
    weight_kg: 500,
    loading_date: '2026-05-19',
    customer_id: 'c1',
    loading_lat: heilbronn.lat,
    loading_lng: heilbronn.lng,
  };

  it('verwendet OSRM-Distance wenn fn liefert', async () => {
    const routeFn = jest.fn().mockResolvedValue(42);
    const r = await findBestToursForShipmentPrecise(
      baseShip,
      [baseTour('t1', stuttgart)],
      routeFn,
    );
    expect(routeFn).toHaveBeenCalledTimes(1);
    expect(r).toHaveLength(1);
  });

  it('Cache hit bei wiederholtem Call (gleiche Coords)', async () => {
    const routeFn = jest.fn().mockResolvedValue(42);
    await findBestToursForShipmentPrecise(
      baseShip,
      [baseTour('t1', stuttgart)],
      routeFn,
    );
    await findBestToursForShipmentPrecise(
      baseShip,
      [baseTour('t1', stuttgart)],
      routeFn,
    );
    expect(routeFn).toHaveBeenCalledTimes(1);
  });

  it('Fallback Haversine bei routeFn-null', async () => {
    const routeFn = jest.fn().mockResolvedValue(null);
    const r = await findBestToursForShipmentPrecise(
      baseShip,
      [baseTour('t1', stuttgart)],
      routeFn,
    );
    expect(r).toHaveLength(1);
    // Score bleibt finit (Haversine-Fallback hat funktioniert).
    expect(Number.isFinite(r[0].score)).toBe(true);
  });

  it('Fallback Haversine bei routeFn-throw', async () => {
    const routeFn = jest.fn().mockRejectedValue(new Error('OSRM down'));
    const r = await findBestToursForShipmentPrecise(
      baseShip,
      [baseTour('t1', stuttgart)],
      routeFn,
    );
    expect(r).toHaveLength(1);
  });

  it('parallel: N candidates → 1 Promise.allSettled-Pass', async () => {
    const routeFn = jest.fn(async (coords: Array<[number, number]>) => {
      // simulate latency, return distinct km per coords
      await new Promise((r) => setTimeout(r, 10));
      return coords[1][0] * 10; // arbitrary
    });
    const tours = [
      baseTour('t1', stuttgart),
      baseTour('t2', hamburg),
      baseTour('t3', { lat: 50.11, lng: 8.68 }),
    ];
    const r = await findBestToursForShipmentPrecise(baseShip, tours, routeFn);
    expect(routeFn).toHaveBeenCalledTimes(3);
    expect(r.length).toBeGreaterThan(0);
  });
});

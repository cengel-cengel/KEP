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

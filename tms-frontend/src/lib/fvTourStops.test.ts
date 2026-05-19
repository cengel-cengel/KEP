import { describe, expect, it } from 'vitest';
import { buildFvTourStops } from '../lib/fvTourStops';

const mkTour = (over: any = {}) => ({
  id: 't1',
  tour_number: 'T1',
  status: 'planned',
  hub_start_address: null,
  hub_end_address: null,
  shipments: [],
  polyline_geometry: null,
  ...over,
});

const addr = (lat: number, lng: number, zip = '70499', city = 'Stuttgart') => ({
  id: 'a',
  lat,
  lng,
  zip,
  city,
});

const ship = (id: string, position: number, lat: number, lng: number) => ({
  id,
  shipment_number: `S-${id}`,
  tour_position: position,
  addresses_shipments_loading_address_idToaddresses: addr(lat, lng),
});

describe('buildFvTourStops', () => {
  it('leerer Input → []', () => {
    expect(buildFvTourStops(null)).toEqual([]);
    expect(buildFvTourStops(undefined)).toEqual([]);
    expect(buildFvTourStops(mkTour())).toEqual([]);
  });

  it('beide Hubs vorhanden → Start am Anfang, Ende am Schluss', () => {
    const t = mkTour({
      hub_start_address: addr(48.5, 9.1, '70499', 'Stuttgart'),
      hub_end_address: addr(50.1, 8.7, '60311', 'Frankfurt'),
      shipments: [ship('s1', 1, 49.0, 9.5)],
    });
    const stops = buildFvTourStops(t);
    expect(stops).toHaveLength(3);
    expect(stops[0].isWarehouse).toBe(true);
    expect(stops[0].label).toContain('Start');
    expect(stops[1].id).toBe('s1');
    expect(stops[2].isWarehouse).toBe(true);
    expect(stops[2].label).toContain('Ende');
  });

  it('"ohne Start-Hub" → kein Pin Position 0', () => {
    const t = mkTour({
      hub_end_address: addr(50.1, 8.7),
      shipments: [ship('s1', 1, 49.0, 9.5)],
    });
    const stops = buildFvTourStops(t);
    expect(stops).toHaveLength(2);
    expect(stops[0].id).toBe('s1');
    expect(stops[1].isWarehouse).toBe(true);
    expect(stops[1].label).toContain('Ende');
  });

  it('"ohne End-Hub" → kein Pin am Ende', () => {
    const t = mkTour({
      hub_start_address: addr(48.5, 9.1),
      shipments: [ship('s1', 1, 49.0, 9.5)],
    });
    const stops = buildFvTourStops(t);
    expect(stops).toHaveLength(2);
    expect(stops[0].isWarehouse).toBe(true);
    expect(stops[1].id).toBe('s1');
  });

  it('shipments sortieren nach tour_position', () => {
    const t = mkTour({
      shipments: [
        ship('s3', 3, 49.0, 9.5),
        ship('s1', 1, 49.1, 9.6),
        ship('s2', 2, 49.2, 9.7),
      ],
    });
    const stops = buildFvTourStops(t);
    expect(stops.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('Stops ohne Geo-Koords werden übersprungen', () => {
    const t = mkTour({
      shipments: [
        {
          id: 's1',
          shipment_number: 'S-1',
          tour_position: 1,
          addresses_shipments_loading_address_idToaddresses: {
            id: 'a',
            lat: null,
            lng: null,
            zip: '00000',
            city: 'NoGeo',
          },
        },
        ship('s2', 2, 49.0, 9.5),
      ],
    });
    const stops = buildFvTourStops(t);
    expect(stops).toHaveLength(1);
    expect(stops[0].id).toBe('s2');
  });

  it('0,0 Koord wird übersprungen', () => {
    const t = mkTour({
      hub_start_address: addr(0, 0),
      shipments: [ship('s1', 1, 49.0, 9.5)],
    });
    const stops = buildFvTourStops(t);
    expect(stops).toHaveLength(1);
    expect(stops[0].id).toBe('s1');
  });
});

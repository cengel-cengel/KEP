/**
 * W-2.1: FV-Scheduler-Wrapper-Tests.
 */
import { describe, expect, it } from '@jest/globals';
import { computeFvSchedule, deriveStartHHMM } from './fv-scheduler.lib';

const NUE = { lat: 49.45, lng: 11.08 };   // Nürnberg
const REGENSBURG = { lat: 49.02, lng: 12.09 };
const MUENCHEN = { lat: 48.14, lng: 11.58 };

describe('deriveStartHHMM', () => {
  it('null → 06:00 Fallback', () => {
    expect(deriveStartHHMM(null)).toBe('06:00');
    expect(deriveStartHHMM(undefined)).toBe('06:00');
  });

  it('Date → HH:MM', () => {
    const d = new Date('2026-05-19T07:30:00');
    expect(deriveStartHHMM(d)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('computeFvSchedule', () => {
  const tourDate = new Date('2026-05-19T00:00:00Z');

  it('leerer shipments-input → leeres result', () => {
    const out = computeFvSchedule({
      tourDate,
      departureTime: null,
      shipments: [],
    });
    expect(out).toEqual([]);
  });

  it('ein Stop ohne startCoord: travelMin=0, planned_arrival=startZeit', () => {
    const dep = new Date('2026-05-19T06:00:00');
    const out = computeFvSchedule({
      tourDate,
      departureTime: dep,
      shipments: [
        {
          id: 'A',
          tour_position: 1,
          delivery_address: NUE,
          loading_time_from: null,
          loading_time_to: null,
          delivery_time_from: null,
          delivery_time_to: null,
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].shipment_id).toBe('A');
    expect(out[0].planned_arrival).toBeInstanceOf(Date);
  });

  it('zwei Stops: Haversine-Travel addiert Zeit zwischen Stops', () => {
    const out = computeFvSchedule({
      tourDate,
      departureTime: new Date('2026-05-19T06:00:00'),
      startCoord: NUE,
      shipments: [
        {
          id: 'A',
          tour_position: 1,
          delivery_address: REGENSBURG,
          loading_time_from: null,
          loading_time_to: null,
          delivery_time_from: null,
          delivery_time_to: null,
        },
        {
          id: 'B',
          tour_position: 2,
          delivery_address: MUENCHEN,
          loading_time_from: null,
          loading_time_to: null,
          delivery_time_from: null,
          delivery_time_to: null,
        },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[1].planned_arrival.getTime()).toBeGreaterThan(
      out[0].planned_arrival.getTime(),
    );
  });

  it('precise legDurationsSec überschreibt Haversine', () => {
    const out1 = computeFvSchedule({
      tourDate,
      departureTime: new Date('2026-05-19T06:00:00'),
      startCoord: NUE,
      shipments: [
        {
          id: 'A',
          tour_position: 1,
          delivery_address: REGENSBURG,
          loading_time_from: null,
          loading_time_to: null,
          delivery_time_from: null,
          delivery_time_to: null,
        },
      ],
      legDurationsSec: [3600], // 60 min
    });
    const out2 = computeFvSchedule({
      tourDate,
      departureTime: new Date('2026-05-19T06:00:00'),
      startCoord: NUE,
      shipments: [
        {
          id: 'A',
          tour_position: 1,
          delivery_address: REGENSBURG,
          loading_time_from: null,
          loading_time_to: null,
          delivery_time_from: null,
          delivery_time_to: null,
        },
      ],
    });
    const min1 = out1[0].planned_arrival.getMinutes();
    const min2 = out2[0].planned_arrival.getMinutes();
    expect(min1).not.toBe(min2);
  });

  it('Stop sortiert nach tour_position', () => {
    const out = computeFvSchedule({
      tourDate,
      departureTime: new Date('2026-05-19T06:00:00'),
      startCoord: NUE,
      shipments: [
        {
          id: 'B',
          tour_position: 2,
          delivery_address: MUENCHEN,
          loading_time_from: null,
          loading_time_to: null,
          delivery_time_from: null,
          delivery_time_to: null,
        },
        {
          id: 'A',
          tour_position: 1,
          delivery_address: REGENSBURG,
          loading_time_from: null,
          loading_time_to: null,
          delivery_time_from: null,
          delivery_time_to: null,
        },
      ],
    });
    expect(out[0].shipment_id).toBe('A');
    expect(out[1].shipment_id).toBe('B');
  });

  it('delivery_time_to nach planned_arrival → risk severity critical', () => {
    const out = computeFvSchedule({
      tourDate,
      departureTime: new Date('2026-05-19T15:00:00'),
      startCoord: NUE,
      shipments: [
        {
          id: 'A',
          tour_position: 1,
          delivery_address: REGENSBURG,
          loading_time_from: null,
          loading_time_to: null,
          delivery_time_from: '08:00',
          delivery_time_to: '14:00',
        },
      ],
    });
    expect(out[0].risk_severity).toBe('critical');
  });
});

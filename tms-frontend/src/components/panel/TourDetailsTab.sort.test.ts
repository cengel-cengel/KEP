/**
 * C' Sprint: Sort + Filter Helper Tests für Stopp-/Sendungs-Liste.
 * Pure-Funktionen (kein React-Render).
 */
import { describe, it, expect } from 'vitest';
import {
  buildStoppRows,
  sortStoppRows,
  filterStoppRows,
  buildSendungRows,
  sortSendungRows,
  filterSendungRows,
} from './TourDetailsTab';

const stops = [
  {
    id: 'a',
    position: 2,
    stop_type: 'DELIVERY' as const,
    planned_arrival: '2026-05-20T10:30:00Z',
    shipment: {
      id: 'sh-1',
      shipment_number: 'S-100',
      weight_kg: 50,
      customers: { id: 'c1', name: 'Beta GmbH' },
      addresses_shipments_delivery_address_idToaddresses: {
        zip: '20095',
        city: 'Hamburg',
      },
    },
  },
  {
    id: 'b',
    position: 1,
    stop_type: 'DELIVERY' as const,
    planned_arrival: '2026-05-20T08:00:00Z',
    shipment: {
      id: 'sh-2',
      shipment_number: 'S-200',
      weight_kg: 200,
      customers: { id: 'c2', name: 'Alpha AG' },
      addresses_shipments_delivery_address_idToaddresses: {
        zip: '10115',
        city: 'Berlin',
      },
    },
  },
  {
    id: 'c',
    position: 3,
    stop_type: 'PICKUP' as const,
    planned_arrival: null,
    shipment: {
      id: 'sh-3',
      shipment_number: 'S-300',
      weight_kg: null,
      customers: { id: 'c3', name: 'Gamma KG' },
      addresses_shipments_loading_address_idToaddresses: {
        zip: '80331',
        city: 'München',
      },
    },
  },
];

describe('buildStoppRows', () => {
  it('mapped Felder korrekt (Ort aus addr-Branch, kg, position)', () => {
    const rows = buildStoppRows(stops as never);
    expect(rows[0]).toMatchObject({
      id: 'a',
      position: 2,
      sendung: 'S-100',
      ort: '20095 Hamburg',
      kg: 50,
    });
    // PICKUP nutzt loading-address-Branch
    expect(rows[2].ort).toBe('80331 München');
  });
});

describe('sortStoppRows', () => {
  it('sort by position asc/desc', () => {
    const rows = buildStoppRows(stops as never);
    expect(sortStoppRows(rows, 'pos', 'asc').map((r) => r.position)).toEqual([
      1, 2, 3,
    ]);
    expect(sortStoppRows(rows, 'pos', 'desc').map((r) => r.position)).toEqual([
      3, 2, 1,
    ]);
  });
  it('sort by kg asc — null landet am Anfang', () => {
    const rows = buildStoppRows(stops as never);
    const sorted = sortStoppRows(rows, 'kg', 'asc');
    expect(sorted[0].kg).toBeNull();
  });
  it('sort by ort (Berlin < Hamburg < München)', () => {
    const rows = buildStoppRows(stops as never);
    expect(sortStoppRows(rows, 'ort', 'asc').map((r) => r.ort)).toEqual([
      '10115 Berlin',
      '20095 Hamburg',
      '80331 München',
    ]);
  });
});

describe('filterStoppRows', () => {
  it('Search trifft Sendung-Nr', () => {
    const rows = buildStoppRows(stops as never);
    expect(filterStoppRows(rows, 'S-200').map((r) => r.id)).toEqual(['b']);
  });
  it('Search trifft Ort case-insensitive', () => {
    const rows = buildStoppRows(stops as never);
    expect(filterStoppRows(rows, 'BERLIN').map((r) => r.id)).toEqual(['b']);
  });
  it('Empty Search → all rows', () => {
    const rows = buildStoppRows(stops as never);
    expect(filterStoppRows(rows, '   ').length).toBe(3);
  });
});

describe('buildSendungRows + sort/filter', () => {
  it('dedupe by shipment.id', () => {
    const stopsDup = [...stops, stops[0]]; // duplicate first
    const rows = buildSendungRows(stopsDup as never);
    expect(rows.length).toBe(3);
  });
  it('sort by kunde asc (Alpha < Beta < Gamma)', () => {
    const rows = buildSendungRows(stops as never);
    expect(sortSendungRows(rows, 'kunde', 'asc').map((r) => r.customer)).toEqual([
      'Alpha AG',
      'Beta GmbH',
      'Gamma KG',
    ]);
  });
  it('sort by kg desc', () => {
    const rows = buildSendungRows(stops as never);
    const sorted = sortSendungRows(rows, 'kg', 'desc');
    expect(sorted.map((r) => r.weight)).toEqual([200, 50, 0]);
  });
  it('filter trifft Kunde', () => {
    const rows = buildSendungRows(stops as never);
    expect(filterSendungRows(rows, 'alpha').map((r) => r.id)).toEqual(['sh-2']);
  });
});

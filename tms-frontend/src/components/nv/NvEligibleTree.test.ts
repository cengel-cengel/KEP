import { describe, expect, it } from 'vitest';
import { groupEligibleShipments } from './NvEligibleTree';
import type { EligibleShipment } from '../../lib/nvTypes';

function mkShipment(
  id: string,
  matched: string | null,
): EligibleShipment {
  return {
    id,
    shipment_number: `SH-${id}`,
    customer_id: null,
    loading_date: '2026-05-20',
    delivery_date: '2026-05-21',
    package_count: 1,
    matched_tour_gebiet_id: matched ? `gid-${matched}` : null,
    matched_tour_gebiet_code: matched,
    is_stamm_kunde: false,
  };
}

describe('groupEligibleShipments', () => {
  it('leerer Input → []', () => {
    expect(groupEligibleShipments([])).toEqual([]);
  });

  it('gruppiert nach matched_tour_gebiet_code', () => {
    const list = [
      mkShipment('1', 'NORD'),
      mkShipment('2', 'SUED'),
      mkShipment('3', 'NORD'),
    ];
    const groups = groupEligibleShipments(list);
    expect(groups).toHaveLength(2);
    const nord = groups.find(([k]) => k === 'NORD');
    const sued = groups.find(([k]) => k === 'SUED');
    expect(nord?.[1]).toHaveLength(2);
    expect(sued?.[1]).toHaveLength(1);
  });

  it('null matched → "— ohne Zuordnung —"', () => {
    const list = [mkShipment('1', null), mkShipment('2', null)];
    const groups = groupEligibleShipments(list);
    expect(groups).toHaveLength(1);
    expect(groups[0][0]).toBe('— ohne Zuordnung —');
    expect(groups[0][1]).toHaveLength(2);
  });

  it('sortiert Gruppen alphabetisch', () => {
    const list = [
      mkShipment('1', 'ZEBRA'),
      mkShipment('2', 'ALPHA'),
      mkShipment('3', 'MIKE'),
    ];
    const groups = groupEligibleShipments(list);
    expect(groups.map(([k]) => k)).toEqual(['ALPHA', 'MIKE', 'ZEBRA']);
  });

  it('preserved insertion-order pro Gruppe', () => {
    const list = [
      mkShipment('a', 'X'),
      mkShipment('b', 'X'),
      mkShipment('c', 'X'),
    ];
    const groups = groupEligibleShipments(list);
    expect(groups[0][1].map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

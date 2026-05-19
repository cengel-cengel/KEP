import { describe, expect, it, vi } from 'vitest';
import { invalidateForEvent } from './queryInvalidator';
import type { RealtimeEvent } from './realtimeClient';

function mockQc() {
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  } as any;
}

const baseEvt = {
  event_id: 'e-1',
  origin_client_id: 'other',
  entityType: 'tour' as const,
  entityId: 'tour-1',
  timestamp: '2026-05-19T10:00:00Z',
};

describe('invalidateForEvent', () => {
  it('tour.updated invalidiert 6 query-keys (incl. eligible-listen)', () => {
    const qc = mockQc();
    invalidateForEvent(qc, {
      ...baseEvt,
      event: 'tour.updated',
    } as RealtimeEvent);
    const keys = qc.invalidateQueries.mock.calls.map(
      (c: any[]) => c[0].queryKey,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        ['fv-touren'],
        ['nv-touren'],
        ['fv-tour-detail', 'tour-1'],
        ['nv-loading', 'tour-1'],
        ['fv-eligible'],
        ['nv-elig'],
      ]),
    );
  });

  it('shipment.assigned invalidiert 6 query-keys', () => {
    const qc = mockQc();
    invalidateForEvent(qc, {
      ...baseEvt,
      event: 'shipment.assigned',
    } as RealtimeEvent);
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(6);
    const keys = qc.invalidateQueries.mock.calls.map(
      (c: any[]) => c[0].queryKey,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        ['fv-eligible'],
        ['nv-elig'],
        ['fv-touren'],
        ['nv-touren'],
        ['fv-tour-detail', 'tour-1'],
        ['nv-loading', 'tour-1'],
      ]),
    );
  });

  it('unbekannter event-Type → no-op', () => {
    const qc = mockQc();
    invalidateForEvent(qc, {
      ...baseEvt,
      event: 'unknown.event' as any,
    } as RealtimeEvent);
    expect(qc.invalidateQueries).not.toHaveBeenCalled();
  });
});

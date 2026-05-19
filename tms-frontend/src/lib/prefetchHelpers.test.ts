import { describe, expect, it, vi } from 'vitest';
import {
  prefetchFvTourDetail,
  prefetchNvLoadingTour,
} from './prefetchHelpers';

vi.mock('./api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

function mockQc() {
  return {
    prefetchQuery: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('prefetchFvTourDetail', () => {
  it('ruft prefetchQuery mit ["fv-tour-detail", id]', () => {
    const qc = mockQc();
    prefetchFvTourDetail(qc, 'tour-1');
    expect(qc.prefetchQuery).toHaveBeenCalledTimes(1);
    expect(qc.prefetchQuery.mock.calls[0][0].queryKey).toEqual([
      'fv-tour-detail',
      'tour-1',
    ]);
  });
  it('staleTime 30s', () => {
    const qc = mockQc();
    prefetchFvTourDetail(qc, 'tour-1');
    expect(qc.prefetchQuery.mock.calls[0][0].staleTime).toBe(30_000);
  });
  it('no-op bei null/undefined/empty', () => {
    const qc = mockQc();
    prefetchFvTourDetail(qc, null);
    prefetchFvTourDetail(qc, undefined);
    prefetchFvTourDetail(qc, '');
    expect(qc.prefetchQuery).not.toHaveBeenCalled();
  });
});

describe('prefetchNvLoadingTour', () => {
  it('ruft prefetchQuery mit ["nv-loading", id]', () => {
    const qc = mockQc();
    prefetchNvLoadingTour(qc, 'nv-1');
    expect(qc.prefetchQuery.mock.calls[0][0].queryKey).toEqual([
      'nv-loading',
      'nv-1',
    ]);
    expect(qc.prefetchQuery.mock.calls[0][0].staleTime).toBe(30_000);
  });
  it('no-op bei null/undefined', () => {
    const qc = mockQc();
    prefetchNvLoadingTour(qc, null);
    prefetchNvLoadingTour(qc, undefined);
    expect(qc.prefetchQuery).not.toHaveBeenCalled();
  });
});

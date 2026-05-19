/**
 * PERF-2: Prefetch + Hover-Debounce Helpers.
 *
 * Pattern:
 *   const handlers = useHoverPrefetch(() =>
 *     prefetchFvTourDetail(qc, tourId),
 *   );
 *   <div {...handlers}>...</div>
 *
 * - onMouseEnter / onFocus → setTimeout(prefetch, 100ms)
 * - onMouseLeave / onBlur  → clearTimeout (cancel falls
 *   user nur drüberhuscht)
 * - prefetchQuery dedupliziert intern via queryKey,
 *   doppelte Calls sind harmlos.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';

const HOVER_DEBOUNCE_MS = 100;

/** FV-Tour-Detail vorausladen (für FvTourCard + Map-Popup). */
export function prefetchFvTourDetail(
  qc: QueryClient,
  tourId: string | undefined | null,
): void {
  if (!tourId) return;
  void qc.prefetchQuery({
    queryKey: ['fv-tour-detail', tourId],
    queryFn: async () => (await api.get(`/tours/${tourId}`)).data,
    staleTime: 30_000,
  });
}

/** NV-Beladeplan-Tour vorausladen (für TourCard Beladeplan-Btn). */
export function prefetchNvLoadingTour(
  qc: QueryClient,
  tourId: string | undefined | null,
): void {
  if (!tourId) return;
  void qc.prefetchQuery({
    queryKey: ['nv-loading', tourId],
    queryFn: async () =>
      (await api.get(`/nv-touren/${tourId}/loading`)).data,
    staleTime: 30_000,
  });
}

/**
 * Hover-Debounce-Hook für Mouse/Focus-Prefetch.
 * Sammelt Handler-Object für direktes spread auf div.
 */
export function useHoverPrefetch(prefetch: () => void): {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
} {
  const timerRef = useRef<number | null>(null);
  const prefetchRef = useRef(prefetch);
  useEffect(() => {
    prefetchRef.current = prefetch;
  }, [prefetch]);

  const start = useCallback(() => {
    if (timerRef.current != null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      prefetchRef.current();
    }, HOVER_DEBOUNCE_MS);
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return {
    onMouseEnter: start,
    onMouseLeave: cancel,
    onFocus: start,
    onBlur: cancel,
  };
}

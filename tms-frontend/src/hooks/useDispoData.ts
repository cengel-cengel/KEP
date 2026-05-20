/**
 * W-3.2.B Dispo-Data Hook.
 *
 * Mode-aware Wrapper für Eligible-Shipments + Tour-Liste + Tour-Detail.
 * Konsumiert workspace.tsx state (mode/datum/filter) für Query-Params.
 *
 * Query-Keys identisch zur bisherigen Page-Logik — Realtime-Invalidator
 * und Cache-Sharing zw. Hooks und Legacy-Pages bleiben.
 *
 * Endpoints:
 *   FV: GET /tours/eligible-shipments-fv   ?datum= ?search=
 *       GET /tours                         ?status= ?date=
 *       GET /tours/:id
 *   NV: GET /nv-touren/eligible-shipments  ?datum= ?mode= ?search=
 *       GET /nv-touren                     ?datum= ?status=
 *       GET /nv-touren/:id
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { WorkspaceMode, NvPickupMode } from '../state/workspace';

const STALE_ELIGIBLE_MS = 30_000;
const STALE_TOUREN_MS = 15_000;
const STALE_DETAIL_MS = 30_000;

interface EligibleFilter {
  datum: string;
  search?: string;
  /** NV-only Stop-Mode (PICKUP|DELIVERY). FV ignoriert. */
  pickupMode?: NvPickupMode;
}

export function useEligibleShipments<T = unknown>(
  mode: WorkspaceMode,
  filter: EligibleFilter,
): UseQueryResult<T[]> {
  return useQuery<T[]>({
    queryKey:
      mode === 'fv'
        ? ['fv-eligible', filter.datum, filter.search ?? '']
        : ['nv-elig', filter.datum, filter.pickupMode ?? 'PICKUP', filter.search ?? ''],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filter.datum) params.datum = filter.datum;
      if (filter.search?.trim()) params.search = filter.search.trim();
      if (mode === 'nv' && filter.pickupMode) params.mode = filter.pickupMode;
      const url =
        mode === 'fv'
          ? '/tours/eligible-shipments-fv'
          : '/nv-touren/eligible-shipments';
      const { data } = await api.get<T[]>(url, { params });
      return data;
    },
    staleTime: STALE_ELIGIBLE_MS,
  });
}

interface TourenFilter {
  datum: string;
  /** FV: comma-separated status filter, default 'planned,dispatched'. */
  fvStatus?: string;
  /** NV: tour-status-array, default ['PLANNING']. */
  tourStatuses?: string[];
}

export function useTours<T = unknown>(
  mode: WorkspaceMode,
  filter: TourenFilter,
): UseQueryResult<T[]> {
  const nvStatusKey = (filter.tourStatuses ?? ['PLANNING']).slice().sort().join(',');
  return useQuery<T[]>({
    queryKey:
      mode === 'fv'
        ? ['fv-touren', filter.datum, filter.fvStatus ?? 'planned,dispatched']
        : ['nv-touren', filter.datum, nvStatusKey],
    queryFn: async () => {
      if (mode === 'fv') {
        const { data } = await api.get<T[]>('/tours', {
          params: {
            status: filter.fvStatus ?? 'planned,dispatched',
            date: filter.datum,
          },
        });
        return data;
      }
      const { data } = await api.get<T[]>('/nv-touren', {
        params: {
          datum: filter.datum,
          status: (filter.tourStatuses ?? ['PLANNING']).join(','),
        },
      });
      return data;
    },
    staleTime: STALE_TOUREN_MS,
  });
}

export function useTourDetail<T = unknown>(
  mode: WorkspaceMode,
  tourId: string | null | undefined,
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey:
      mode === 'fv'
        ? ['fv-tour-detail', tourId]
        : ['nv-tour-detail', tourId],
    queryFn: async () => {
      const url = mode === 'fv' ? `/tours/${tourId}` : `/nv-touren/${tourId}`;
      const { data } = await api.get<T>(url);
      return data;
    },
    enabled: !!tourId,
    staleTime: STALE_DETAIL_MS,
  });
}

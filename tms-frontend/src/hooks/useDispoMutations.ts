/**
 * W-3.2.B Dispo-Mutations Hook (Hybrid-Spec).
 *
 * Mode-aware Wrapper für die häufigsten Disposition-Mutations
 * (NV + FV). Wird in W-3.2.C von QueuePanel/BoardPanel konsumiert.
 *
 * Endpoints:
 *   FV: POST   /tours
 *       POST   /tours/:id/batch-stops    { adds[], removes[] }
 *       PATCH  /tours/:id
 *       DELETE /tours/:id
 *       PUT    /tours/:id/shipment-order
 *   NV: POST   /nv-touren
 *       POST   /nv-touren/:id/stops      { shipment_id, stop_type }   (single)
 *       POST   /nv-touren/:id/batch-stops { adds[], removes[], stop_type }
 *       DELETE /nv-touren/:id/stops/:stopId
 *       POST   /nv-touren/:id/stops/reorder
 *       POST   /nv-touren/auto-suggest   ?datum=&mode=
 *       PATCH  /nv-touren/:id
 *       DELETE /nv-touren/:id
 *
 * Hooks:
 *   useDispoMutations(mode)     Bundle für gemeinsame Mutations
 *   useAddStop()                NV-only, single-stop add
 *   useDeleteStop()             NV-only, per stop_id delete
 *   useAutoSuggest()            NV-only, Auto-Tour-Assignment
 *
 * Query-Invalidation:
 *   FV: ['fv-touren'], ['fv-eligible'], ['fv-tour-detail', id]
 *   NV: ['nv-touren'], ['nv-elig'], ['nv-tour-detail', id]
 *
 * NICHT in B: nvPendingStore-Flow (syncTimers/Esc/etc) bleibt
 * page-lokal bis W-3.2.C QueuePanel-Extract.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { WorkspaceMode, NvPickupMode } from '../state/workspace';

interface BatchStopsInput {
  tourId: string;
  adds?: string[];
  removes?: string[];
  /** NV-only. PICKUP|DELIVERY. */
  stop_type?: NvPickupMode;
}

interface ReorderInput {
  tourId: string;
  items: { id: string; position: number }[];
}

interface CreateTourInput {
  /** FV: { tourDate, tourNumber?, hubStartAddressId?, ... } */
  /** NV: { nv_stamm_tour_id, datum, subunternehmer_id? } */
  payload: Record<string, unknown>;
}

function invalidateMode(
  qc: ReturnType<typeof useQueryClient>,
  mode: WorkspaceMode,
  tourId?: string,
) {
  if (mode === 'fv') {
    qc.invalidateQueries({ queryKey: ['fv-touren'] });
    qc.invalidateQueries({ queryKey: ['fv-eligible'] });
    if (tourId) {
      qc.invalidateQueries({ queryKey: ['fv-tour-detail', tourId] });
      // B2: FV-Beladeplan (LoadingPlanPanel + LoadingPlanPage) liest
      // ['loading', 'optimize', tourId] — sonst stale nach Drop/Assign.
      qc.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] });
    }
  } else {
    qc.invalidateQueries({ queryKey: ['nv-touren'] });
    qc.invalidateQueries({ queryKey: ['nv-elig'] });
    if (tourId) {
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', tourId] });
      // B2: NV-Beladeplan (LoadingPlanPanel + NvLoadingPlanPage) liest
      // ['nv-loading', tourId] — sonst stale nach Drop/Assign.
      qc.invalidateQueries({ queryKey: ['nv-loading', tourId] });
    }
  }
}

export function useDispoMutations(mode: WorkspaceMode) {
  const qc = useQueryClient();

  const createTour = useMutation({
    mutationFn: async (input: CreateTourInput) => {
      const url = mode === 'fv' ? '/tours' : '/nv-touren';
      const { data } = await api.post<{ id: string }>(url, input.payload);
      return data;
    },
    onSuccess: () => invalidateMode(qc, mode),
  });

  const batchAddStops = useMutation({
    mutationFn: async (input: BatchStopsInput) => {
      const url =
        mode === 'fv'
          ? `/tours/${input.tourId}/batch-stops`
          : `/nv-touren/${input.tourId}/batch-stops`;
      const body: Record<string, unknown> = {
        adds: input.adds ?? [],
        removes: input.removes ?? [],
      };
      if (mode === 'nv' && input.stop_type) body.stop_type = input.stop_type;
      const { data } = await api.post(url, body);
      return data;
    },
    onSuccess: (_d, vars) => invalidateMode(qc, mode, vars.tourId),
  });

  const reorderStops = useMutation({
    mutationFn: async (input: ReorderInput) => {
      if (mode === 'fv') {
        // FV reorder = updateShipmentOrder per Position-Array
        const ids = [...input.items]
          .sort((a, b) => a.position - b.position)
          .map((i) => i.id);
        const { data } = await api.put(`/tours/${input.tourId}/shipment-order`, {
          shipmentIds: ids,
        });
        return data;
      }
      const { data } = await api.post(
        `/nv-touren/${input.tourId}/stops/reorder`,
        { items: input.items },
      );
      return data;
    },
    onSuccess: (_d, vars) => invalidateMode(qc, mode, vars.tourId),
  });

  const deleteTour = useMutation({
    mutationFn: async (tourId: string) => {
      const url = mode === 'fv' ? `/tours/${tourId}` : `/nv-touren/${tourId}`;
      const { data } = await api.delete(url);
      return data;
    },
    onSuccess: () => invalidateMode(qc, mode),
  });

  const updateTourStatus = useMutation({
    mutationFn: async (input: { tourId: string; status: string }) => {
      const url =
        mode === 'fv'
          ? `/tours/${input.tourId}`
          : `/nv-touren/${input.tourId}`;
      const { data } = await api.patch(url, { status: input.status });
      return data;
    },
    onSuccess: (_d, vars) => invalidateMode(qc, mode, vars.tourId),
  });

  return {
    createTour,
    batchAddStops,
    reorderStops,
    deleteTour,
    updateTourStatus,
    /** Manual-Invalidate für besondere Flows. */
    invalidate: () => invalidateMode(qc, mode),
  };
}

/**
 * NV-only: Single-Stop-Add mit stop_type Body.
 * Optimistic-Update + Rollback bleiben in Page bis W-3.2.C —
 * dieser Hook ist die simple Mutation ohne Optimistic-Layer.
 */
export function useAddStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tourId: string;
      shipmentId: string;
      stop_type: NvPickupMode;
    }) => {
      const { data } = await api.post(
        `/nv-touren/${input.tourId}/stops`,
        { shipment_id: input.shipmentId, stop_type: input.stop_type },
      );
      return data;
    },
    onSuccess: (_d, vars) => invalidateMode(qc, 'nv', vars.tourId),
  });
}

/** NV-only: Stop-Delete per stop_id. */
export function useDeleteStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tourId: string; stopId: string }) => {
      const { data } = await api.delete(
        `/nv-touren/${input.tourId}/stops/${input.stopId}`,
      );
      return data;
    },
    onSuccess: (_d, vars) => invalidateMode(qc, 'nv', vars.tourId),
  });
}

/** NV-only: Auto-Tour-Assignment für Stamm-Kunden. */
export function useAutoSuggest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { datum: string; mode: NvPickupMode }) => {
      const { data } = await api.post(
        '/nv-touren/auto-suggest',
        undefined,
        { params: { datum: input.datum, mode: input.mode } },
      );
      return data as {
        touren_created: number;
        stops_added: number;
        stops_skipped_too_big?: number;
        new_tours_created?: number;
        touren_created_template?: number;
        details?: { stops_skipped_capacity?: number }[];
      };
    },
    onSuccess: () => invalidateMode(qc, 'nv'),
  });
}

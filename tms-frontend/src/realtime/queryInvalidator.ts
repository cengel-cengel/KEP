/**
 * PERF-1: Default-Handler für Realtime-Events.
 *
 * Mapping Event → React-Query invalidate-Keys:
 *   tour.updated      → ['fv-touren'], ['nv-touren'],
 *                       ['fv-tour-detail', id], ['nv-loading', id]
 *   shipment.assigned → ['fv-eligible'], ['fv-touren'],
 *                       ['nv-touren'], ['fv-tour-detail', id],
 *                       ['nv-loading', id]
 *
 * Dedup + No-Self-Event passieren upstream im realtimeClient.
 * Hier nur Invalidation.
 */
import type { QueryClient } from '@tanstack/react-query';
import type { RealtimeEvent } from './realtimeClient';

export function invalidateForEvent(
  qc: QueryClient,
  evt: RealtimeEvent,
): void {
  if (evt.event === 'tour.updated') {
    qc.invalidateQueries({ queryKey: ['fv-touren'] });
    qc.invalidateQueries({ queryKey: ['nv-touren'] });
    qc.invalidateQueries({ queryKey: ['fv-tour-detail', evt.entityId] });
    qc.invalidateQueries({ queryKey: ['nv-loading', evt.entityId] });
    // P0-6.3 BUG 2: COMPLETED-Übergang macht shipments
    // FV-eligible (PICKUP-completed). Eligible-Listen mit-
    // invalidieren, sonst F5-Bedarf.
    qc.invalidateQueries({ queryKey: ['fv-eligible'] });
    qc.invalidateQueries({ queryKey: ['nv-elig'] });
    return;
  }
  if (evt.event === 'shipment.assigned') {
    qc.invalidateQueries({ queryKey: ['fv-eligible'] });
    qc.invalidateQueries({ queryKey: ['nv-elig'] });
    qc.invalidateQueries({ queryKey: ['fv-touren'] });
    qc.invalidateQueries({ queryKey: ['nv-touren'] });
    qc.invalidateQueries({ queryKey: ['fv-tour-detail', evt.entityId] });
    qc.invalidateQueries({ queryKey: ['nv-loading', evt.entityId] });
    return;
  }
}

/**
 * PERF-1: Default-Handler für Realtime-Events.
 *
 * Mapping Event → React-Query invalidate-Keys:
 *   tour.updated      → ['fv-touren'], ['nv-touren'],
 *                       ['fv-tour-detail', id], ['nv-loading', id],
 *                       ['loading','optimize', id]
 *   shipment.assigned → ['fv-eligible'], ['fv-touren'],
 *                       ['nv-touren'], ['fv-tour-detail', id],
 *                       ['nv-loading', id], ['loading','optimize', id]
 *
 * Dedup + No-Self-Event passieren upstream im realtimeClient.
 * Hier nur Invalidation.
 *
 * B2: FV-Beladeplan-Key ['loading','optimize', id] symmetrisch zum
 *   NV-Pendant ['nv-loading', id] ergaenzt — sonst sahen andere User
 *   (mit demselben FV-LoadingPlanPanel offen) den Drop-Effekt nicht.
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
    qc.invalidateQueries({ queryKey: ['loading', 'optimize', evt.entityId] });
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
    qc.invalidateQueries({ queryKey: ['loading', 'optimize', evt.entityId] });
    return;
  }
  // PERF-1.2: shipment.updated — Detail-Refresh + Eligibles-Re-Score.
  // Triggert M-1.1 Customer-PATCH (Tier-Change) und Status-Updates.
  if (evt.event === 'shipment.updated') {
    qc.invalidateQueries({ queryKey: ['shipments', 'detail', evt.entityId] });
    qc.invalidateQueries({ queryKey: ['shipment-best-match', evt.entityId] });
    qc.invalidateQueries({ queryKey: ['fv-eligible'] });
    qc.invalidateQueries({ queryKey: ['nv-elig'] });
    return;
  }
}

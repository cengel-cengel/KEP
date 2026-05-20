/**
 * W-3.2.C Hook: NV-Pending-Sync Wrapper.
 *
 * Extrahiert aus NvDispositionPage.tsx (Pure-Move, Logik unverändert).
 *
 * Verantwortlich für die Page-level Wrapper-Funktionen rund um den
 * external nvPendingStore (lib/useNvPendingStore.ts):
 *
 *   • syncTimersRef           Map<tourId, timer>  Debounce-Timer (500ms)
 *   • reInvalidateTimersRef   Map<tourId, timer>  Catch-Up-Timer (2s)
 *   • scheduleSync()          Debounced batch-sync per Tour
 *   • flushSync()             Sofortiger POST /nv-touren/:id/batch-stops
 *   • scheduleReInvalidateTouren() — Background-Optimize-Catch-Up
 *   • Tour-Switch-Auto-Flush (prev-tour wird beim Wechsel geflusht)
 *   • Esc-Key clearAll (mit INPUT/TEXTAREA-Guard)
 *   • Unmount-Cleanup (alle Timer abräumen)
 *   • onPinClick(shipmentId) — Pin-Toggle ODER pin-add-Fallback
 *   • onTourStopClick(stopId) — Remove-Toggle
 *
 * NV-only. FV-Mode instanziiert diesen Hook NICHT.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  nvPendingStore,
  SYNC_DEBOUNCE_MS,
  RE_INVALIDATE_DELAY_MS,
} from '../lib/useNvPendingStore';

export interface UseNvPendingSyncOptions {
  /** Aktiv ausgewählte NV-Tour (Pending-Pin-Target Priorität 1). */
  activeTourViewId: string | null;
  /** Map-Picker-Ziel (Pending-Pin-Target Priorität 2). */
  selectedTourId: string | null;
  /** Stop-Type für die batch-sync (PICKUP|DELIVERY). */
  mode: 'PICKUP' | 'DELIVERY';
  /** Pop-out-Map invalidate-Broadcast (optional). */
  popupChannel?: BroadcastChannel | null;
  /** Fallback wenn weder activeTourViewId noch selectedTourId gesetzt:
   *  Pin-Klick öffnet den Quick-Add-Modal mit dieser Shipment-ID. */
  setPinAddShipmentId: (id: string | null) => void;
  /** Banner-Setter für Capacity- + Sync-Fehler. */
  onError: (msg: string) => void;
}

export interface UseNvPendingSyncReturn {
  onPinClick: (shipmentId: string) => void;
  onTourStopClick: (stopId: string) => void;
  /** Manueller flush einer Tour (z.B. nach explicit-confirm). */
  flushSync: (tourId: string) => Promise<void>;
  /** Manueller Schedule (z.B. nach reorder oder bulk-add). */
  scheduleSync: (tourId: string) => void;
}

export function useNvPendingSync(
  opts: UseNvPendingSyncOptions,
): UseNvPendingSyncReturn {
  const {
    activeTourViewId,
    selectedTourId,
    mode,
    popupChannel,
    setPinAddShipmentId,
    onError,
  } = opts;
  const qc = useQueryClient();

  // Live-Refs für Callbacks ohne stale-Closures.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const popupChannelRef = useRef<BroadcastChannel | null>(popupChannel ?? null);
  popupChannelRef.current = popupChannel ?? null;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const setPinAddRef = useRef(setPinAddShipmentId);
  setPinAddRef.current = setPinAddShipmentId;

  // Timer-Maps (page-lokal äquivalent).
  const syncTimersRef = useRef<Map<string, number>>(new Map());
  const reInvalidateTimersRef = useRef<Map<string, number>>(new Map());

  const scheduleReInvalidateTouren = useCallback(
    (tourId: string) => {
      const existing = reInvalidateTimersRef.current.get(tourId);
      if (existing) window.clearTimeout(existing);
      const t = window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['nv-touren'] });
        try {
          popupChannelRef.current?.postMessage({ type: 'invalidate-touren' });
        } catch {
          /* ignore */
        }
        reInvalidateTimersRef.current.delete(tourId);
      }, RE_INVALIDATE_DELAY_MS);
      reInvalidateTimersRef.current.set(tourId, t);
    },
    [qc],
  );

  const flushSync = useCallback(
    async (tourId: string) => {
      const snapshot = nvPendingStore.flushPending(tourId);
      if (snapshot.adds.length === 0 && snapshot.removes.length === 0) return;
      syncTimersRef.current.delete(tourId);
      try {
        await api.post(`/nv-touren/${tourId}/batch-stops`, {
          adds: snapshot.adds,
          removes: snapshot.removes,
          stop_type: modeRef.current,
        });
        qc.invalidateQueries({ queryKey: ['nv-touren'] });
        try {
          popupChannelRef.current?.postMessage({ type: 'invalidate-touren' });
        } catch {
          /* ignore */
        }
        scheduleReInvalidateTouren(tourId);
      } catch (err: any) {
        nvPendingStore.restorePending(tourId, snapshot);
        const status = err?.response?.status;
        const code = err?.response?.data?.code;
        if (status === 409 && code === 'CAPACITY_EXCEEDED') {
          const axes = (err.response.data?.would_exceed ?? [])
            .map((w: any) => `${w.axis} (${w.total}/${w.max})`)
            .join(', ');
          onErrorRef.current(
            `Kapazität überschritten: ${axes || 'unbekannt'}`,
          );
        } else {
          onErrorRef.current(
            `Batch-Sync fehlgeschlagen (${status ?? '?'}). Pending erhalten — erneut klicken zum Retry.`,
          );
        }
      }
    },
    [qc, scheduleReInvalidateTouren],
  );

  const scheduleSync = useCallback(
    (tourId: string) => {
      const existing = syncTimersRef.current.get(tourId);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(
        () => flushSync(tourId),
        SYNC_DEBOUNCE_MS,
      );
      syncTimersRef.current.set(tourId, timer);
    },
    [flushSync],
  );

  // Tour-Switch Auto-Flush: bei Wechsel der activeTourViewId wird die
  // ALTE Tour sofort geflusht, bevor der lazy Timer feuert.
  const prevActiveTourIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevActiveTourIdRef.current;
    if (prev && prev !== activeTourViewId) {
      const t = syncTimersRef.current.get(prev);
      if (t) {
        window.clearTimeout(t);
        syncTimersRef.current.delete(prev);
      }
      void flushSync(prev);
    }
    prevActiveTourIdRef.current = activeTourViewId;
  }, [activeTourViewId, flushSync]);

  // Esc-Key: Pending verwerfen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && nvPendingStore.hasAny()) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName ?? '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        nvPendingStore.clearAll();
        for (const t of syncTimersRef.current.values()) window.clearTimeout(t);
        syncTimersRef.current.clear();
        for (const t of reInvalidateTimersRef.current.values())
          window.clearTimeout(t);
        reInvalidateTimersRef.current.clear();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Unmount: alle pending Timer abräumen.
  useEffect(() => {
    const syncTimers = syncTimersRef.current;
    const reInvalidateTimers = reInvalidateTimersRef.current;
    return () => {
      for (const t of syncTimers.values()) window.clearTimeout(t);
      syncTimers.clear();
      for (const t of reInvalidateTimers.values()) window.clearTimeout(t);
      reInvalidateTimers.clear();
    };
  }, []);

  const onPinClick = useCallback(
    (shipmentId: string) => {
      const targetTourId = activeTourViewId ?? selectedTourId;
      if (!targetTourId) {
        setPinAddRef.current(shipmentId);
        return;
      }
      nvPendingStore.togglePendingAdd(targetTourId, shipmentId);
      scheduleSync(targetTourId);
    },
    [activeTourViewId, selectedTourId, scheduleSync],
  );

  const onTourStopClick = useCallback(
    (stopId: string) => {
      if (!activeTourViewId) return;
      nvPendingStore.togglePendingRemove(activeTourViewId, stopId);
      scheduleSync(activeTourViewId);
    },
    [activeTourViewId, scheduleSync],
  );

  return { onPinClick, onTourStopClick, flushSync, scheduleSync };
}

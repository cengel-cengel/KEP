import { useMemo, useSyncExternalStore } from 'react';

/**
 * External UI-Store für Pending-Pin-Klicks.
 *
 * Pin-Klicks werden hier lokal gesammelt (debounced batch-sync läuft im
 * Parent). Das Store bleibt AUSSERHALB von Reacts Component-Tree, sodass
 * Mutationen NICHT zu einem Page-Wide-Re-Render führen. Komponenten die
 * Pending-State visuell brauchen subscriben über den Hook.
 */
export type PendingTour = { adds: Set<string>; removes: Set<string> };
export type PendingByTour = Map<string, PendingTour>;

class NvPendingStore {
  private state: PendingByTour = new Map();
  private listeners = new Set<() => void>();

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = (): PendingByTour => this.state;

  private emit() {
    for (const cb of this.listeners) cb();
  }

  private commit(
    tourId: string,
    adds: Set<string>,
    removes: Set<string>,
  ) {
    const next = new Map(this.state);
    if (adds.size === 0 && removes.size === 0) {
      next.delete(tourId);
    } else {
      next.set(tourId, { adds, removes });
    }
    this.state = next;
    this.emit();
  }

  togglePendingAdd = (tourId: string, shipmentId: string) => {
    const cur = this.state.get(tourId);
    const adds = new Set(cur?.adds);
    const removes = new Set(cur?.removes);
    if (adds.has(shipmentId)) adds.delete(shipmentId);
    else adds.add(shipmentId);
    this.commit(tourId, adds, removes);
  };

  togglePendingRemove = (tourId: string, stopId: string) => {
    const cur = this.state.get(tourId);
    const adds = new Set(cur?.adds);
    const removes = new Set(cur?.removes);
    if (removes.has(stopId)) removes.delete(stopId);
    else removes.add(stopId);
    this.commit(tourId, adds, removes);
  };

  flushPending = (
    tourId: string,
  ): { adds: string[]; removes: string[] } => {
    const cur = this.state.get(tourId);
    if (!cur) return { adds: [], removes: [] };
    const out = {
      adds: Array.from(cur.adds),
      removes: Array.from(cur.removes),
    };
    const next = new Map(this.state);
    next.delete(tourId);
    this.state = next;
    this.emit();
    return out;
  };

  restorePending = (
    tourId: string,
    snapshot: { adds: string[]; removes: string[] },
  ) => {
    if (snapshot.adds.length === 0 && snapshot.removes.length === 0) return;
    const cur = this.state.get(tourId);
    const adds = new Set(cur?.adds);
    const removes = new Set(cur?.removes);
    for (const a of snapshot.adds) adds.add(a);
    for (const r of snapshot.removes) removes.add(r);
    this.commit(tourId, adds, removes);
  };

  hasAny = () => this.state.size > 0;

  clearAll = () => {
    if (this.state.size === 0) return;
    this.state = new Map();
    this.emit();
  };
}

export const nvPendingStore = new NvPendingStore();

/**
 * Hook für Subscriber-Komponenten. Liefert die aggregierten Sets.
 * Re-rendert NUR die nutzende Komponente bei jeder Pending-Änderung.
 */
export function useNvPending() {
  const state = useSyncExternalStore(
    nvPendingStore.subscribe,
    nvPendingStore.getSnapshot,
    nvPendingStore.getSnapshot,
  );
  const pendingAddIds = useMemo(() => {
    const out = new Set<string>();
    for (const p of state.values()) for (const a of p.adds) out.add(a);
    return out;
  }, [state]);
  const pendingRemoveStopIds = useMemo(() => {
    const out = new Set<string>();
    for (const p of state.values()) for (const r of p.removes) out.add(r);
    return out;
  }, [state]);
  return { pendingAddIds, pendingRemoveStopIds };
}

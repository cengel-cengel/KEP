/**
 * C2-F: nvPendingStore API-Level Tests.
 *
 * Pure-API-Coverage (kein render, kein Provider). Tests:
 *  - togglePendingAdd: enqueue + toggle-off
 *  - togglePendingRemove: enqueue + toggle-off
 *  - flushPending: liefert Arrays + clear-Effekt
 *  - restorePending: idempotent re-add bei Rollback
 *  - hasAny / clearAll: Aggregate-State + Full-Clear
 *  - pending-merge: 2 Tours unabhängig, kein Cross-Leak
 *  - race-safe: subscribe→mutation→snapshot deterministic,
 *    Snapshot-Equality fails NUR bei Mutation (kein In-Place-Mutate
 *    auf alten Map → Component-Re-Render-Korrektheit garantiert).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nvPendingStore } from './useNvPendingStore';

beforeEach(() => {
  nvPendingStore.clearAll();
});

describe('nvPendingStore.togglePendingAdd', () => {
  it('enqueue 1 shipment → snapshot enthält tour mit add', () => {
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    const snap = nvPendingStore.getSnapshot();
    expect(snap.size).toBe(1);
    expect(snap.get('T1')?.adds.has('S-A')).toBe(true);
    expect(snap.get('T1')?.removes.size).toBe(0);
  });

  it('zweimal toggle SAME shipment → removed (set-Verhalten)', () => {
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    const snap = nvPendingStore.getSnapshot();
    // Adds wieder leer, removes leer → Tour-Entry komplett raus
    expect(snap.has('T1')).toBe(false);
  });

  it('multiple shipments akkumulieren in einer Tour', () => {
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    nvPendingStore.togglePendingAdd('T1', 'S-B');
    nvPendingStore.togglePendingAdd('T1', 'S-C');
    const snap = nvPendingStore.getSnapshot();
    expect(snap.get('T1')?.adds.size).toBe(3);
  });
});

describe('nvPendingStore.togglePendingRemove', () => {
  it('enqueue 1 stop-removal', () => {
    nvPendingStore.togglePendingRemove('T1', 'STOP-1');
    expect(nvPendingStore.getSnapshot().get('T1')?.removes.has('STOP-1')).toBe(true);
  });

  it('toggle removeOff → entry gone wenn adds auch leer', () => {
    nvPendingStore.togglePendingRemove('T1', 'STOP-1');
    nvPendingStore.togglePendingRemove('T1', 'STOP-1');
    expect(nvPendingStore.getSnapshot().has('T1')).toBe(false);
  });

  it('adds+removes koexistieren in einer Tour', () => {
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    nvPendingStore.togglePendingRemove('T1', 'STOP-1');
    const p = nvPendingStore.getSnapshot().get('T1');
    expect(p?.adds.size).toBe(1);
    expect(p?.removes.size).toBe(1);
  });
});

describe('nvPendingStore.flushPending', () => {
  it('liefert adds+removes als Arrays und clear-t den Tour-Entry', () => {
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    nvPendingStore.togglePendingAdd('T1', 'S-B');
    nvPendingStore.togglePendingRemove('T1', 'STOP-1');

    const out = nvPendingStore.flushPending('T1');
    expect(out.adds.sort()).toEqual(['S-A', 'S-B']);
    expect(out.removes).toEqual(['STOP-1']);

    // Nach flush ist der Tour-Entry weg.
    expect(nvPendingStore.getSnapshot().has('T1')).toBe(false);
  });

  it('flush auf leere Tour → {adds:[], removes:[]}, kein Throw', () => {
    const out = nvPendingStore.flushPending('NICHT-DA');
    expect(out).toEqual({ adds: [], removes: [] });
  });

  it('flush emit-t change-event nur wenn entry existierte', () => {
    const listener = vi.fn();
    const unsub = nvPendingStore.subscribe(listener);
    try {
      nvPendingStore.flushPending('NICHT-DA');
      // Kein emit (Implementation: flushPending fragt cur ab,
      // delete+emit nur bei vorhandenem entry).
      expect(listener).toHaveBeenCalledTimes(0);

      nvPendingStore.togglePendingAdd('T1', 'S-A');
      listener.mockClear();
      nvPendingStore.flushPending('T1');
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsub();
    }
  });
});

describe('nvPendingStore.restorePending (Rollback)', () => {
  it('re-added adds+removes nach optimistic-Mutate-Fehler', () => {
    // Simuliert: flush vor API-Call, restore nach Fehler.
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    nvPendingStore.togglePendingRemove('T1', 'STOP-1');
    const snapshot = nvPendingStore.flushPending('T1');
    expect(nvPendingStore.getSnapshot().has('T1')).toBe(false);

    nvPendingStore.restorePending('T1', snapshot);
    const p = nvPendingStore.getSnapshot().get('T1');
    expect(p?.adds.has('S-A')).toBe(true);
    expect(p?.removes.has('STOP-1')).toBe(true);
  });

  it('restore mit leeren snapshot → no-op (kein emit)', () => {
    const listener = vi.fn();
    const unsub = nvPendingStore.subscribe(listener);
    try {
      nvPendingStore.restorePending('T1', { adds: [], removes: [] });
      expect(listener).toHaveBeenCalledTimes(0);
      expect(nvPendingStore.getSnapshot().has('T1')).toBe(false);
    } finally {
      unsub();
    }
  });

  it('restore merged in existing pending (kein overwrite)', () => {
    nvPendingStore.togglePendingAdd('T1', 'S-NEU');
    nvPendingStore.restorePending('T1', { adds: ['S-A'], removes: ['STOP-1'] });
    const p = nvPendingStore.getSnapshot().get('T1');
    expect(p?.adds.has('S-NEU')).toBe(true);
    expect(p?.adds.has('S-A')).toBe(true);
    expect(p?.removes.has('STOP-1')).toBe(true);
  });
});

describe('nvPendingStore.hasAny + clearAll', () => {
  it('hasAny: false wenn empty, true wenn entry exists', () => {
    expect(nvPendingStore.hasAny()).toBe(false);
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    expect(nvPendingStore.hasAny()).toBe(true);
  });

  it('clearAll: leert state + emit', () => {
    const listener = vi.fn();
    const unsub = nvPendingStore.subscribe(listener);
    try {
      nvPendingStore.togglePendingAdd('T1', 'S-A');
      listener.mockClear();
      nvPendingStore.clearAll();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(nvPendingStore.hasAny()).toBe(false);
    } finally {
      unsub();
    }
  });

  it('clearAll: no-op wenn schon empty (kein emit)', () => {
    const listener = vi.fn();
    const unsub = nvPendingStore.subscribe(listener);
    try {
      nvPendingStore.clearAll();
      expect(listener).toHaveBeenCalledTimes(0);
    } finally {
      unsub();
    }
  });
});

describe('nvPendingStore — Multi-Tour Isolation', () => {
  it('2 Tours sind unabhängig (kein Cross-Leak)', () => {
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    nvPendingStore.togglePendingAdd('T2', 'S-B');
    const snap = nvPendingStore.getSnapshot();
    expect(snap.get('T1')?.adds.has('S-A')).toBe(true);
    expect(snap.get('T2')?.adds.has('S-B')).toBe(true);
    expect(snap.get('T1')?.adds.has('S-B')).toBe(false);

    // flush T1 → T2 unverändert. Alter snap ist immutable copy
    // (race-safe), neuer snap reflektiert flush.
    nvPendingStore.flushPending('T1');
    expect(snap.has('T1')).toBe(true); // alter snap unverändert
    const after = nvPendingStore.getSnapshot();
    expect(after.has('T1')).toBe(false);
    expect(after.get('T2')?.adds.has('S-B')).toBe(true);
  });
});

describe('nvPendingStore — Snapshot-Immutability (race-safe)', () => {
  it('getSnapshot returns NEW reference nach jeder Mutation', () => {
    const s1 = nvPendingStore.getSnapshot();
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    const s2 = nvPendingStore.getSnapshot();
    expect(s1).not.toBe(s2); // Reference-Change garantiert Re-Render
    expect(s1.has('T1')).toBe(false); // alte snap unverändert
    expect(s2.has('T1')).toBe(true);
  });

  it('getSnapshot stabil ohne Mutation (kein Re-Render-Storm)', () => {
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    const s1 = nvPendingStore.getSnapshot();
    const s2 = nvPendingStore.getSnapshot();
    expect(s1).toBe(s2); // Same reference → useSyncExternalStore bail-out
  });

  it('multiple subscribers werden alle benachrichtigt bei mutation', () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    const u1 = nvPendingStore.subscribe(a);
    const u2 = nvPendingStore.subscribe(b);
    const u3 = nvPendingStore.subscribe(c);
    try {
      nvPendingStore.togglePendingAdd('T1', 'S-A');
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      expect(c).toHaveBeenCalledTimes(1);
    } finally {
      u1();
      u2();
      u3();
    }
  });

  it('unsubscribed listener wird nicht mehr benachrichtigt', () => {
    const a = vi.fn();
    const unsub = nvPendingStore.subscribe(a);
    unsub();
    nvPendingStore.togglePendingAdd('T1', 'S-A');
    expect(a).toHaveBeenCalledTimes(0);
  });
});

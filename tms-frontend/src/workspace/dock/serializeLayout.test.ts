/**
 * D1: Tests fuer serializeLayout — Fokus auf stripFloatingGroups
 * (alte Snapshots mit Float-Groups laden ohne Crash).
 */
import { describe, expect, it } from 'vitest';
import type { SerializedDockview } from 'dockview';
import {
  deserializeLayout,
  LAYOUT_VERSION,
  serializeLayout,
  stripFloatingGroups,
} from './serializeLayout';

function minimalLayout(): SerializedDockview {
  // Minimale Form, die fromJSON akzeptieren wuerde — wir testen
  // hier nur die JSON-Schicht, kein dockview-Render.
  return {
    grid: {
      root: { type: 'branch', data: [], size: 0 },
      width: 1024,
      height: 768,
      orientation: 'HORIZONTAL' as const,
    },
    panels: {},
    activeGroup: undefined,
  } as unknown as SerializedDockview;
}

describe('serializeLayout — stripFloatingGroups', () => {
  it('entfernt floatingGroups, laesst Rest unangetastet', () => {
    const layout = {
      ...minimalLayout(),
      floatingGroups: [
        { data: { id: 'g1' }, position: { left: 10, top: 10, width: 300, height: 200 } },
      ],
    } as unknown as SerializedDockview;
    const out = stripFloatingGroups(layout);
    expect('floatingGroups' in out).toBe(false);
    expect(out.grid).toBe(layout.grid); // Identitaet erhalten (shallow copy)
    expect(out.panels).toBe(layout.panels);
  });

  it('no-op wenn floatingGroups fehlt', () => {
    const layout = minimalLayout();
    const out = stripFloatingGroups(layout);
    expect(out).toBe(layout); // same reference — kein Klon noetig
  });
});

describe('serializeLayout — round-trip', () => {
  it('serialize → deserialize liefert Layout zurueck', () => {
    const layout = minimalLayout();
    const raw = serializeLayout(layout);
    const back = deserializeLayout(raw);
    expect(back).not.toBeNull();
    expect(back?.grid).toEqual(layout.grid);
  });

  it('Version-Mismatch → null (Caller faellt auf Default zurueck)', () => {
    const raw = JSON.stringify({
      version: LAYOUT_VERSION - 1,
      layout: minimalLayout(),
    });
    expect(deserializeLayout(raw)).toBeNull();
  });

  it('kaputter JSON → null (kein throw)', () => {
    expect(deserializeLayout('{not-json')).toBeNull();
    expect(deserializeLayout('')).toBeNull();
  });

  it('alter Snapshot mit floatingGroups → entstrippt, kein Crash', () => {
    const layoutMitFloats = {
      ...minimalLayout(),
      floatingGroups: [{ data: { id: 'g-old' }, position: { left: 0, top: 0, width: 1, height: 1 } }],
    } as unknown as SerializedDockview;
    const raw = serializeLayout(layoutMitFloats);
    const back = deserializeLayout(raw);
    expect(back).not.toBeNull();
    expect('floatingGroups' in (back as object)).toBe(false);
  });
});

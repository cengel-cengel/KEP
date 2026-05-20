import { describe, expect, it, beforeEach } from 'vitest';
import {
  listSavedViews,
  saveView,
  deleteView,
  getActiveViewId,
  setActiveViewId,
  getSavedViewHydrated,
  _clearAllViews,
} from './savedViews';
import { DEFAULT_FILTER, DEFAULT_LAYOUT } from '../state/workspace';

function installLocalStorageMock() {
  const map = new Map<string, string>();
  (globalThis as any).window = (globalThis as any).window ?? {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
    clear: () => map.clear(),
  };
}

describe('savedViews', () => {
  beforeEach(() => {
    installLocalStorageMock();
    _clearAllViews();
  });

  it('listSavedViews leer initial', () => {
    expect(listSavedViews()).toEqual([]);
  });

  it('saveView + listSavedViews roundtrip', () => {
    const v = saveView({
      name: 'Morgen-Dispo',
      mode: 'nv',
      layout: { queueSize: 30 } as any,
    });
    expect(v.id).toBeTruthy();
    expect(v.created_at).toBeTruthy();
    const all = listSavedViews();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Morgen-Dispo');
    expect(all[0].mode).toBe('nv');
  });

  it('deleteView entfernt by id', () => {
    const v1 = saveView({ name: 'A', mode: 'nv', layout: {} });
    saveView({ name: 'B', mode: 'fv', layout: {} });
    deleteView(v1.id);
    const remaining = listSavedViews();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('B');
  });

  it('active-view CRUD', () => {
    expect(getActiveViewId()).toBeNull();
    setActiveViewId('view-1');
    expect(getActiveViewId()).toBe('view-1');
    setActiveViewId(null);
    expect(getActiveViewId()).toBeNull();
  });

  it('deleteView cleart active wenn match', () => {
    const v = saveView({ name: 'A', mode: 'nv', layout: {} });
    setActiveViewId(v.id);
    expect(getActiveViewId()).toBe(v.id);
    deleteView(v.id);
    expect(getActiveViewId()).toBeNull();
  });

  // W-3.2.B: Filter + Layout-Extension Tests
  it('saveView mit filter+layout roundtrip', () => {
    const v = saveView({
      name: 'Test-Filter',
      mode: 'nv',
      filter: { ...DEFAULT_FILTER, search: 'foo', tourStatuses: ['PLANNING'] },
      layout: { ...DEFAULT_LAYOUT, queueSize: 25 },
    });
    const hyd = getSavedViewHydrated(v.id);
    expect(hyd).not.toBeNull();
    expect(hyd!.filter.search).toBe('foo');
    expect(hyd!.filter.tourStatuses).toEqual(['PLANNING']);
    expect(hyd!.layout.queueSize).toBe(25);
  });

  it('Legacy-View (alte Layout-Names queueWidth+mapVisible) → mapped auf neue Names', () => {
    // Pre-W-3.2.B View shape (queueWidth statt queueSize,
    // mapVisible inverse von mapCollapsed)
    (globalThis as any).localStorage.setItem(
      'tms.savedViews',
      JSON.stringify([
        {
          id: 'legacy-1',
          name: 'Old',
          mode: 'fv',
          layout: { queueWidth: 35, mapVisible: false },
          created_at: '2026-01-01',
        },
      ]),
    );
    const hyd = getSavedViewHydrated('legacy-1');
    expect(hyd).not.toBeNull();
    expect(hyd!.filter).toEqual(DEFAULT_FILTER);
    // Legacy queueWidth → queueSize
    expect(hyd!.layout.queueSize).toBe(35);
    // Legacy mapVisible=false → mapCollapsed=true
    expect(hyd!.layout.mapCollapsed).toBe(true);
    expect(hyd!.layout.boardSize).toBe(DEFAULT_LAYOUT.boardSize);
    expect(hyd!.layout.mapSize).toBe(DEFAULT_LAYOUT.mapSize);
  });

  it('getSavedViewHydrated(unknown-id) → null', () => {
    expect(getSavedViewHydrated('does-not-exist')).toBeNull();
  });

  it('listSavedViews filtert invalid entries', () => {
    (globalThis as any).localStorage.setItem(
      'tms.savedViews',
      JSON.stringify([
        { id: 'ok', name: 'OK', mode: 'nv', layout: {} },
        { id: 'bad', name: 'No-mode' },
        { mode: 'fv' },
        'string-not-object',
      ]),
    );
    const all = listSavedViews();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('ok');
  });
});

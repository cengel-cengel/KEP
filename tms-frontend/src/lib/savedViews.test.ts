import { describe, expect, it, beforeEach } from 'vitest';
import {
  listSavedViews,
  saveView,
  deleteView,
  getActiveViewId,
  setActiveViewId,
  _clearAllViews,
} from './savedViews';

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
      layout: { queueWidth: 30 },
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

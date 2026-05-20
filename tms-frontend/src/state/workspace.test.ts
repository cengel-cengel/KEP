import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_FILTER,
  DEFAULT_LAYOUT,
  normalizeFilter,
  normalizeLayout,
  loadInitialFilter,
} from './workspace';

function installLocalStorageMock() {
  const map = new Map<string, string>();
  (globalThis as any).window = (globalThis as any).window ?? {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
    clear: () => map.clear(),
  };
  return map;
}

describe('normalizeFilter', () => {
  it('null → DEFAULT_FILTER shape', () => {
    expect(normalizeFilter(null)).toEqual(DEFAULT_FILTER);
  });

  it('invalid sort fällt auf "auto"', () => {
    const f = normalizeFilter({ sort: 'garbage' as any });
    expect(f.sort).toBe('auto');
  });

  it('invalid pickupMode fällt auf "PICKUP" default', () => {
    const f = normalizeFilter({ pickupMode: 'garbage' as any });
    expect(f.pickupMode).toBe('PICKUP');
  });

  it('valid pickupMode DELIVERY bleibt', () => {
    expect(normalizeFilter({ pickupMode: 'DELIVERY' }).pickupMode).toBe(
      'DELIVERY',
    );
  });

  it('tourStatuses filtert Non-Strings', () => {
    const f = normalizeFilter({
      tourStatuses: ['PLANNING', 123 as any, null as any, 'COMPLETED'],
    });
    expect(f.tourStatuses).toEqual(['PLANNING', 'COMPLETED']);
  });

  it('empty gebiet → undefined (nicht leerer String)', () => {
    const f = normalizeFilter({ gebiet: '' });
    expect(f.gebiet).toBeUndefined();
  });

  it('valid roundtrip', () => {
    const input: any = {
      search: 'foo',
      tourStatuses: ['PLANNING'],
      sort: 'date',
      gebiet: 'GE-01',
      pickupMode: 'DELIVERY',
    };
    const f = normalizeFilter(input);
    expect(f.search).toBe('foo');
    expect(f.sort).toBe('date');
    expect(f.gebiet).toBe('GE-01');
    expect(f.pickupMode).toBe('DELIVERY');
  });
});

describe('normalizeLayout', () => {
  it('null → DEFAULT_LAYOUT shape', () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it('clamping queueSize 15..50', () => {
    expect(normalizeLayout({ queueSize: 5 }).queueSize).toBe(15);
    expect(normalizeLayout({ queueSize: 80 }).queueSize).toBe(50);
    expect(normalizeLayout({ queueSize: 30 }).queueSize).toBe(30);
  });

  it('clamping boardSize 25..70', () => {
    expect(normalizeLayout({ boardSize: 10 }).boardSize).toBe(25);
    expect(normalizeLayout({ boardSize: 100 }).boardSize).toBe(70);
  });

  it('mapCollapsed default false außer explizit true', () => {
    expect(normalizeLayout({}).mapCollapsed).toBe(false);
    expect(normalizeLayout({ mapCollapsed: true }).mapCollapsed).toBe(true);
    expect(normalizeLayout({ mapCollapsed: undefined }).mapCollapsed).toBe(
      false,
    );
  });

  it('clamping mapSize 0..50', () => {
    expect(normalizeLayout({ mapSize: -5 }).mapSize).toBe(0);
    expect(normalizeLayout({ mapSize: 75 }).mapSize).toBe(50);
  });
});

describe('loadInitialFilter — Legacy-Migration', () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it('keine alten + keine neuen Keys → DEFAULT_FILTER + persistierte Migration', () => {
    const f = loadInitialFilter();
    expect(f).toEqual(DEFAULT_FILTER);
    const raw = localStorage.getItem('tms.workspace.filter');
    expect(raw).toBeTruthy();
  });

  it('fv.tree.sort=land + tour-statuses + nv-dispo.mode → migriert', () => {
    localStorage.setItem('fv.tree.sort', 'land');
    localStorage.setItem(
      'tms.nv-dispo.tour-statuses',
      JSON.stringify(['PLANNING', 'COMPLETED']),
    );
    localStorage.setItem('tms.nv-dispo.mode', 'DELIVERY');
    const f = loadInitialFilter();
    expect(f.sort).toBe('land');
    expect(f.tourStatuses).toEqual(['PLANNING', 'COMPLETED']);
    expect(f.pickupMode).toBe('DELIVERY');
    // Neuer Key wurde geschrieben
    const raw = JSON.parse(
      localStorage.getItem('tms.workspace.filter') ?? '{}',
    );
    expect(raw.sort).toBe('land');
    expect(raw.tourStatuses).toEqual(['PLANNING', 'COMPLETED']);
    expect(raw.pickupMode).toBe('DELIVERY');
    // Legacy-Keys bleiben unverändert (FE liest sie noch bis W-3.2.C)
    expect(localStorage.getItem('fv.tree.sort')).toBe('land');
    expect(localStorage.getItem('tms.nv-dispo.mode')).toBe('DELIVERY');
  });

  it('legacy DISPATCHED → IN_PROGRESS Migration', () => {
    localStorage.setItem(
      'tms.nv-dispo.tour-statuses',
      JSON.stringify(['PLANNING', 'DISPATCHED']),
    );
    const f = loadInitialFilter();
    expect(f.tourStatuses).toEqual(['PLANNING', 'IN_PROGRESS']);
  });

  it('pickupMode-Migration: PICKUP-default wenn nichts gesetzt', () => {
    const f = loadInitialFilter();
    expect(f.pickupMode).toBe('PICKUP');
  });

  it('neue Workspace-Filter Keys haben Vorrang vor Legacy', () => {
    localStorage.setItem(
      'tms.workspace.filter',
      JSON.stringify({
        ...DEFAULT_FILTER,
        sort: 'date',
        search: 'XYZ',
        pickupMode: 'DELIVERY',
      }),
    );
    localStorage.setItem('fv.tree.sort', 'land');
    localStorage.setItem('tms.nv-dispo.mode', 'PICKUP');
    const f = loadInitialFilter();
    expect(f.sort).toBe('date');
    expect(f.search).toBe('XYZ');
    expect(f.pickupMode).toBe('DELIVERY');
  });

  it('invalid JSON im neuen Key → fällt auf Legacy/Default zurück', () => {
    localStorage.setItem('tms.workspace.filter', '{not valid json');
    localStorage.setItem('fv.tree.sort', 'land');
    const f = loadInitialFilter();
    expect(f.sort).toBe('land');
  });
});

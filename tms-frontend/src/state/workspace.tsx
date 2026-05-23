/**
 * W-3.2.B Workspace-State-Layer (Hybrid-Spec).
 *
 * Zentraler Provider für die NV+FV-Dispo-Workspace-Page:
 *   - mode: 'nv' | 'fv'
 *   - datum: ISO YYYY-MM-DD
 *   - filter: search, gebiet, tourStatuses[], sort, pickupMode (NV-only)
 *   - layout: queueSize%, boardSize%, mapSize%, mapCollapsed
 *
 * Persistenz:
 *   localStorage 'tms.workspace.mode'
 *   localStorage 'tms.workspace.datum'
 *   localStorage 'tms.workspace.filter'   (JSON)
 *   localStorage 'tms.workspace.layout'   (JSON)
 *
 * Auto-Migration alter Keys (read-once auf erstem Provider-Mount,
 * write-once auf neuen Key — alte Keys bleiben lesbar bis W-3.2.C
 * die Pages refactored sind):
 *   'fv.tree.sort'              → filter.sort
 *   'tms.nv-dispo.tour-statuses'→ filter.tourStatuses
 *   'tms.nv-dispo.mode'         → filter.pickupMode
 *
 * URL-Sync:
 *   ?mode= ?datum= ?search= ?status= (comma-separated tourStatuses)
 *
 * Hooks:
 *   useWorkspace()         → komplettes Tuple
 *   useWorkspaceFilter()   → filter + setFilter
 *   useWorkspaceLayout()   → layout + setLayout
 *
 * Im W-3.2.B konsumiert NUR WorkspacePage.mode den Provider —
 * NvDispoPage/FvDispoPage behalten lokalen State bis W-3.2.C
 * Panel-Extract.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthOptional } from '../store/auth';

export type WorkspaceMode = 'nv' | 'fv';
export type WorkspaceSort = 'auto' | 'date' | 'land';
export type NvPickupMode = 'PICKUP' | 'DELIVERY';

export interface WorkspaceFilter {
  search: string;
  gebiet?: string;
  tourStatuses: string[];
  sort: WorkspaceSort;
  /** NV-only Stop-Mode (PICKUP|DELIVERY). FV ignoriert. */
  pickupMode: NvPickupMode;
}

export interface WorkspaceLayout {
  /** Queue-Pane % der Workspace-Breite (15..50). */
  queueSize: number;
  /** Board-Pane % der Workspace-Breite (25..70). */
  boardSize: number;
  /** Map-Pane % der Workspace-Breite (0..50). */
  mapSize: number;
  /** Map-Pane eingeklappt? Default false (sichtbar). */
  mapCollapsed: boolean;
}

export interface WorkspaceState {
  mode: WorkspaceMode;
  datum: string;
  filter: WorkspaceFilter;
  layout: WorkspaceLayout;
}

export interface WorkspaceContextValue {
  mode: WorkspaceMode;
  datum: string;
  filter: WorkspaceFilter;
  layout: WorkspaceLayout;
  setMode: (m: WorkspaceMode) => void;
  setDatum: (iso: string) => void;
  setFilter: (next: Partial<WorkspaceFilter>) => void;
  resetFilter: () => void;
  setLayout: (next: Partial<WorkspaceLayout>) => void;
  /**
   * A' Sprint: selectedStopId — bidirektionale Hervorhebung
   * MapPanel-Marker ↔ TourDetailsTab-Stop-Row.
   * Nicht persistiert (Session-State). NICHT in snapshot/restore
   * (UI-Selection, kein User-Setting).
   */
  selectedStopId: string | null;
  setSelectedStopId: (id: string | null) => void;
  /** Komplettes State-Snapshot (für SavedView-Persistenz). */
  snapshot: () => WorkspaceState;
  /** Restore aus SavedView-Snapshot. */
  restore: (s: Pick<WorkspaceState, 'mode' | 'filter' | 'layout'>) => void;
}

const KEY_MODE = 'tms.workspace.mode';
const KEY_DATUM = 'tms.workspace.datum';
const KEY_FILTER = 'tms.workspace.filter';
const KEY_LAYOUT = 'tms.workspace.layout';

/** Alte Keys (read-only Auto-Migration). */
const LEGACY_KEY_SORT = 'fv.tree.sort';
const LEGACY_KEY_NV_STATUSES = 'tms.nv-dispo.tour-statuses';
const LEGACY_KEY_NV_PICKUP_MODE = 'tms.nv-dispo.mode';

export const DEFAULT_FILTER: WorkspaceFilter = {
  search: '',
  gebiet: undefined,
  tourStatuses: [],
  sort: 'auto',
  pickupMode: 'PICKUP',
};

export const DEFAULT_LAYOUT: WorkspaceLayout = {
  queueSize: 30,
  boardSize: 40,
  mapSize: 30,
  mapCollapsed: false,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed != null ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota/SSR — silent */
  }
}

function readString(key: string, fallback: string | null = null): string | null {
  if (typeof window === 'undefined') return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function normalizeFilter(
  f: Partial<WorkspaceFilter> | null | undefined,
): WorkspaceFilter {
  const sortRaw = f?.sort;
  const sort: WorkspaceSort =
    sortRaw === 'date' || sortRaw === 'land' || sortRaw === 'auto'
      ? sortRaw
      : 'auto';
  const pickupRaw = f?.pickupMode;
  const pickupMode: NvPickupMode =
    pickupRaw === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
  return {
    search: typeof f?.search === 'string' ? f.search : '',
    gebiet: typeof f?.gebiet === 'string' && f.gebiet ? f.gebiet : undefined,
    tourStatuses: Array.isArray(f?.tourStatuses)
      ? f.tourStatuses.filter((x) => typeof x === 'string')
      : [],
    sort,
    pickupMode,
  };
}

export function normalizeLayout(
  l: Partial<WorkspaceLayout> | null | undefined,
): WorkspaceLayout {
  return {
    queueSize: clamp(Number(l?.queueSize ?? DEFAULT_LAYOUT.queueSize), 15, 50),
    boardSize: clamp(Number(l?.boardSize ?? DEFAULT_LAYOUT.boardSize), 25, 70),
    mapSize: clamp(Number(l?.mapSize ?? DEFAULT_LAYOUT.mapSize), 0, 50),
    mapCollapsed: l?.mapCollapsed === true,
  };
}

export function loadInitialFilter(): WorkspaceFilter {
  const f = readJson<Partial<WorkspaceFilter> | null>(KEY_FILTER, null);
  if (f != null) return normalizeFilter(f);

  // Legacy-Migration (read-once, write-new):
  const legacySort = readString(LEGACY_KEY_SORT);
  const legacyStatusesRaw = readString(LEGACY_KEY_NV_STATUSES);
  const legacyPickup = readString(LEGACY_KEY_NV_PICKUP_MODE);
  let legacyStatuses: string[] = [];
  if (legacyStatusesRaw) {
    try {
      const arr = JSON.parse(legacyStatusesRaw);
      if (Array.isArray(arr)) {
        legacyStatuses = arr
          .filter((x: unknown) => typeof x === 'string')
          .map((v: string) => (v === 'DISPATCHED' ? 'IN_PROGRESS' : v));
      }
    } catch {
      /* ignore */
    }
  }
  const migrated: WorkspaceFilter = {
    ...DEFAULT_FILTER,
    sort:
      legacySort === 'auto' || legacySort === 'date' || legacySort === 'land'
        ? legacySort
        : 'auto',
    tourStatuses: legacyStatuses,
    pickupMode: legacyPickup === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
  };
  // Persist auto-migrated state, alte Keys werden NICHT gelöscht
  // (FvShipmentTree / NvDispoPage lesen sie noch bis W-3.2.C).
  writeJson(KEY_FILTER, migrated);
  return migrated;
}

function loadInitialLayout(): WorkspaceLayout {
  const l = readJson<Partial<WorkspaceLayout> | null>(KEY_LAYOUT, null);
  return normalizeLayout(l);
}

function loadInitialMode(): WorkspaceMode {
  const raw = readString(KEY_MODE);
  return raw === 'fv' ? 'fv' : 'nv';
}

function loadInitialDatum(): string {
  const raw = readString(KEY_DATUM);
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return todayIso();
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  // Fix-C: Bei ausgeloggtem User darf der URL-Sync NICHT laufen,
  // sonst überschreibt setParams (replace) den PrivateRoute-Navigate
  // zu /login und die App landet auf "/?mode=nv&datum=..." → weiße
  // Seite. WorkspaceProvider ist innerhalb AuthProvider gemountet
  // (siehe main.tsx).
  // useAuthOptional: Render-Tests mounten WorkspaceProvider ggf.
  // ohne AuthProvider — Fallback liefert isAuthenticated=true,
  // damit der URL-Sync dort wie zuvor läuft.
  const { isAuthenticated } = useAuthOptional();
  const [mode, setModeState] = useState<WorkspaceMode>(() => {
    const url = params.get('mode');
    if (url === 'fv' || url === 'nv') return url;
    return loadInitialMode();
  });
  const [datum, setDatumState] = useState<string>(() => {
    const url = params.get('datum');
    if (url && /^\d{4}-\d{2}-\d{2}$/.test(url)) return url;
    return loadInitialDatum();
  });
  const [filter, setFilterState] = useState<WorkspaceFilter>(() => {
    const init = loadInitialFilter();
    const urlSearch = params.get('search');
    const urlStatus = params.get('status');
    if (urlSearch != null || urlStatus != null) {
      return {
        ...init,
        search: urlSearch ?? init.search,
        tourStatuses: urlStatus
          ? urlStatus.split(',').map((s) => s.trim()).filter(Boolean)
          : init.tourStatuses,
      };
    }
    return init;
  });
  const [layout, setLayoutState] = useState<WorkspaceLayout>(loadInitialLayout);
  // A' Sprint: selectedStopId — Session-only, nicht persistiert.
  const [selectedStopId, setSelectedStopIdState] = useState<string | null>(
    null,
  );

  // Persistenz
  useEffect(() => {
    try {
      localStorage.setItem(KEY_MODE, mode);
    } catch {
      /* silent */
    }
  }, [mode]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY_DATUM, datum);
    } catch {
      /* silent */
    }
  }, [datum]);
  useEffect(() => {
    writeJson(KEY_FILTER, filter);
  }, [filter]);
  useEffect(() => {
    writeJson(KEY_LAYOUT, layout);
  }, [layout]);

  // URL-Sync (replace, kein push — kein History-Spam):
  // Fix-C: skip wenn !isAuthenticated, sonst überschreibt setParams
  // den PrivateRoute-Navigate zu /login (Auth-Redirect-Bug).
  const lastUrlRef = useRef<string>('');
  useEffect(() => {
    if (!isAuthenticated) return;
    const next = new URLSearchParams(params);
    next.set('mode', mode);
    next.set('datum', datum);
    if (filter.search) next.set('search', filter.search);
    else next.delete('search');
    if (filter.tourStatuses.length > 0)
      next.set('status', filter.tourStatuses.join(','));
    else next.delete('status');
    const str = next.toString();
    if (str !== lastUrlRef.current) {
      lastUrlRef.current = str;
      setParams(next, { replace: true });
    }
  }, [
    mode,
    datum,
    filter.search,
    filter.tourStatuses,
    params,
    setParams,
    isAuthenticated,
  ]);

  const setMode = useCallback((m: WorkspaceMode) => setModeState(m), []);
  const setDatum = useCallback((iso: string) => setDatumState(iso), []);
  const setSelectedStopId = useCallback(
    (id: string | null) => setSelectedStopIdState(id),
    [],
  );

  const setFilter = useCallback((next: Partial<WorkspaceFilter>) => {
    setFilterState((prev) => normalizeFilter({ ...prev, ...next }));
  }, []);
  const resetFilter = useCallback(() => setFilterState(DEFAULT_FILTER), []);

  const setLayout = useCallback((next: Partial<WorkspaceLayout>) => {
    setLayoutState((prev) => normalizeLayout({ ...prev, ...next }));
  }, []);

  const snapshot = useCallback(
    (): WorkspaceState => ({ mode, datum, filter, layout }),
    [mode, datum, filter, layout],
  );

  const restore = useCallback(
    (s: Pick<WorkspaceState, 'mode' | 'filter' | 'layout'>) => {
      setModeState(s.mode);
      setFilterState(normalizeFilter(s.filter));
      setLayoutState(normalizeLayout(s.layout));
    },
    [],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      mode,
      datum,
      filter,
      layout,
      setMode,
      setDatum,
      setFilter,
      resetFilter,
      setLayout,
      selectedStopId,
      setSelectedStopId,
      snapshot,
      restore,
    }),
    [
      mode,
      datum,
      filter,
      layout,
      setMode,
      setDatum,
      setFilter,
      resetFilter,
      setLayout,
      selectedStopId,
      setSelectedStopId,
      snapshot,
      restore,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

export function useWorkspaceFilter(): {
  filter: WorkspaceFilter;
  setFilter: (next: Partial<WorkspaceFilter>) => void;
  resetFilter: () => void;
} {
  const { filter, setFilter, resetFilter } = useWorkspace();
  return { filter, setFilter, resetFilter };
}

export function useWorkspaceLayout(): {
  layout: WorkspaceLayout;
  setLayout: (next: Partial<WorkspaceLayout>) => void;
} {
  const { layout, setLayout } = useWorkspace();
  return { layout, setLayout };
}

/** Convenience: nur den Mode. */
export function useWorkspaceMode(): {
  mode: WorkspaceMode;
  setMode: (m: WorkspaceMode) => void;
} {
  const { mode, setMode } = useWorkspace();
  return { mode, setMode };
}

// Test-Helper (kein public API).
export function _resetWorkspaceStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY_MODE);
    localStorage.removeItem(KEY_DATUM);
    localStorage.removeItem(KEY_FILTER);
    localStorage.removeItem(KEY_LAYOUT);
  } catch {
    /* noop */
  }
}

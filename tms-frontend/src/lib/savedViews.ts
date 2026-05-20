/**
 * W-3 Saved Views — Mode + Filter + Layout-Preset.
 *
 * W-3.2.B Erweiterung: SavedView speichert jetzt zusätzlich
 *   - filter: WorkspaceFilter (search, status[], sort, ...)
 *   - layout: WorkspaceLayout (queueWidth%, boardWidth%, mapVisible, mapWidth%)
 *
 * Backward-Compat: alte Views (vor W-3.2.B) ohne filter/layout-Felder
 * werden via Default-Werte ergänzt — kein migrate-write nötig.
 *
 * Persistence: localStorage 'tms.savedViews' = Array<SavedView>
 *              localStorage 'tms.workspace.activeView' = id|null
 */
import type {
  WorkspaceFilter,
  WorkspaceLayout,
  WorkspaceMode,
} from '../state/workspace';
import { DEFAULT_FILTER, DEFAULT_LAYOUT } from '../state/workspace';

export type { WorkspaceMode };

/**
 * @deprecated W-3.2.B — Layout wandert in workspace.tsx (WorkspaceLayout).
 * Legacy-Shape: { queueWidth?, mapVisible? } — wird in normalizeLayout
 * automatisch auf neue Field-Namen gemapped (queueSize/mapCollapsed).
 */
export interface SavedViewLayout {
  queueWidth?: number;
  mapVisible?: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  mode: WorkspaceMode;
  /** W-3.2.B: optional, default DEFAULT_FILTER für alte Views. */
  filter?: WorkspaceFilter;
  /** Layout-Preset. Legacy-Shape (queueWidth?, mapVisible?) bleibt
   * lesbar — W-3.2.B fügt boardWidth + mapWidth hinzu. */
  layout: WorkspaceLayout | SavedViewLayout;
  created_at: string;
}

const STORAGE_KEY = 'tms.savedViews';
const ACTIVE_KEY = 'tms.workspace.activeView';

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalisiert Legacy-Layout-Shape auf vollständige WorkspaceLayout.
 * Liest sowohl alte Names (queueWidth/mapVisible) als auch
 * neue Names (queueSize/mapCollapsed) für Backward-Compat.
 */
function normalizeLayout(l: SavedView['layout']): WorkspaceLayout {
  const anyL = l as Partial<WorkspaceLayout> & Partial<SavedViewLayout> & {
    boardSize?: number;
    mapSize?: number;
  };
  const queueSize =
    typeof anyL.queueSize === 'number'
      ? anyL.queueSize
      : typeof anyL.queueWidth === 'number'
        ? anyL.queueWidth
        : DEFAULT_LAYOUT.queueSize;
  const boardSize =
    typeof anyL.boardSize === 'number' ? anyL.boardSize : DEFAULT_LAYOUT.boardSize;
  const mapSize =
    typeof anyL.mapSize === 'number' ? anyL.mapSize : DEFAULT_LAYOUT.mapSize;
  // mapCollapsed = inverse von mapVisible (Legacy default mapVisible=true → mapCollapsed=false)
  const mapCollapsed =
    typeof anyL.mapCollapsed === 'boolean'
      ? anyL.mapCollapsed
      : anyL.mapVisible === false;
  return { queueSize, boardSize, mapSize, mapCollapsed };
}

export function listSavedViews(): SavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (v) =>
        v &&
        typeof v.id === 'string' &&
        typeof v.name === 'string' &&
        (v.mode === 'nv' || v.mode === 'fv'),
    );
  } catch {
    return [];
  }
}

/** Liefert View mit hydratisiertem filter+layout (Defaults für Legacy). */
export function getSavedViewHydrated(id: string): {
  id: string;
  name: string;
  mode: WorkspaceMode;
  filter: WorkspaceFilter;
  layout: WorkspaceLayout;
  created_at: string;
} | null {
  const v = listSavedViews().find((x) => x.id === id);
  if (!v) return null;
  return {
    id: v.id,
    name: v.name,
    mode: v.mode,
    filter: v.filter ?? DEFAULT_FILTER,
    layout: normalizeLayout(v.layout),
    created_at: v.created_at,
  };
}

export function saveView(input: Omit<SavedView, 'id' | 'created_at'>): SavedView {
  const view: SavedView = {
    id: genId(),
    name: input.name,
    mode: input.mode,
    filter: input.filter,
    layout: input.layout,
    created_at: new Date().toISOString(),
  };
  const list = listSavedViews();
  list.push(view);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota — silent */
  }
  return view;
}

export function deleteView(id: string): void {
  const list = listSavedViews().filter((v) => v.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* silent */
  }
  if (getActiveViewId() === id) clearActiveView();
}

export function getActiveViewId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveViewId(id: string | null): void {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* silent */
  }
}

export function clearActiveView(): void {
  setActiveViewId(null);
}

/** Test-Helper. */
export function _clearAllViews(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* noop */
  }
}

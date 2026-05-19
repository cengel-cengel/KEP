/**
 * W-3 Saved Views — Mode + Layout-Preset.
 *
 * Filter-State liegt aktuell in NvDispositionPage-local-state
 * (eigener Refactor-Sprint W-3.2). W-3 speichert NUR:
 *   - mode: 'nv' | 'fv'
 *   - layout: { queueWidth?, mapVisible? }
 *
 * Persistence: localStorage 'tms.savedViews' = Array<SavedView>
 *              localStorage 'tms.workspace.activeView' = id|null
 */

export type WorkspaceMode = 'nv' | 'fv';

export interface SavedViewLayout {
  queueWidth?: number;    // percentage 20-80
  mapVisible?: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  mode: WorkspaceMode;
  layout: SavedViewLayout;
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

export function saveView(input: Omit<SavedView, 'id' | 'created_at'>): SavedView {
  const view: SavedView = {
    id: genId(),
    name: input.name,
    mode: input.mode,
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

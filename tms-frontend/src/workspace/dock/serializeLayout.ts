/**
 * S-2a/S-3a Layout-Serialisation.
 *
 * Versionierter Wrapper um SerializedDockview damit zukünftige
 * Format-Changes via Version-Bump migriert (oder verworfen)
 * werden können.
 *
 * S-3a: localStorage-Persistence aktiviert. EIN Layout, workspace-
 * weit, Key 'tms.workspace.docklayout'.
 * S-3b: Backend + benannte Layouts + pro-mode.
 */
import type { DockviewApi, SerializedDockview } from 'dockview';

// S-2b: Bump von 1 → 2, weil das Default-Layout jetzt 4 Panels
// (loadingPlan kam als Tab dazu). Alte v1-Layouts haben den View
// nicht → Version-Mismatch fällt auf Default zurück, User sieht
// den neuen Tab sofort. Trade-off: einmaliger Layout-Reset für
// Bestands-User. OK in dieser Sprint-Phase.
export const LAYOUT_VERSION = 2;
export const LAYOUT_STORAGE_KEY = 'tms.workspace.docklayout';

export interface VersionedLayout {
  version: number;
  layout: SerializedDockview;
}

export function serializeLayout(layout: SerializedDockview): string {
  const wrapped: VersionedLayout = { version: LAYOUT_VERSION, layout };
  return JSON.stringify(wrapped);
}

export function deserializeLayout(raw: string): SerializedDockview | null {
  try {
    const parsed = JSON.parse(raw) as Partial<VersionedLayout>;
    if (parsed?.version !== LAYOUT_VERSION) {
      // Format-Mismatch → null, Caller fällt auf Default zurück.
      return null;
    }
    if (!parsed.layout) return null;
    return stripFloatingGroups(parsed.layout);
  } catch {
    return null;
  }
}

/**
 * D1: Float wurde komplett deaktiviert (disableFloatingGroups=true).
 * Alte localStorage- oder Backend-Snapshots koennen weiterhin
 * `floatingGroups` enthalten. dockview's fromJSON wuerde die zwar
 * verarbeiten, sich aber bei deaktiviertem Float widerspruechlich
 * verhalten — wir strippen das Feld defensiv. Die Panels in einer
 * floating-Group sind ueblicherweise auch im Grid referenziert
 * (Restore-Pfad), daher kein Datenverlust am Panel-Set.
 *
 * Belt+Suspenders: onReady-try/catch faengt zusaetzlich jeden
 * fromJSON-Crash und faellt auf das Default-Layout zurueck.
 */
export function stripFloatingGroups(
  layout: SerializedDockview,
): SerializedDockview {
  if (!('floatingGroups' in layout)) return layout;
  // Shallow copy + delete; layout-Tree (grid/panels/activeGroup)
  // bleibt unangetastet.
  const copy = { ...layout } as SerializedDockview & {
    floatingGroups?: unknown;
  };
  delete copy.floatingGroups;
  return copy;
}

/**
 * S-3a: localStorage-Wrapper. Defensiv (try/catch) — korruptes
 * Storage / disabled-LS / SSR darf nichts brechen.
 */
export function loadStoredLayout(): SerializedDockview | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    return deserializeLayout(raw);
  } catch {
    return null;
  }
}

export function storeLayout(api: DockviewApi): void {
  if (typeof window === 'undefined') return;
  try {
    const json = api.toJSON();
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(json));
  } catch {
    /* silent — Storage voll/disabled/Serialisierung-Fehler */
  }
}

export function clearStoredLayout(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    /* silent */
  }
}

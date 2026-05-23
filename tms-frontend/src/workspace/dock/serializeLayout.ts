/**
 * S-2a Layout-Serialisation Wrapper (in S-3 für Persistence genutzt).
 *
 * Versioniert wrapper um SerializedDockview damit zukünftige
 * Format-Changes via version-Bump migriert werden können.
 *
 * Aktueller Status: angelegt, in S-2a ungenutzt. DockRuntime lädt
 * stattdessen buildDefaultLayout() bei jedem Mount.
 */
import type { SerializedDockview } from 'dockview';

export const LAYOUT_VERSION = 1;

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
    return parsed.layout;
  } catch {
    return null;
  }
}

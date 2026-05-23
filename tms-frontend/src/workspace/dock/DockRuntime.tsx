/**
 * S-2a DockRuntime — DockviewReact-Wrapper.
 *
 * Lädt buildDefaultLayout() bei Mount via api.fromJSON.
 * defaultRenderer='always' GLOBAL: alle Panels (Queue/Board/Map)
 * bleiben gemountet auch wenn nicht im aktiven Tab/Move. Damit
 * überlebt die Leaflet-Map-Instanz Tab-Wechsel + Layout-Moves
 * (s. Spike-Befund: dockview-OverlayRenderContainer hält Panels
 * in einem parallelen absolut-positionierten Container, Move =
 * CSS-Position-Update, kein DOM-Reparenting).
 *
 * S-2a-Scope:
 *   - 3 Spalten Queue | Board | Map (Größen aus DEFAULT_LAYOUT)
 *   - KEIN Persist (S-3)
 *   - KEINE Tabs (entstehen in S-4 via Move/Add)
 *   - KEIN Map-Collapse (Parität später)
 *
 * Style: 'dockview-theme-light' import. Container ist h-full,
 * verbraucht den verbleibenden Platz unter Banner/QuickAddBar/
 * TopBar in WorkspacePage.
 */
import { useCallback } from 'react';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import DockPanelWrapper from './DockPanelWrapper';
import { buildDefaultLayout } from './layoutDefaults';

const components: Record<string, React.FC<IDockviewPanelProps>> = {
  panel: DockPanelWrapper,
};

export default function DockRuntime() {
  const onReady = useCallback((event: DockviewReadyEvent) => {
    event.api.fromJSON(buildDefaultLayout());
  }, []);

  return (
    <DockviewReact
      components={components}
      defaultRenderer="always"
      onReady={onReady}
      className="dockview-theme-light h-full w-full"
    />
  );
}

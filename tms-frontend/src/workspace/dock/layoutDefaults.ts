/**
 * S-2a Layout-Defaults für DockRuntime.
 *
 * Initial-Aufbau: 3 Spalten Queue | Board | Map.
 * Spalten-Größen aus state/workspace.tsx DEFAULT_LAYOUT
 * (queueSize/boardSize/mapSize), damit der visuelle Start-
 * Zustand identisch zur alten react-resizable-panels-Version ist.
 *
 * Wird via DockviewApi.fromJSON(layout) geladen — Format =
 * SerializedDockview von dockview-core.
 *
 * Hinweis: dockview's "width" hier ist relative-flexGrow je
 * Spalte. Wir spiegeln die % aus DEFAULT_LAYOUT direkt
 * (queueSize=30 → width:30 etc.) — dockview normalisiert intern.
 */
import type { SerializedDockview } from 'dockview';
import { DEFAULT_LAYOUT } from '../../state/workspace';
import { PANEL_REGISTRY, type PanelId } from './panelRegistry';

const PANEL_ORDER: PanelId[] = ['queue', 'board', 'map'];

function panelState(id: PanelId) {
  return {
    id,
    contentComponent: 'panel',
    params: { panelId: id },
    title: PANEL_REGISTRY[id].title,
  };
}

/**
 * Initial-Layout: 3 horizontale Spalten, je 1 Panel.
 * Sizes proportional zu DEFAULT_LAYOUT.
 */
export function buildDefaultLayout(): SerializedDockview {
  const sizes = [
    DEFAULT_LAYOUT.queueSize,
    DEFAULT_LAYOUT.boardSize,
    DEFAULT_LAYOUT.mapSize,
  ];
  const total = sizes.reduce((a, b) => a + b, 0) || 100;

  // dockview Grid-Tree: HORIZONTAL root mit 3 leaf-Groups,
  // jede Group enthält 1 Panel.
  return {
    grid: {
      orientation: 'HORIZONTAL' as any,
      width: 1200,
      height: 800,
      root: {
        type: 'branch',
        data: PANEL_ORDER.map((id, i) => ({
          type: 'leaf' as const,
          size: sizes[i],
          data: {
            views: [id],
            id: `group-${id}`,
            activeView: id,
          },
        })),
        size: total,
      },
    },
    panels: Object.fromEntries(
      PANEL_ORDER.map((id) => [id, panelState(id)]),
    ),
    activeGroup: 'group-board',
  };
}

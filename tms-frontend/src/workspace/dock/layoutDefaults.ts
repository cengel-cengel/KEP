/**
 * S-2a/S-2b Layout-Defaults für DockRuntime.
 *
 * Initial-Aufbau: 3 Spalten Queue | Board | (Map+Beladeplan-Tabs).
 * Spalten-Größen aus state/workspace.tsx DEFAULT_LAYOUT
 * (queueSize/boardSize/mapSize), damit der visuelle Start-
 * Zustand identisch zur alten react-resizable-panels-Version ist.
 *
 * S-2b: 4. Panel "Beladeplan" als TAB in der rechten Spalte neben
 *   "Karte" (eine Group, zwei Views). Default-Active = Karte.
 *   User wechselt per Tab-Click; defaultRenderer='always' hält
 *   beide gemountet (Leaflet-Map + 3D-Canvas überleben Wechsel).
 *
 * Wird via DockviewApi.fromJSON(layout) geladen — Format =
 * SerializedDockview von dockview-core.
 *
 * Hinweis: dockview's "size" hier ist relative-flexGrow je
 * Spalte. Wir spiegeln die % aus DEFAULT_LAYOUT direkt — dockview
 * normalisiert intern.
 */
import type { SerializedDockview } from 'dockview';
import { DEFAULT_LAYOUT } from '../../state/workspace';
import { PANEL_REGISTRY, type PanelId } from './panelRegistry';

function panelState(id: PanelId) {
  return {
    id,
    contentComponent: 'panel',
    params: { panelId: id },
    title: PANEL_REGISTRY[id].title,
  };
}

/**
 * Initial-Layout: 3 horizontale Spalten.
 *   1: Queue          (1 Panel)
 *   2: Board          (1 Panel)
 *   3: Map+Beladeplan (Tab-Group, default Map aktiv)
 * Sizes proportional zu DEFAULT_LAYOUT.
 */
export function buildDefaultLayout(): SerializedDockview {
  const sizes = [
    DEFAULT_LAYOUT.queueSize,
    DEFAULT_LAYOUT.boardSize,
    DEFAULT_LAYOUT.mapSize,
  ];
  const total = sizes.reduce((a, b) => a + b, 0) || 100;

  return {
    grid: {
      orientation: 'HORIZONTAL' as any,
      width: 1200,
      height: 800,
      root: {
        type: 'branch',
        data: [
          {
            type: 'leaf' as const,
            size: sizes[0],
            data: {
              views: ['queue'],
              id: 'group-queue',
              activeView: 'queue',
            },
          },
          {
            type: 'leaf' as const,
            size: sizes[1],
            data: {
              views: ['board'],
              id: 'group-board',
              activeView: 'board',
            },
          },
          {
            type: 'leaf' as const,
            size: sizes[2],
            data: {
              views: ['map', 'loadingPlan'],
              id: 'group-right',
              activeView: 'map',
            },
          },
        ],
        size: total,
      },
    },
    panels: {
      queue: panelState('queue'),
      board: panelState('board'),
      map: panelState('map'),
      loadingPlan: panelState('loadingPlan'),
    },
    activeGroup: 'group-board',
  };
}

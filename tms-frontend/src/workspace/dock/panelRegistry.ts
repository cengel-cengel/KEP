/**
 * S-2a Dock-Panel-Registry.
 *
 * Maps Panel-Type-String → React-Component + Display-Title.
 * dockview.components erwartet Record<string, FC<IDockviewPanelProps>>.
 * DockPanelWrapper rendert die Component (= unsere Workspace-Panels,
 * die State via Hooks aus WorkspaceRuntimeContext lesen).
 *
 * Title wird in der Tab-Leiste angezeigt (dockview rendert eigene
 * Tab-Komponenten; wir liefern den Titel via Panel-params).
 */
import type { ComponentType } from 'react';
import QueuePanel from '../../components/workspace/QueuePanel';
import BoardPanel from '../../components/workspace/BoardPanel';
import MapPanel from '../../components/workspace/MapPanel';
import DetailPanel from './DetailPanel';
import LoadingPlanPanel from './LoadingPlanPanel';

export type PanelId = 'queue' | 'board' | 'map' | 'loadingPlan' | 'detail';

export interface PanelRegistryEntry {
  id: PanelId;
  title: string;
  component: ComponentType;
}

export const PANEL_REGISTRY: Record<PanelId, PanelRegistryEntry> = {
  queue: {
    id: 'queue',
    title: 'Eingang',
    component: QueuePanel,
  },
  board: {
    id: 'board',
    title: 'Touren',
    component: BoardPanel,
  },
  map: {
    id: 'map',
    title: 'Karte',
    component: MapPanel,
  },
  loadingPlan: {
    id: 'loadingPlan',
    title: 'Beladeplan',
    component: LoadingPlanPanel,
  },
  detail: {
    id: 'detail',
    title: 'Detail',
    component: DetailPanel,
  },
};

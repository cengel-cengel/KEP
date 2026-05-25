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
 *
 * Perf-1: 3D-/Leaflet-Panels (LoadingPlanPanel, YardPanel, MapPanel)
 * sind via React.lazy() ausgelagert. Three.js (~150 kB min) +
 * @react-three/* (~80 kB) + leaflet (~140 kB) laden nicht mehr
 * eagerly beim App-Start, sondern erst wenn das Panel im Dock
 * angezeigt wird. Idle-Preload (preloadDockPanels) startet im
 * Hintergrund nach dem ersten Idle-Frame — damit der erste Klick
 * auf Yard/Beladeplan/Karte praktisch nie auf den Netzwerk-Roundtrip
 * warten muss.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import QueuePanel from '../../components/workspace/QueuePanel';
import BoardPanel from '../../components/workspace/BoardPanel';
import DetailPanel from './DetailPanel';

// Perf-1: lazy-Imports — werden zu eigenen Chunks (LoadingPlanPanel-*.js,
// YardPanel-*.js, MapPanel-*.js) compiliert. Vendor-Deps (three/leaflet)
// landen via Vite's split-chunks im selben oder einem dedizierten
// vendor-Chunk (siehe vite.config manualChunks).
const LoadingPlanPanel = lazy(() => import('./LoadingPlanPanel'));
const YardPanel = lazy(() => import('./YardPanel'));
const MapPanel = lazy(() => import('../../components/workspace/MapPanel'));

export type PanelId =
  | 'queue'
  | 'board'
  | 'map'
  | 'loadingPlan'
  | 'detail'
  | 'yard';

export interface PanelRegistryEntry {
  id: PanelId;
  title: string;
  component: ComponentType | LazyExoticComponent<ComponentType<unknown>>;
  /** Perf-1: Markiert lazy Panels — DockPanelWrapper umhüllt sie
   *  zusätzlich mit Suspense + ErrorBoundary. */
  lazy?: boolean;
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
    lazy: true,
  },
  loadingPlan: {
    id: 'loadingPlan',
    title: 'Beladeplan',
    component: LoadingPlanPanel,
    lazy: true,
  },
  detail: {
    id: 'detail',
    title: 'Detail',
    component: DetailPanel,
  },
  yard: {
    id: 'yard',
    title: 'Hof',
    component: YardPanel,
    lazy: true,
  },
};

/**
 * Perf-1: Idle-Preload. Lädt die lazy-Panels im Hintergrund sobald
 * der Browser idle ist (kein blocking, kein Spinner-Risiko).
 * Aufruf einmal nach App-Mount (z.B. WorkspacePage useEffect).
 *
 * Mobile (3G/LTE): kostenlose Latenz-Versteckung — User-Klick auf
 * Yard-Tab fühlt sich instant an statt 600-1500ms warten.
 * Desktop: vernachlässigbar; Browser-Cache übernimmt sofort.
 *
 * Fallback wenn requestIdleCallback fehlt (Safari < 16.4):
 * setTimeout(400ms) — gibt mainthread Zeit für initial paint.
 */
export function preloadDockPanels(): void {
  const trigger = () => {
    // Fire-and-forget; Vite-dynamic-imports geben Promises, wir
    // lassen sie laufen und Browser-Cache übernimmt das Ergebnis.
    void import('./LoadingPlanPanel');
    void import('./YardPanel');
    void import('../../components/workspace/MapPanel');
  };
  if (typeof window === 'undefined') return; // SSR-safe (nicht aktiv).
  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(trigger, { timeout: 2000 });
  } else {
    window.setTimeout(trigger, 400);
  }
}

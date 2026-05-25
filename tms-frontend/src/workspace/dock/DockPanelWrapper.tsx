/**
 * S-2a/S-2b DockPanelWrapper.
 *
 * Brückt dockview's IDockviewPanelProps an unsere Workspace-Panel-
 * Components. Liest panel-Type aus props.params, schlägt im
 * PANEL_REGISTRY nach, rendert die Component.
 *
 * Die Workspace-Panels (QueuePanel/BoardPanel/MapPanel) lesen ihren
 * State via Hooks (useWorkspaceRuntime/useWorkspace/usePanel) —
 * keine Props nötig. Wrapper bleibt deshalb dünn.
 *
 * S-2b: Panel-Api wird via DockPanelProvider durchgereicht — Panels
 * die Visibility-State brauchen (LoadingPlanPanel) können das via
 * useDockPanelApi() konsumieren.
 *
 * Perf-1: Lazy-Panels (LoadingPlan/Yard/Map) werden mit Suspense +
 * ErrorBoundary umhüllt. Suspense fängt den Chunk-Load-Loading-State,
 * ErrorBoundary den Chunk-Load-Fehler (Network/Deployment-mismatch).
 */
import { Suspense } from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { PANEL_REGISTRY, type PanelId } from './panelRegistry';
import { DockPanelProvider } from './DockPanelContext';
import LazyPanelErrorBoundary from './LazyPanelErrorBoundary';

/**
 * Common params (alle Panels): panelId. Detail-Panel (S-5) ergaenzt
 * entityType/entityId/mode — durchgereicht via DockPanelContext-
 * params, die DetailPanel via useDockPanelParams() liest.
 */
interface DockPanelParams {
  panelId: PanelId;
  // Detail-Panel-spezifisch:
  entityType?: 'shipment' | 'tour' | 'nv-tour';
  entityId?: string;
  mode?: 'nv' | 'fv';
}

/** Perf-1: dezenter Spinner während Chunk-Load. ~150-800ms auf 3G,
 *  bei Idle-Preload meist <50ms (Cache-Hit). */
function PanelLoading({ title }: { title: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-white">
      <div className="text-xs text-gray-500 flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
        <span>{title} lädt…</span>
      </div>
    </div>
  );
}

export default function DockPanelWrapper(
  props: IDockviewPanelProps<DockPanelParams>,
) {
  const panelId = props.params?.panelId;
  if (!panelId) {
    return (
      <div className="p-3 text-xs text-red-600">
        DockPanelWrapper: panelId fehlt in panel.params.
      </div>
    );
  }
  const entry = PANEL_REGISTRY[panelId];
  if (!entry) {
    return (
      <div className="p-3 text-xs text-red-600">
        DockPanelWrapper: unbekannter panelId "{panelId}".
      </div>
    );
  }
  const Component = entry.component;
  // h-full damit das Panel die volle dockview-Container-Höhe nutzt
  // (Map braucht das insbesondere — Leaflet liest container.clientHeight).
  const content = (
    <div className="h-full w-full overflow-hidden">
      <Component />
    </div>
  );
  return (
    <DockPanelProvider
      api={props.api}
      params={props.params as unknown as Record<string, unknown>}
    >
      {entry.lazy ? (
        <LazyPanelErrorBoundary label={panelId}>
          <Suspense fallback={<PanelLoading title={entry.title} />}>
            {content}
          </Suspense>
        </LazyPanelErrorBoundary>
      ) : (
        content
      )}
    </DockPanelProvider>
  );
}

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
 */
import type { IDockviewPanelProps } from 'dockview';
import { PANEL_REGISTRY, type PanelId } from './panelRegistry';
import { DockPanelProvider } from './DockPanelContext';

interface DockPanelParams {
  panelId: PanelId;
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
  return (
    <DockPanelProvider api={props.api}>
      <div className="h-full w-full overflow-hidden">
        <Component />
      </div>
    </DockPanelProvider>
  );
}

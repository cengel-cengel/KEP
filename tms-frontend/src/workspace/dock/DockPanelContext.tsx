/**
 * S-2b: Bridge dockview-Panel-API in Hook-Form an Workspace-Panels.
 *
 * DockPanelWrapper bekommt props.api (DockviewPanelApi) und stellt
 * sie via Context bereit. Panels die Visibility/Active-State brauchen
 * (z.B. LoadingPlanPanel für frameloop-Gating) konsumieren das via
 * useDockPanelApi(). Panels die's nicht brauchen (Queue/Board/Map)
 * ignorieren den Context — null-safe.
 *
 * Warum Context und nicht Props an die Panel-Component?
 *   PANEL_REGISTRY erwartet ComponentType (zero-props). Panels lesen
 *   bisher State via Hooks (WorkspaceRuntime/Workspace) — wir bleiben
 *   bei diesem Pattern statt jedes Panel auf IDockviewPanelProps zu
 *   refactoren.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { DockviewPanelApi } from 'dockview';

const DockPanelContext = createContext<DockviewPanelApi | null>(null);

export function useDockPanelApi(): DockviewPanelApi | null {
  return useContext(DockPanelContext);
}

export function DockPanelProvider({
  api,
  children,
}: {
  api: DockviewPanelApi;
  children: ReactNode;
}) {
  return (
    <DockPanelContext.Provider value={api}>{children}</DockPanelContext.Provider>
  );
}

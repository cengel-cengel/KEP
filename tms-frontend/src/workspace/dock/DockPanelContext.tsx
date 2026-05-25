/**
 * S-2b: Bridge dockview-Panel-API in Hook-Form an Workspace-Panels.
 *
 * DockPanelWrapper bekommt props.api (DockviewPanelApi) + props.params
 * (panel-spezifisch) und stellt beides via Context bereit. Panels die
 * Visibility/Active-State brauchen (z.B. LoadingPlanPanel für frameloop-
 * Gating) konsumieren das via useDockPanelApi(). DetailPanel (S-5)
 * liest seine entityType/entityId/mode via useDockPanelParams().
 *
 * Warum Context und nicht Props an die Panel-Component?
 *   PANEL_REGISTRY erwartet ComponentType (zero-props). Panels lesen
 *   bisher State via Hooks (WorkspaceRuntime/Workspace) — wir bleiben
 *   bei diesem Pattern statt jedes Panel auf IDockviewPanelProps zu
 *   refactoren.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { DockviewPanelApi } from 'dockview';

interface DockPanelCtx {
  api: DockviewPanelApi;
  params: Record<string, unknown>;
}

const DockPanelContext = createContext<DockPanelCtx | null>(null);

export function useDockPanelApi(): DockviewPanelApi | null {
  return useContext(DockPanelContext)?.api ?? null;
}

export function useDockPanelParams<T = Record<string, unknown>>():
  | T
  | null {
  const ctx = useContext(DockPanelContext);
  return (ctx?.params as T | undefined) ?? null;
}

export function DockPanelProvider({
  api,
  params,
  children,
}: {
  api: DockviewPanelApi;
  params: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <DockPanelContext.Provider value={{ api, params }}>
      {children}
    </DockPanelContext.Provider>
  );
}

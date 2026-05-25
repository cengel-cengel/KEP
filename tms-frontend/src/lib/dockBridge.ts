/**
 * Dock-API-Bridge zwischen DockRuntime (workspace/dock) und
 * Klick-Handlern an verschiedensten Stellen (TourCards, Maps,
 * Eingang). Muster spiegelt lib/authBridge.ts — Modul-Scope-Slot,
 * React-frei, vermeidet Provider-Tree-Aenderungen.
 *
 * Lifecycle
 *   · DockRuntime.onApiReady → installDockBridge(api)
 *   · DockRuntime-Unmount    → installDockBridge(null)
 *
 * Konsumenten (z.B. openDetailPanel, state/panel.tsx) rufen
 * `getDockApi()` — wenn null (Workspace nicht gemountet / Page
 * ausserhalb /workspace), faellt der Caller auf ContextPanel-
 * Overlay-Pfad zurueck.
 */
import type { DockviewApi } from 'dockview';

let dockApi: DockviewApi | null = null;

export function installDockBridge(api: DockviewApi | null): void {
  dockApi = api;
}

export function getDockApi(): DockviewApi | null {
  return dockApi;
}

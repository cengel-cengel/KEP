import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ContextPanel from '../panel/ContextPanel';
import CommandPalette from '../CommandPalette';
import { usePanel } from '../../state/panel';

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { entity, width } = usePanel();
  const location = useLocation();
  // S-5: Innerhalb der Workspace-Page rendert der Detail-Tab das
  // Detail (dockview-Panel). Das ContextPanel-Overlay wuerde sonst
  // doppelt erscheinen + den Workspace-Layout-Bereich verschmaelern.
  // Aussehrhalb /workspace bleibt das Overlay wie bisher (legacy-
  // Pages wie /tours, /shipments, /nv-disposition haben keinen Dock).
  const inWorkspace = location.pathname.startsWith('/workspace');
  // W-1: Panel pusht main-content via padding-right.
  const rightPad = entity && !inWorkspace ? width : 0;
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div
        className="flex-1 flex flex-col min-w-0 transition-[padding-right] duration-150"
        style={{ paddingRight: `${rightPad}px` }}
      >
        <Topbar onOpenMobileSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
      {!inWorkspace && <ContextPanel />}
      <CommandPalette />
    </div>
  );
}

/**
 * S-5: AppLayout rendert ContextPanel-Overlay nur AUSSERHALB
 * /workspace. Im Workspace uebernimmt das dockview-Detail-Panel
 * die Anzeige; Doppel-Render verhindert.
 *
 * Wir testen via MemoryRouter mit unterschiedlichen Pfaden +
 * checken ob ContextPanel-Aside (data-attribut oder Inhalt)
 * rendert. ContextPanel selbst rendert nur dann etwas wenn
 * usePanel().entity gesetzt ist — wir setzen entity ueber
 * selectTour, dann pruefen wir.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../realtime/realtimeClient', () => ({
  connectRealtime: vi.fn(),
  disconnectRealtime: vi.fn(),
  getClientId: () => 'test-client',
}));
// CommandPalette mit Mock — sonst Hotkey-Listener pollutet
// jsdom + die Test-Asserts werden noisy.
vi.mock('../CommandPalette', () => ({
  default: () => null,
}));
// Topbar + Sidebar nutzen useAuth + Hooks die im Test nicht
// gemockt werden sollen. Wir tauschen sie gegen Stubs aus.
vi.mock('./Topbar', () => ({
  default: () => <div data-testid="topbar-stub" />,
}));
vi.mock('./Sidebar', () => ({
  default: () => <div data-testid="sidebar-stub" />,
}));
vi.mock('../panel/ContextPanel', () => ({
  default: () => (
    <aside data-testid="context-panel-overlay">CONTEXT_PANEL</aside>
  ),
}));

import AppLayout from './AppLayout';
import { PanelProvider, usePanel } from '../../state/panel';

afterEach(() => {
  localStorage.clear();
});

function Probe() {
  const { selectTour } = usePanel();
  // entity setzen → ContextPanel wuerde sonst null returnen.
  // Aber unser ContextPanel-Mock returnt immer den Knoten, also
  // hier reicht: wir wollen pruefen ob der Mock-Knoten gerendert
  // wird.
  return (
    <button onClick={() => selectTour('T-9')} data-testid="trigger">
      select
    </button>
  );
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <PanelProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="*" element={<Probe />} />
          </Route>
        </Routes>
      </PanelProvider>
    </MemoryRouter>,
  );
}

describe('AppLayout — ContextPanel-Sichtbarkeit', () => {
  it('AUSSERHALB /workspace: ContextPanel-Overlay sichtbar', () => {
    renderAt('/tours');
    expect(screen.getByTestId('context-panel-overlay')).toBeInTheDocument();
  });

  it('INNERHALB /workspace: KEIN ContextPanel-Overlay', () => {
    renderAt('/workspace');
    expect(screen.queryByTestId('context-panel-overlay')).toBeNull();
  });

  it('/workspace?mode=nv: ebenfalls KEIN Overlay (pathname-Match)', () => {
    renderAt('/workspace?mode=nv');
    expect(screen.queryByTestId('context-panel-overlay')).toBeNull();
  });
});

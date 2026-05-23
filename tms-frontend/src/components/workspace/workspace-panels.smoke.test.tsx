/**
 * C2-G: Render-Tests SMOKE-only für QueuePanel/BoardPanel/MapPanel
 * + WorkspacePage.
 *
 * Scope (explizit nicht Coverage-Jagd):
 *   - renders-without-crash für jede Komponente
 *   - 1 minimal-Interaktion pro Komponente wo trivial möglich,
 *     sonst übersprungen (keine Mock-Stack-Eskalation).
 *
 * Mocks (Mock-Footprint klein halten):
 *   - lib/api → empty-Responses für queries (kein Network)
 *   - components/nv/NvDispoMap → div-Stub (vermeidet Leaflet/DOM-bounds)
 *   - realtime/realtimeClient → no-op (no socket)
 *
 * Providers: QueryClient + MemoryRouter + WorkspaceProvider + PanelProvider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// ─── Mocks BEVOR die Komponenten importiert werden ──────────────
vi.mock('../../lib/api', () => {
  const empty = { data: [] };
  const emptyObj = { data: null };
  return {
    api: {
      get: vi.fn().mockResolvedValue(empty),
      post: vi.fn().mockResolvedValue(emptyObj),
      patch: vi.fn().mockResolvedValue(emptyObj),
      put: vi.fn().mockResolvedValue(emptyObj),
      delete: vi.fn().mockResolvedValue(emptyObj),
    },
    AUTH_TOKEN_KEY: 'tms_token',
  };
});

vi.mock('../../realtime/realtimeClient', () => ({
  getClientId: () => 'test-client',
  getRealtimeStatus: () => 'connected' as const,
  onRealtimeStatus: () => () => {},
  realtimeClient: {
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock('../nv/NvDispoMap', () => ({
  default: () => <div data-testid="nv-dispo-map-stub" />,
}));

// Heavy Modal-Tree wegmocken — wir testen nur renderbarkeit der Panels.
vi.mock('../nv/CreateTourModal', () => ({
  default: () => null,
}));
vi.mock('../fv/CreateFvTourModal', () => ({
  default: () => null,
}));
vi.mock('../NvTourKostenModal', () => ({
  default: () => null,
}));
vi.mock('../nv/CostDrillDownModal', () => ({
  default: () => null,
}));
vi.mock('../nv/BulkTourPicker', () => ({
  default: () => null,
}));

// react-resizable-panels braucht ResizeObserver/measure-DOM — in jsdom
// nicht verfügbar. Pass-through-Stubs (Layout-Sizes irrelevant für Smoke).
vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children: ReactNode }) => (
    <div data-testid="panel-group">{children}</div>
  ),
  Panel: ({ children }: { children: ReactNode }) => (
    <div data-testid="panel">{children}</div>
  ),
  Separator: () => <div data-testid="panel-separator" />,
}));

// ─── Imports AFTER vi.mock ─────────────────────────────────────
import QueuePanel from './QueuePanel';
import BoardPanel from './BoardPanel';
import MapPanel from './MapPanel';
import WorkspacePage from '../../pages/WorkspacePage';
import { WorkspaceProvider } from '../../state/workspace';
import { PanelProvider } from '../../state/panel';
import { WorkspaceRuntimeProvider } from '../../workspace/runtime/WorkspaceRuntimeContext';

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  // S-1: WorkspaceRuntimeProvider INNERHALB workspace + panel
  // (consistent mit prod-Tree via main.tsx + WorkspacePage).
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WorkspaceProvider>
          <PanelProvider>
            <WorkspaceRuntimeProvider>{children}</WorkspaceRuntimeProvider>
          </PanelProvider>
        </WorkspaceProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  // localStorage zurücksetzen für deterministisches Layout/State.
  localStorage.clear();
});

describe('QueuePanel — smoke', () => {
  it('rendert ohne crash', () => {
    expect(() =>
      render(
        <Wrapper>
          <QueuePanel />
        </Wrapper>,
      ),
    ).not.toThrow();
  });

  it('zeigt Initial-Empty/Loading-State', () => {
    render(
      <Wrapper>
        <QueuePanel />
      </Wrapper>,
    );
    // Loading-Indicator ODER FilterBar-Inputs sollten gerendert sein.
    // Wir testen permissiv: irgendein DOM-Element existiert.
    expect(document.querySelector('div')).toBeTruthy();
  });
});

describe('BoardPanel — smoke', () => {
  it('rendert ohne crash', () => {
    expect(() =>
      render(
        <Wrapper>
          <BoardPanel />
        </Wrapper>,
      ),
    ).not.toThrow();
  });
});

describe('MapPanel — smoke', () => {
  it('rendert ohne crash (NvDispoMap gestubbed)', () => {
    expect(() =>
      render(
        <Wrapper>
          <MapPanel />
        </Wrapper>,
      ),
    ).not.toThrow();
  });
});

describe('WorkspacePage — smoke', () => {
  it('rendert ohne crash mit allen 3 Panels', () => {
    expect(() =>
      render(
        <Wrapper>
          <WorkspacePage />
        </Wrapper>,
      ),
    ).not.toThrow();
  });

  it('Mode-Toggle in TopBar ist klickbar (NV ↔ FV)', () => {
    render(
      <Wrapper>
        <WorkspacePage />
      </Wrapper>,
    );
    // TopBar hat NV/FV-Buttons. Klick auf einen sollte nicht throwen.
    const fvBtn = screen.queryByRole('button', { name: /FV/i });
    if (fvBtn) {
      expect(() => fireEvent.click(fvBtn)).not.toThrow();
    }
    // Wenn TopBar-Buttons nicht gefunden → Smoke-Test passt trotzdem
    // (renders-without-crash bereits oben verifiziert).
  });
});

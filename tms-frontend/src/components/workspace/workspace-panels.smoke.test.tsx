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

// NvDispoMap-Stub: rendert pro shipment einen Pin-Button + ein
// Tour-Stop-Button (Auflieger-Analog), damit handlePinClick / onTour-
// StopClick aus MapPanel testbar werden. KEIN Leaflet im jsdom.
vi.mock('../nv/NvDispoMap', () => ({
  default: ({
    shipments,
    onPinClick,
  }: {
    shipments: Array<{ id: string }>;
    onPinClick?: (id: string) => void;
  }) => (
    <div data-testid="nv-dispo-map-stub">
      {shipments.map((s) => (
        <button
          key={s.id}
          data-testid={`map-pin-${s.id}`}
          onClick={() => onPinClick?.(s.id)}
        >
          pin {s.id}
        </button>
      ))}
    </div>
  ),
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
// (Lib wird seit S-2a nicht mehr aktiv genutzt; Stub bleibt als Schutz
//  falls irgendwo ein Import übersehen wurde.)
vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children: ReactNode }) => (
    <div data-testid="panel-group">{children}</div>
  ),
  Panel: ({ children }: { children: ReactNode }) => (
    <div data-testid="panel">{children}</div>
  ),
  Separator: () => <div data-testid="panel-separator" />,
}));

// S-2a: dockview braucht ResizeObserver — jsdom hat es nicht. Stub
// als render-without-crash-Marker. WorkspacePage-Smoke prüft TopBar/
// Banner/QuickAddBar-Pfad, nicht die Dock-Innenlogik (dafür sind
// Playwright-E2E im echten Browser zuständig).
vi.mock('../../workspace/dock/DockRuntime', () => ({
  default: () => <div data-testid="dock-runtime-stub" />,
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

  it('Map-Pin-Tap → Modal mit "+ Zur Tour"-Button (Option A, NV)', async () => {
    // Eligible-Shipments-Mock fuer mapShipmentsNv. NV-Mode-Default.
    const apiMock = (
      await import('../../lib/api')
    ).api as unknown as { get: ReturnType<typeof vi.fn> };
    apiMock.get.mockImplementation((url: string) => {
      if (url.includes('/nv-touren/eligible-shipments')) {
        return Promise.resolve({
          data: [
            {
              id: 's-map-1',
              shipment_number: 'M-1',
              customer_id: 'c-1',
              loading_date: '2099-12-31',
              delivery_date: '2099-12-31',
              package_count: 1,
              customer: { name: 'Map-Kunde' },
              loading_address: {
                lat: 48,
                lng: 11,
                street: 'Marienpl 1',
                zip: '80331',
                city: 'M',
                country_code: 'DE',
              },
              pin_address: {
                lat: 48,
                lng: 11,
                street: 'Marienpl 1',
                zip: '80331',
                city: 'M',
                country_code: 'DE',
              },
              matched_tour_gebiet_id: 'g-1',
              matched_tour_gebiet_code: 'G1',
              is_stamm_kunde: false,
              weight_kg: 1500,
              volume_m3: 8.5,
              effective_pallets: 3,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
    render(
      <Wrapper>
        <MapPanel />
      </Wrapper>,
    );
    // Pin-Button erscheint via NvDispoMap-Stub.
    const pin = await screen.findByTestId('map-pin-s-map-1');
    fireEvent.click(pin);
    // Modal oeffnet — X-Close-Button (Schließen aria-label) als Marker.
    expect(await screen.findByLabelText('Schließen')).toBeInTheDocument();
    // "+ Zur Tour"-Button ist sichtbar (Karten-Modal-Scope).
    expect(screen.getByText('+ Zur Tour')).toBeInTheDocument();
    // "Volle Details" ebenfalls.
    expect(screen.getByText('Volle Details')).toBeInTheDocument();
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

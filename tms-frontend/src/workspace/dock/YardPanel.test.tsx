/**
 * S-6 YardPanel-Smoke.
 *
 * Was geprueft wird
 *  · Kein aktiver tour → Hinweis-Text statt 3D-Scene.
 *  · NV-Mode + tour aktiv + nearby liefert Sendungen → Header zeigt
 *    "20 km Umkreis" + Pool-Count.
 *  · FV-Mode: Header "100 km Umkreis"; FV-URL hat ?radius_km=100.
 *  · Gruppierung: Sendungen mit gleicher PLZ landen im selben Slot.
 *  · Click auf Hof-Box ruft selectShipment.
 *
 * 3D-Render-Pfad ist headless schwer testbar — wir mocken
 * YardScene3D durch einen DOM-Stub, der die Slots als <li> rendert
 * + Click-Buttons fuer Sendungen.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./YardScene3D', () => ({
  default: ({
    slots,
    onShipmentClick,
  }: {
    slots: Array<{
      id: string;
      label: string;
      shipments: Array<{ id: string; shipmentNumber?: string | null }>;
    }>;
    onShipmentClick?: (id: string) => void;
  }) => (
    <ul data-testid="scene-stub">
      {slots.map((slot) => (
        <li key={slot.id} data-slot={slot.id}>
          {slot.label}
          {slot.shipments.map((s) => (
            <button
              key={s.id}
              data-testid={`yard-ship-${s.id}`}
              onClick={() => onShipmentClick?.(s.id)}
            >
              {s.shipmentNumber ?? s.id}
            </button>
          ))}
        </li>
      ))}
    </ul>
  ),
}));

vi.mock('../../realtime/realtimeClient', () => ({
  connectRealtime: vi.fn(),
  disconnectRealtime: vi.fn(),
  getClientId: () => 'test-client',
}));

// useWorkspaceRuntime mocked — activeTourViewId steuerbar je Test.
const runtimeMock = {
  activeTourViewId: 'tour-1' as string | null,
};
vi.mock('../runtime/WorkspaceRuntimeContext', () => ({
  useWorkspaceRuntime: () => runtimeMock,
  WorkspaceRuntimeProvider: ({ children }: { children: ReactNode }) =>
    children,
}));

// useWorkspace mocked — mode steuerbar je Test.
const workspaceMock = { mode: 'nv' as 'nv' | 'fv' };
vi.mock('../../state/workspace', () => ({
  useWorkspace: () => workspaceMock,
  DEFAULT_LAYOUT: { queueSize: 30, boardSize: 35, mapSize: 35 },
}));

// api gemockt — wir tracken get-calls + liefern pro URL ein
// Mock-Dataset.
const mockNearbyNv = [
  {
    id: 's-1',
    shipment_number: 'N-1',
    weight_kg: 500,
    ldm: 1.2,
    customer_name: 'Kunde A',
    lat: 48.1,
    lng: 11.5,
    zip: '80331',
    city: 'Muenchen',
    distance_km: 5,
  },
  {
    id: 's-2',
    shipment_number: 'N-2',
    weight_kg: 700,
    ldm: 2,
    customer_name: 'Kunde A',
    lat: 48.11,
    lng: 11.51,
    zip: '80331',
    city: 'Muenchen',
    distance_km: 7,
  },
  {
    id: 's-3',
    shipment_number: 'N-3',
    weight_kg: 200,
    ldm: 0.5,
    customer_name: 'Kunde B',
    lat: 48.2,
    lng: 11.6,
    zip: '80335',
    city: 'Muenchen',
    distance_km: 12,
  },
];
const apiGet = vi.fn();
const apiPost = vi.fn().mockResolvedValue({ data: { ok: true } });
vi.mock('../../lib/api', () => ({
  api: {
    get: (url: string) => apiGet(url),
    post: (url: string, body: unknown) => apiPost(url, body),
  },
  AUTH_TOKEN_KEY: 'tms_token',
}));

// state/panel: selectShipment-Spy
const selectShipmentSpy = vi.fn();
vi.mock('../../state/panel', () => ({
  usePanel: () => ({
    entity: null,
    width: 384,
    pinned: false,
    selectShipment: selectShipmentSpy,
    selectTour: vi.fn(),
    selectNvTour: vi.fn(),
    close: vi.fn(),
    togglePin: vi.fn(),
    setWidth: vi.fn(),
  }),
}));

// NvLoadingPlanPage flattenPackages stubben — liefert leeren
// unplaced-Set; YardPanel rendert dann keinen Ueberlauf-Slot.
vi.mock('../../pages/NvLoadingPlanPage', () => ({
  flattenPackages: () => [],
}));
vi.mock('../../lib/loadingShared', () => ({
  placePackages: () => [],
}));

import YardPanel from './YardPanel';

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  selectShipmentSpy.mockClear();
  apiGet.mockReset();
  workspaceMock.mode = 'nv';
  runtimeMock.activeTourViewId = 'tour-1';
});

describe('YardPanel — smoke', () => {
  it('Keine Tour: Hinweis-Text statt 3D-Scene', () => {
    runtimeMock.activeTourViewId = null;
    apiGet.mockResolvedValue({ data: [] });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    expect(screen.getByText(/Keine Tour ausgewählt/)).toBeInTheDocument();
    expect(screen.queryByTestId('scene-stub')).toBeNull();
  });

  it('NV: Header "20 km Umkreis" + Pool-Count + PLZ-Gruppierung (Versender)', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nv-touren/tour-1/nearby-shipments')) {
        return Promise.resolve({ data: mockNearbyNv });
      }
      if (url.includes('/nv-touren/tour-1/loading')) {
        return Promise.resolve({ data: { id: 'tour-1', stops: [] } });
      }
      return Promise.resolve({ data: [] });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    expect(await screen.findByText(/20 km Umkreis/)).toBeInTheDocument();
    expect(await screen.findByText(/3 im Pool/)).toBeInTheDocument();
    // NV gruppiert nach Versender-PLZ.
    expect(await screen.findByText(/PLZ 80331 \(2\)/)).toBeInTheDocument();
    expect(await screen.findByText(/PLZ 80335 \(1\)/)).toBeInTheDocument();
  });

  it('S-6.1 FV-Sammelgut: Gruppe = Depot-Label', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/tours/tour-1/nearby-shipments')) {
        return Promise.resolve({
          data: [
            {
              id: 's-sg1',
              shipment_number: 'F-SG-1',
              weight_kg: 500,
              ldm: 1,
              customer_name: 'A',
              lat: 48,
              lng: 11,
              zip: '80331',
              city: 'M',
              distance_km: 10,
              // S-6.1 Empfaenger-Felder:
              transport_type: 'SAMMELGUT',
              delivery_zip: '20095',
              delivery_city: 'HH',
              relation_id: 'rel-1',
              relation_code: 'M-HH',
              depot_label: 'Hub Hamburg',
            },
            {
              id: 's-sg2',
              shipment_number: 'F-SG-2',
              weight_kg: 500,
              ldm: 1,
              customer_name: 'B',
              lat: 48,
              lng: 11,
              zip: '80335',
              city: 'M',
              distance_km: 11,
              transport_type: 'TEILLAST',
              delivery_zip: '20097',
              delivery_city: 'HH',
              relation_id: 'rel-1',
              relation_code: 'M-HH',
              depot_label: 'Hub Hamburg',
            },
          ],
        });
      }
      return Promise.resolve({ data: { loadingOrder: [] } });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    // Beide Sendungen gruppieren auf "Depot Hub Hamburg" (2 Stueck).
    expect(
      await screen.findByText(/Depot Hub Hamburg \(2\)/),
    ).toBeInTheDocument();
    // KEIN Versender-PLZ-Slot bei FV.
    expect(screen.queryByText(/PLZ 80331/)).toBeNull();
  });

  it('S-6.1 FV-Direkt: Gruppe = Empfangs-PLZ', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/tours/tour-1/nearby-shipments')) {
        return Promise.resolve({
          data: [
            {
              id: 's-dir1',
              shipment_number: 'F-DIR-1',
              weight_kg: 500,
              ldm: 1,
              customer_name: 'A',
              lat: 48,
              lng: 11,
              zip: '80331',
              city: 'M',
              distance_km: 10,
              transport_type: 'DIREKT',
              delivery_zip: '50667',
              delivery_city: 'Koeln',
              relation_id: null,
              relation_code: null,
              depot_label: null,
            },
            {
              id: 's-dir2',
              shipment_number: 'F-DIR-2',
              weight_kg: 500,
              ldm: 1,
              customer_name: 'B',
              lat: 48,
              lng: 11,
              zip: '80335',
              city: 'M',
              distance_km: 11,
              transport_type: 'DIREKT_UMSCHLAG',
              delivery_zip: '50667',
              delivery_city: 'Koeln',
              relation_id: null,
              relation_code: null,
              depot_label: null,
            },
          ],
        });
      }
      return Promise.resolve({ data: { loadingOrder: [] } });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    expect(
      await screen.findByText(/Empfangs-PLZ 50667 \(2\)/),
    ).toBeInTheDocument();
  });

  it('S-6.1 FV-Sammelgut OHNE Depot/Relation: Fallback Empfangs-PLZ', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/tours/tour-1/nearby-shipments')) {
        return Promise.resolve({
          data: [
            {
              id: 's-fb',
              shipment_number: 'F-FB-1',
              weight_kg: 500,
              ldm: 1,
              customer_name: 'A',
              lat: 48,
              lng: 11,
              zip: '80331',
              city: 'M',
              distance_km: 10,
              transport_type: 'SAMMELGUT',
              delivery_zip: '60311',
              delivery_city: 'FFM',
              relation_id: null,
              relation_code: null,
              depot_label: null,
            },
          ],
        });
      }
      return Promise.resolve({ data: { loadingOrder: [] } });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    expect(
      await screen.findByText(/Empfangs-PLZ 60311 \(1\)/),
    ).toBeInTheDocument();
  });

  it('FV: Header "100 km Umkreis" + URL hat ?radius_km=100', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/tours/tour-1/nearby-shipments')) {
        // URL muss radius_km=100 enthalten — assertion unten.
        return Promise.resolve({ data: mockNearbyNv });
      }
      if (url.includes('/loading/tour/tour-1/optimize')) {
        return Promise.resolve({ data: { loadingOrder: [] } });
      }
      return Promise.resolve({ data: [] });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    expect(await screen.findByText(/100 km Umkreis/)).toBeInTheDocument();
    // URL-Check: irgendwann muss api.get(..radius_km=100..) gerufen sein.
    const fvUrls = apiGet.mock.calls
      .map((c) => c[0])
      .filter((u: string) => u.includes('nearby-shipments'));
    expect(fvUrls.some((u: string) => u.includes('radius_km=100'))).toBe(true);
  });

  it('Click auf Hof-Box → selectShipment', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({ data: mockNearbyNv });
      }
      return Promise.resolve({ data: { stops: [] } });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    const btn = await screen.findByTestId('yard-ship-s-1');
    fireEvent.click(btn);
    expect(selectShipmentSpy).toHaveBeenCalledWith('s-1');
  });
});

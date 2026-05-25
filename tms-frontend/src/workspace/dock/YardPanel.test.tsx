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
    placedInTrailer,
    onShipmentClick,
  }: {
    slots: Array<{
      id: string;
      label: string;
      shipments: Array<{
        id: string;
        shipmentNumber?: string | null;
        customerName?: string | null;
        loadingStreet?: string | null;
        loadingZip?: string | null;
        loadingCity?: string | null;
        loadingCountry?: string | null;
        deliveryZip?: string | null;
        deliveryCountry?: string | null;
        relationCode?: string | null;
        depotLabel?: string | null;
        mode?: 'nv' | 'fv';
      }>;
      packedTrailers?: Array<{
        shipmentIds: string[];
        capped?: boolean;
        placedItems?: Array<{ id: string; shipmentId?: string | null }>;
      }>;
    }>;
    placedInTrailer?: Array<{ id: string; shipmentId?: string | null }>;
    onShipmentClick?: (id: string) => void;
  }) => (
    <ul data-testid="scene-stub">
      <li
        data-testid="placed-count"
        data-count={(placedInTrailer ?? []).length}
      />
      {(placedInTrailer ?? []).map((p) => (
        <button
          key={`placed-${p.id}`}
          data-testid={`placed-${p.id}`}
          onClick={() => p.shipmentId && onShipmentClick?.(p.shipmentId)}
        >
          {p.shipmentId}
        </button>
      ))}
      {slots.map((slot) => (
        <li
          key={slot.id}
          data-slot={slot.id}
          data-packed-count={(slot.packedTrailers ?? []).length}
          data-packed-items={(slot.packedTrailers ?? [])
            .map((t) => (t.placedItems ?? []).length)
            .join(',')}
          data-packed-capped={(slot.packedTrailers ?? [])
            .map((t) => (t.capped ? '1' : '0'))
            .join(',')}
        >
          {slot.label}
          {slot.shipments.map((s) => (
            <button
              key={s.id}
              data-testid={`yard-ship-${s.id}`}
              data-customer={s.customerName ?? ''}
              data-street={s.loadingStreet ?? ''}
              data-zip={s.loadingZip ?? ''}
              data-city={s.loadingCity ?? ''}
              data-country={s.loadingCountry ?? ''}
              data-delivery-zip={s.deliveryZip ?? ''}
              data-delivery-country={s.deliveryCountry ?? ''}
              data-relation={s.relationCode ?? ''}
              data-depot={s.depotLabel ?? ''}
              data-mode={s.mode ?? ''}
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
    loading_street: 'Marienplatz 1',
    loading_country: 'DE',
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
    loading_street: 'Marienplatz 2',
    loading_country: 'DE',
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
    loading_street: 'Hauptbahnhof 1',
    loading_country: 'DE',
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

// NvLoadingPlanPage flattenPackages + lib/loadingShared.placePackages
// — pro Test überschreibbar via mockImplementation der jeweiligen Spy.
const flattenNvSpy = vi.fn<
  (...args: unknown[]) => Array<Record<string, unknown>>
>(() => []);
const placePkgSpy = vi.fn<
  (...args: unknown[]) => Array<Record<string, unknown>>
>(() => []);
vi.mock('../../pages/NvLoadingPlanPage', () => ({
  flattenPackages: (...args: unknown[]) => flattenNvSpy(...args),
}));
vi.mock('../../lib/loadingShared', () => ({
  placePackages: (...args: unknown[]) => placePkgSpy(...args),
  // S-6.3 A-Fix: identity-Stub fuer Sort. Echte Logik ist in
  // sortPackagesForOptimalPack.test.ts abgedeckt — hier nur
  // sicherstellen dass der YardPanel-Import nicht crashed.
  sortPackagesForOptimalPack: <T,>(arr: T[]) => arr,
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
  flattenNvSpy.mockReset();
  flattenNvSpy.mockImplementation(() => []);
  placePkgSpy.mockReset();
  placePkgSpy.mockImplementation(() => []);
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
    // NV gruppiert nach Versender-PLZ. S-6.3-Format:
    // "<group> · N Sdg · ≈ K LKW".
    expect(
      await screen.findByText(/PLZ 80331 · 2 Sdg · ≈ \d+ LKW/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/PLZ 80335 · 1 Sdg · ≈ \d+ LKW/),
    ).toBeInTheDocument();
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
      await screen.findByText(/Depot Hub Hamburg · 2 Sdg · ≈ \d+ LKW/),
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
      await screen.findByText(/Empfangs-PLZ 50667 · 2 Sdg · ≈ \d+ LKW/),
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
      await screen.findByText(/Empfangs-PLZ 60311 · 1 Sdg · ≈ \d+ LKW/),
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

  it('S-6.3 D: Tap auf Hof-Box → Modal oeffnet (nicht direkt Panel)', async () => {
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
    // Modal renders Dialog mit X-Button (aria-label "Schließen") +
    // "Schließen"-Button — eindeutig dem Modal zuzuordnen.
    expect(await screen.findByLabelText('Schließen')).toBeInTheDocument();
    // Sendung selectShipment direkt NICHT mehr getriggert — erst nach
    // "Volle Details"-Klick (siehe naechster Test).
    expect(selectShipmentSpy).not.toHaveBeenCalled();
  });

  it('S-6.3 D: Modal "Volle Details" → panel.selectShipment + Modal zu', async () => {
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
    fireEvent.click(await screen.findByTestId('yard-ship-s-1'));
    await screen.findByLabelText('Schließen');
    fireEvent.click(screen.getByText('Volle Details'));
    expect(selectShipmentSpy).toHaveBeenCalledWith('s-1');
  });

  it('S-6.2 NV: Per-Sendung-Label-Felder erreichen YardScene3D', async () => {
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
    expect(btn).toHaveAttribute('data-customer', 'Kunde A');
    expect(btn).toHaveAttribute('data-street', 'Marienplatz 1');
    expect(btn).toHaveAttribute('data-zip', '80331');
    expect(btn).toHaveAttribute('data-city', 'Muenchen');
    expect(btn).toHaveAttribute('data-country', 'DE');
    expect(btn).toHaveAttribute('data-mode', 'nv');
  });

  it('S-6.2 Country-Prefix: einheitliche DE-Gruppe → KEIN Prefix', async () => {
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
    // DE wird NICHT als Prefix gerendert (Default-Land).
    expect(
      await screen.findByText(/^PLZ 80331 · 2 Sdg · ≈ \d+ LKW$/),
    ).toBeInTheDocument();
  });

  it('S-6.2 Country-Prefix: einheitliche AT-Gruppe → "AT · " Prefix', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({
          data: [
            {
              ...mockNearbyNv[0],
              id: 's-at1',
              zip: '1010',
              loading_country: 'AT',
            },
            {
              ...mockNearbyNv[1],
              id: 's-at2',
              zip: '1010',
              loading_country: 'AT',
            },
          ],
        });
      }
      return Promise.resolve({ data: { stops: [] } });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    expect(
      await screen.findByText(/AT · PLZ 1010 · 2 Sdg · ≈ \d+ LKW/),
    ).toBeInTheDocument();
  });

  it('S-6.2 Country-Prefix: gemischte Gruppe (DE + AT) → KEIN Prefix', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({
          data: [
            { ...mockNearbyNv[0], id: 's-mix1', loading_country: 'DE' },
            { ...mockNearbyNv[1], id: 's-mix2', loading_country: 'AT' },
          ],
        });
      }
      return Promise.resolve({ data: { stops: [] } });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    // Beide haben PLZ 80331 → eine Gruppe mit Count 2 — KEIN Praefix
    // (DE+AT gemischt → uniformCountry returns null).
    expect(
      await screen.findByText(/^PLZ 80331 · 2 Sdg · ≈ \d+ LKW$/),
    ).toBeInTheDocument();
  });

  it('S-6.3 C: LKW-Total im Header (≈ N LKW) summiert ueber Slots', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        // 2 Sendungen je 10 m³ → 1 LKW (Slot PLZ 80331)
        // 1 Sendung 5 m³ → 1 LKW (Slot PLZ 80335)
        // Σ ≈ 2 LKW.
        return Promise.resolve({
          data: mockNearbyNv.map((s, i) => ({
            ...s,
            volume_m3: i === 2 ? 5 : 10,
          })),
        });
      }
      return Promise.resolve({ data: { stops: [] } });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    // Header zeigt "≈ 2 LKW".
    expect(await screen.findByText(/≈ 2 LKW/)).toBeInTheDocument();
  });

  it('S-6.3 C: Slot-Label enthaelt "N Sdg · ≈ K LKW"', async () => {
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
    expect(
      await screen.findByText(/PLZ 80331 · 2 Sdg · ≈ 1 LKW/),
    ).toBeInTheDocument();
  });

  it('S-6.3 C: 3 Sendungen je 40 m³ → 2 LKW im Slot (FFD)', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        // Alle in PLZ 80331 (gleiche Gruppe).
        return Promise.resolve({
          data: [
            {
              ...mockNearbyNv[0],
              id: 's-x1',
              volume_m3: 40,
              weight_kg: 1000,
            },
            {
              ...mockNearbyNv[0],
              id: 's-x2',
              volume_m3: 40,
              weight_kg: 1000,
            },
            {
              ...mockNearbyNv[0],
              id: 's-x3',
              volume_m3: 40,
              weight_kg: 1000,
            },
          ],
        });
      }
      // T1: fahrzeug_typ='Sattel' → cap 88 m³. Ohne dies fiele
      // resolveVehicleCapacity auf Koffer 7t (35.7 m³) zurueck → 3 LKW.
      return Promise.resolve({
        data: { stops: [], fahrzeug_typ: 'Sattel' },
      });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    // 3 Sendungen × 40 = 120 m³. 40+40=80 ≤ 88 OK, 3. Sendung neuer
    // Trailer → 2 Trailer fuer den Slot.
    expect(
      await screen.findByText(/PLZ 80331 · 3 Sdg · ≈ 2 LKW/),
    ).toBeInTheDocument();
  });

  it('S-6.2 Auflieger-Vorladung: placed-Pakete erreichen YardScene3D', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/nv-touren/tour-1/loading')) {
        return Promise.resolve({ data: { id: 'tour-1', stops: [] } });
      }
      return Promise.resolve({ data: { stops: [] } });
    });
    // flattenNvSpy gibt 2 placed-Pakete + 1 unplaced zurueck.
    flattenNvSpy.mockImplementation(() => [
      {
        id: 'pkg-a',
        shipmentId: 'sh-1',
        lengthCm: 120,
        widthCm: 80,
        heightCm: 100,
        posX: 0,
        posY: 0,
        posZ: 0,
        color: '#aaa',
        unplaced: false,
      },
      {
        id: 'pkg-b',
        shipmentId: 'sh-1',
        lengthCm: 120,
        widthCm: 80,
        heightCm: 100,
        posX: 0,
        posY: 120,
        posZ: 0,
        color: '#aaa',
        unplaced: false,
      },
      {
        id: 'pkg-c',
        shipmentId: 'sh-2',
        lengthCm: 120,
        widthCm: 80,
        heightCm: 100,
        posX: 0,
        posY: 0,
        posZ: 0,
        color: '#bbb',
        unplaced: true,
      },
    ]);
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    // 2 placed-Pakete (pkg-a, pkg-b) reichen via prop durch.
    const placedCount = await screen.findByTestId('placed-count');
    expect(placedCount).toHaveAttribute('data-count', '2');
    // Header zeigt "2 im Auflieger".
    expect(screen.getByText(/2 im Auflieger/)).toBeInTheDocument();
    // Click auf placed-Box → selectShipment(shipmentId).
    fireEvent.click(screen.getByTestId('placed-pkg-a'));
    expect(selectShipmentSpy).toHaveBeenCalledWith('sh-1');
  });

  it('S-6.3 Overflow-Grund "Pack-Grenze (Reserve)" wenn Σ Vol ≤ Kapazitaet', async () => {
    // 1 unplaced kleine Sendung — Σ Vol weit unter Sattel 88 m³.
    // Erwartung: Reason = "Pack-Grenze (Reserve)".
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          id: 'tour-1',
          stops: [
            {
              id: 'stop-of',
              shipment: {
                id: 'sh-of',
                shipment_number: 'OF-1',
                length_cm: 120,
                width_cm: 80,
                height_cm: 100,
                weight_kg: 100,
                volume_m3: 0.96,
              },
            },
          ],
        },
      });
    });
    flattenNvSpy.mockImplementation(() => [
      {
        id: 'pkg-of',
        shipmentId: 'sh-of',
        lengthCm: 120,
        widthCm: 80,
        heightCm: 100,
        posX: 0,
        posY: 0,
        posZ: 0,
        color: '#ccc',
        unplaced: true,
      },
    ]);
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    expect(
      await screen.findByText(/Pack-Grenze \(Reserve\)/),
    ).toBeInTheDocument();
  });

  it('T1: fahrzeug_typ=12T → FFD nutzt 50 m³ cap (3×20 m³ → 1 LKW, 12+12=24 ≤ 50)', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({
          data: [
            { ...mockNearbyNv[0], id: 's-t1a', volume_m3: 20, weight_kg: 500 },
            { ...mockNearbyNv[0], id: 's-t1b', volume_m3: 20, weight_kg: 500 },
            { ...mockNearbyNv[0], id: 's-t1c', volume_m3: 20, weight_kg: 500 },
          ],
        });
      }
      return Promise.resolve({
        data: { stops: [], fahrzeug_typ: '12T' },
      });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    // 12T-Cap = 50 m³ (T1). 20+20=40 fits, +20=60 ueberschreitet 50
    // → 2 LKW (Sattel haette 1 LKW gemacht).
    expect(
      await screen.findByText(/PLZ 80331 · 3 Sdg · ≈ 2 LKW/),
    ).toBeInTheDocument();
  });

  it('T1: fahrzeug_typ=7_5T → kleinere cap (40 m³) → mehr LKW als Sattel', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({
          data: [
            { ...mockNearbyNv[0], id: 's-t75a', volume_m3: 30, weight_kg: 500 },
            { ...mockNearbyNv[0], id: 's-t75b', volume_m3: 30, weight_kg: 500 },
          ],
        });
      }
      return Promise.resolve({
        data: { stops: [], fahrzeug_typ: '7_5T' },
      });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    // 7.5T-Cap = 40 m³. 30+30=60 > 40 → 2 LKW (Sattel-88 haette 1 LKW).
    expect(
      await screen.findByText(/PLZ 80331 · 2 Sdg · ≈ 2 LKW/),
    ).toBeInTheDocument();
  });

  it('S-6.3 B: Lane bekommt packedTrailers[] mit Anzahl = FFD-Trailer', async () => {
    // 3 Sendungen à 40 m³ → 2 LKW im Slot (FFD-Standard).
    // packedTrailers.length muss 2 sein.
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({
          data: [
            {
              ...mockNearbyNv[0],
              id: 's-p1',
              volume_m3: 40,
              weight_kg: 1000,
              package_items: [
                {
                  id: 'i-p1',
                  length_cm: 120,
                  width_cm: 80,
                  height_cm: 100,
                  weight_kg: 500,
                  quantity: 2,
                  stackable: true,
                },
              ],
            },
            {
              ...mockNearbyNv[0],
              id: 's-p2',
              volume_m3: 40,
              weight_kg: 1000,
              package_items: [
                {
                  id: 'i-p2',
                  length_cm: 120,
                  width_cm: 80,
                  height_cm: 100,
                  weight_kg: 500,
                  quantity: 2,
                  stackable: true,
                },
              ],
            },
            {
              ...mockNearbyNv[0],
              id: 's-p3',
              volume_m3: 40,
              weight_kg: 1000,
              package_items: [
                {
                  id: 'i-p3',
                  length_cm: 120,
                  width_cm: 80,
                  height_cm: 100,
                  weight_kg: 500,
                  quantity: 2,
                  stackable: true,
                },
              ],
            },
          ],
        });
      }
      // T1: fahrzeug_typ='Sattel' → cap 88 m³ damit 40+40=80<88 fits
      // → 2 LKW. Ohne fiel resolveVehicleCapacity auf Koffer 7t (35.7
      // m³) zurueck → 3 LKW.
      return Promise.resolve({
        data: { stops: [], fahrzeug_typ: 'Sattel' },
      });
    });
    // placePackages-Stub liefert pro Aufruf 1 placed-Item pro Eingang
    // (mockt das echte Pack — Test-Fokus: Datafluss, nicht Pack-Logik).
    placePkgSpy.mockImplementation((...args: unknown[]) => {
      const items = args[0] as Array<{ id: string; shipmentId?: string }>;
      return items.map((it) => ({
        id: it.id,
        shipmentId: it.shipmentId,
        lengthCm: 120,
        widthCm: 80,
        heightCm: 100,
        posX: 0,
        posY: 0,
        posZ: 0,
        color: '#3b82f6',
        unplaced: false,
      }));
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    const slot = await screen.findByText(
      /PLZ 80331 · 3 Sdg · ≈ 2 LKW/,
    );
    const li = slot.closest('[data-slot]')!;
    expect(li.getAttribute('data-packed-count')).toBe('2');
    // Jeder Trailer hat placedItems (mock-placePackages liefert items.length).
    const itemsPerTrailer = li.getAttribute('data-packed-items')!.split(',');
    expect(itemsPerTrailer).toHaveLength(2);
    expect(itemsPerTrailer.every((n) => Number(n) > 0)).toBe(true);
    // Keiner capped (3 × 2 = 6 Items, weit unter Threshold 600).
    expect(li.getAttribute('data-packed-capped')).toBe('0,0');
  });

  it('S-6.3 B: package_items=null in nearby → packedTrailers ohne Items', async () => {
    // Sendung ohne package_items (BE-Backwards-Compat) → FFD trotzdem
    // OK (Volumen-basiert), aber Items-Liste pro Trailer leer.
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({
          data: [
            {
              ...mockNearbyNv[0],
              id: 's-no-items',
              volume_m3: 20,
              weight_kg: 500,
              package_items: null,
            },
          ],
        });
      }
      return Promise.resolve({ data: { stops: [] } });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    const slot = await screen.findByText(/PLZ 80331 · 1 Sdg · ≈ 1 LKW/);
    const li = slot.closest('[data-slot]')!;
    expect(li.getAttribute('data-packed-count')).toBe('1');
    expect(li.getAttribute('data-packed-items')).toBe('0');
  });

  it('S-6.3 Overflow-Grund "Σ Vol > Kapazität" wenn Σ Vol > Sattel-Vol', async () => {
    // 1 unplaced + 1 placed XXL — Σ Vol > 88 m³ Sattel-Default.
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          id: 'tour-1',
          stops: [
            {
              id: 'stop-xxl',
              shipment: {
                id: 'sh-xxl',
                shipment_number: 'XXL-1',
                length_cm: 1360,
                width_cm: 240,
                height_cm: 270,
                weight_kg: 5000,
                volume_m3: 88.0,
              },
            },
            {
              id: 'stop-of',
              shipment: {
                id: 'sh-of',
                shipment_number: 'OF-1',
                length_cm: 200,
                width_cm: 240,
                height_cm: 270,
                weight_kg: 500,
                volume_m3: 12.96,
              },
            },
          ],
        },
      });
    });
    // 1 placed XXL (verbraucht fast 88 m³), 1 unplaced gross (13 m³)
    flattenNvSpy.mockImplementation(() => [
      {
        id: 'pkg-xxl',
        shipmentId: 'sh-xxl',
        lengthCm: 1360,
        widthCm: 240,
        heightCm: 270,
        posX: 0,
        posY: 0,
        posZ: 0,
        color: '#888',
        unplaced: false,
      },
      {
        id: 'pkg-of',
        shipmentId: 'sh-of',
        lengthCm: 200,
        widthCm: 240,
        heightCm: 270,
        posX: 0,
        posY: 0,
        posZ: 0,
        color: '#ccc',
        unplaced: true,
      },
    ]);
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    expect(
      await screen.findByText(/Σ Vol > Kapazität/),
    ).toBeInTheDocument();
  });

  it('T1.6: FV-Hof zieht tour.max_ldm + tour.max_weight_kg → FFD nutzt die echte Cap', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockImplementation((url: string) => {
      if (url.includes('/nearby-shipments')) {
        // 2 Sdg je 30 m³ in Empfangs-PLZ — passt zusammen unter 88 m³
        // (Sattel-Default), aber NICHT unter Cap die wir per Tour
        // setzen (siehe /tours/tour-1 unten).
        return Promise.resolve({
          data: [
            {
              id: 's-a',
              shipment_number: 'F-A',
              weight_kg: 500,
              ldm: 4,
              volume_m3: 30,
              customer_name: 'A',
              lat: 48,
              lng: 11,
              zip: '80331',
              city: 'M',
              distance_km: 5,
              transport_type: 'DIREKT',
              delivery_zip: '50667',
            },
            {
              id: 's-b',
              shipment_number: 'F-B',
              weight_kg: 500,
              ldm: 4,
              volume_m3: 30,
              customer_name: 'B',
              lat: 48,
              lng: 11,
              zip: '80335',
              city: 'M',
              distance_km: 6,
              transport_type: 'DIREKT',
              delivery_zip: '50667',
            },
          ],
        });
      }
      if (url.includes('/loading/tour/tour-1/optimize')) {
        return Promise.resolve({ data: { loadingOrder: [] } });
      }
      if (url === '/tours/tour-1') {
        // Tour-Cap: max_ldm 8.7 → deriveBoxFromLdm → 870×240×240 ≈ 50 m³.
        // 30+30=60 m³ > 50 → 2 LKW (statt 1 wenn Sattel-Default).
        return Promise.resolve({
          data: { max_ldm: 8.7, max_weight_kg: 6000 },
        });
      }
      return Promise.resolve({ data: [] });
    });
    render(
      <Wrapper>
        <YardPanel />
      </Wrapper>,
    );
    expect(
      await screen.findByText(/Empfangs-PLZ 50667 · 2 Sdg · ≈ 2 LKW/),
    ).toBeInTheDocument();
  });
});

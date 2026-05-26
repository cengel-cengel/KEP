/**
 * Schritt 1 Test: NvLoadingPlanHofPanel — rechts-Spalte des NV-
 * Beladeplans. Datafluss: nearby-shipments → PLZ-Cluster → Cards.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

// api gemockt — pro Test ueberschreibbar.
const apiGet = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    get: (url: string) => apiGet(url),
  },
  AUTH_TOKEN_KEY: 'tms_token',
}));

// state/panel: selectShipment-Spy
const selectShipmentSpy = vi.fn();
vi.mock('../state/panel', () => ({
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

import NvLoadingPlanHofPanel from './NvLoadingPlanHofPanel';

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
  apiGet.mockReset();
  selectShipmentSpy.mockClear();
});

describe('NvLoadingPlanHofPanel — Schritt 1', () => {
  it('Kein tourId → Hinweis-Text statt Liste', () => {
    apiGet.mockResolvedValue({ data: [] });
    render(
      <Wrapper>
        <NvLoadingPlanHofPanel tourId={null} />
      </Wrapper>,
    );
    expect(screen.getByText(/Kein Tour-Kontext/)).toBeInTheDocument();
  });

  it('Leerer Pool: Hinweis "Keine Sendungen im 20-km-Umkreis"', async () => {
    apiGet.mockResolvedValue({ data: [] });
    render(
      <Wrapper>
        <NvLoadingPlanHofPanel tourId="t-1" />
      </Wrapper>,
    );
    expect(
      await screen.findByText(/Keine Sendungen im 20-km-Umkreis/),
    ).toBeInTheDocument();
  });

  it('PLZ-Cluster-Aggregation: 80331 + 80335 → "803xx"-Lane mit 2 Sdg', async () => {
    apiGet.mockResolvedValue({
      data: [
        {
          id: 's-1',
          shipment_number: 'N-1',
          weight_kg: 1500,
          ldm: 2,
          volume_m3: 12,
          effective_pallets: 3,
          customer_name: 'A',
          lat: 48,
          lng: 11,
          zip: '80331',
          city: 'M',
          distance_km: 5,
        },
        {
          id: 's-2',
          shipment_number: 'N-2',
          weight_kg: 700,
          ldm: 1,
          volume_m3: 8,
          effective_pallets: 2,
          customer_name: 'B',
          lat: 48,
          lng: 11,
          zip: '80335',
          city: 'M',
          distance_km: 7,
        },
      ],
    });
    render(
      <Wrapper>
        <NvLoadingPlanHofPanel tourId="t-1" />
      </Wrapper>,
    );
    // Cluster-Header: "803xx · 2 Sdg · ≈ 1 LKW" (12+8=20 m³ < 88).
    expect(
      await screen.findByText(/803xx · 2 Sdg · ≈ 1 LKW/),
    ).toBeInTheDocument();
    // Beide Sendung-Cards sichtbar.
    expect(screen.getByTestId('hof-card-s-1')).toBeInTheDocument();
    expect(screen.getByTestId('hof-card-s-2')).toBeInTheDocument();
  });

  it('Tap auf Card → Modal öffnet mit nearby-Daten (kein extra Fetch)', async () => {
    apiGet.mockResolvedValue({
      data: [
        {
          id: 's-1',
          shipment_number: 'N-1',
          weight_kg: 1500,
          ldm: 2,
          volume_m3: 12.5,
          effective_pallets: 3,
          customer_name: 'Kunde Mueller',
          lat: 48,
          lng: 11,
          zip: '80331',
          city: 'Muenchen',
          loading_street: 'Marienplatz 1',
          loading_country: 'DE',
          distance_km: 18.7,
        },
      ],
    });
    render(
      <Wrapper>
        <NvLoadingPlanHofPanel tourId="t-1" />
      </Wrapper>,
    );
    const card = await screen.findByTestId('hof-card-s-1');
    fireEvent.click(card);
    // Modal hat aria-label "Schließen" am X-Button.
    expect(await screen.findByLabelText('Schließen')).toBeInTheDocument();
    // selectShipment NICHT direkt — erst nach "Volle Details".
    expect(selectShipmentSpy).not.toHaveBeenCalled();
  });

  it('Mini-Kennzahlen pro Card: Vol/Gew/Pal/dist sichtbar', async () => {
    apiGet.mockResolvedValue({
      data: [
        {
          id: 's-mini',
          shipment_number: 'M-1',
          weight_kg: 800,
          ldm: 1,
          volume_m3: 4.2,
          effective_pallets: 2,
          customer_name: 'C',
          lat: 48,
          lng: 11,
          zip: '70435',
          city: 'S',
          distance_km: 3.4,
        },
      ],
    });
    render(
      <Wrapper>
        <NvLoadingPlanHofPanel tourId="t-1" />
      </Wrapper>,
    );
    const card = await screen.findByTestId('hof-card-s-mini');
    // Format: "4.2 m³ · 800 kg · 2 Pal · 3.4 km"
    expect(card.textContent).toMatch(/4\.2 m³/);
    expect(card.textContent).toMatch(/800 kg/);
    expect(card.textContent).toMatch(/2 Pal/);
    expect(card.textContent).toMatch(/3\.4 km/);
  });
});

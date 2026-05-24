/**
 * F2.2.a Smoke-Render fuer NvSwapOptimizerModal.
 *
 * Scope: renders-without-crash mit mock-NvLoadingDetail. KEIN
 * Coverage-Detail — der Algorithmus selbst ist in nvSwapOptimizer.
 * test.ts ausfuehrlich getestet.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Mock VOR Imports ──────────────────────────────────────────
// vi.mock wird hochgehoist — Mock-Daten muessen INNERHALB der
// Factory leben (sonst "Cannot access before initialization").
vi.mock('../../lib/api', () => {
  const mockLoadingDetail = {
    id: 'tour-1',
    datum: '2026-05-24',
    status: 'PLANNING',
    fahrzeug_typ: '12T',
    nv_stamm_tour_id: 'stamm-1',
    nv_stamm_tour: { code: 'NV-A', name: 'A-Runde' },
    subunternehmer: {
      id: 'sub-1',
      name: 'Sub Mueller',
      fahrzeug_typ: '12T',
      max_ldm: null,
      max_gewicht_kg: null,
    },
    stops: [
      {
        id: 'stop-1',
        position: 1,
        is_stamm_kunde: true,
        shipment: {
          id: 'sh-stamm',
          shipment_number: 'S-STAMM',
          ldm: 4,
          weight_kg: 1000,
          length_cm: 480,
          width_cm: 240,
          height_cm: 100,
          customer_id: 'cust-1',
          loading_date: '2026-05-24',
          status: 'new',
          has_active_lock: false,
          is_hazmat: false,
          customers: { priority_tier: null },
          shipment_package_items: [
            {
              id: 'pi-1',
              line_index: 0,
              quantity: 1,
              length_cm: 480,
              width_cm: 240,
              height_cm: 100,
              weight_kg: 1000,
              stackable: false,
            },
          ],
        },
      },
      {
        id: 'stop-2',
        position: 2,
        is_stamm_kunde: false,
        shipment: {
          id: 'sh-a',
          shipment_number: 'S-A',
          ldm: 3,
          weight_kg: 800,
          length_cm: 360,
          width_cm: 240,
          height_cm: 100,
          customer_id: 'cust-2',
          loading_date: '2026-05-24',
          status: 'new',
          has_active_lock: false,
          is_hazmat: false,
          customers: { priority_tier: null },
          // O-1-Fix: package_items × qty deliver weightKg + volumeM3.
          shipment_package_items: [
            {
              id: 'pi-2',
              line_index: 0,
              quantity: 1,
              length_cm: 360,
              width_cm: 240,
              height_cm: 100,
              weight_kg: 800,
              stackable: true,
            },
          ],
        },
      },
      {
        id: 'stop-3',
        position: 3,
        is_stamm_kunde: false,
        shipment: {
          id: 'sh-b',
          shipment_number: 'S-B',
          ldm: 4,
          weight_kg: 900,
          length_cm: 480,
          width_cm: 240,
          height_cm: 100,
          customer_id: 'cust-3',
          loading_date: '2026-05-24',
          status: 'new',
          has_active_lock: false,
          is_hazmat: false,
          customers: { priority_tier: null },
          shipment_package_items: [
            {
              id: 'pi-3',
              line_index: 0,
              quantity: 1,
              length_cm: 480,
              width_cm: 240,
              height_cm: 100,
              weight_kg: 900,
              stackable: true,
            },
          ],
        },
      },
    ],
  };
  return {
    api: {
      // URL-aware: loading-Endpoint vs best-match-Endpoint
      // (F2.2.b-1 — useQueries pro ejectId).
      get: vi.fn((url: string) => {
        if (typeof url === 'string' && url.includes('/best-match')) {
          return Promise.resolve({ data: [] });
        }
        return Promise.resolve({ data: mockLoadingDetail });
      }),
    },
    AUTH_TOKEN_KEY: 'tms_token',
  };
});

// ─── Imports NACH Mocks ────────────────────────────────────────
import NvSwapOptimizerModal from './NvSwapOptimizerModal';

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('NvSwapOptimizerModal — smoke', () => {
  it('rendert ohne crash mit mock-Daten', () => {
    expect(() =>
      render(
        <Wrapper>
          <NvSwapOptimizerModal sourceTourId="tour-1" onClose={() => {}} />
        </Wrapper>,
      ),
    ).not.toThrow();
  });

  it('Header zeigt Tour-Code', async () => {
    const { findByText } = render(
      <Wrapper>
        <NvSwapOptimizerModal sourceTourId="tour-1" onClose={() => {}} />
      </Wrapper>,
    );
    // Modal-Header enthaelt den Code aus mockLoadingDetail.
    await findByText(/NV-A/);
  });
});

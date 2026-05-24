/**
 * F2.3.a/b Smoke-Render fuer FvSwapOptimizerModal.
 *
 * Mock-FvOptimizeResponse mit 3 Sendungen (1 VIP-Kunde + 2
 * swappable, leicht ueberladen). F2.3.b-2 verifiziert dass der
 * Ausfuehren-Button mit korrektem N erscheint, ohne tatsaechlich
 * api.post zu triggern (kein Klick).
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/api', () => {
  // Mock-Daten innerhalb der Factory (vitest hoists).
  const mockOptimize = {
    recommendedVehicle: {
      type: 'Sattel',
      lengthCm: 1360,
      widthCm: 240,
      heightCm: 270,
      maxWeightKg: 24000,
      maxLdm: 13.6,
    },
    loadingOrder: [
      {
        id: 'sh-vip',
        shipmentNumber: 'F-VIP',
        ldm: 4,
        weightKg: 10000,
        loadingDate: '2026-05-24',
        status: 'new',
        hasActiveLock: false,
        isHazmat: false,
        customerPriorityTier: 'VIP',
        packageItems: [
          {
            id: 'pi-1',
            quantity: 1,
            lengthCm: 480,
            widthCm: 240,
            heightCm: 100,
            weightKg: 10000,
            stackable: false,
          },
        ],
      },
      {
        id: 'sh-a',
        shipmentNumber: 'F-A',
        ldm: 3,
        weightKg: 10000,
        loadingDate: '2026-05-24',
        status: 'new',
        hasActiveLock: false,
        isHazmat: false,
        customerPriorityTier: 'B',
        packageItems: [
          {
            id: 'pi-2',
            quantity: 1,
            lengthCm: 360,
            widthCm: 240,
            heightCm: 100,
            weightKg: 10000,
            stackable: true,
          },
        ],
      },
      {
        id: 'sh-b',
        shipmentNumber: 'F-B',
        ldm: 4,
        weightKg: 10000,
        loadingDate: '2026-05-24',
        status: 'new',
        hasActiveLock: false,
        isHazmat: false,
        customerPriorityTier: null,
        packageItems: [
          {
            id: 'pi-3',
            quantity: 1,
            lengthCm: 480,
            widthCm: 240,
            heightCm: 100,
            weightKg: 10000,
            stackable: true,
          },
        ],
      },
    ],
  };
  // F2.3.b-1/2: Best-Match-Mock liefert eine FV-Ziel-Tour (nicht
  // die Source). Damit hat der Optimizer-Eject mindestens 1 Target →
  // executableCount > 0 → Ausfuehren-Button erscheint.
  const mockBestMatch = [
    {
      tour_id: '99999999-1111-2222-3333-444444444444',
      mode: 'fv' as const,
      tour_number: 'FV-T-99',
      score: 0.82,
      reason: 'gleiche-Region',
      datum: '2026-05-25',
      subunternehmer_name: 'Sub-99',
      stops_count: 2,
    },
  ];
  // Phase 2: FV-Tours-Liste fuer Manual-Picker. tour-77 'planned',
  // tour-78 'planned', tour-99 'closed' (gefiltert). Source-Tour
  // (11111111-…) selbst nicht in der Liste — wuerde auch durch
  // !== sourceTourId rausgefiltert.
  const mockFvTouren = [
    {
      id: '77777777-aaaa-bbbb-cccc-000000000000',
      status: 'planned',
      tour_number: 'FV-T-77',
      tour_date: '2026-05-25',
      subcontractors: { name: 'Sub-77' },
    },
    {
      id: '88888888-aaaa-bbbb-cccc-000000000000',
      status: 'planned',
      tour_number: 'FV-T-78',
      tour_date: '2026-05-26',
      subcontractors: { name: 'Sub-78' },
    },
    {
      id: 'cccccccc-aaaa-bbbb-cccc-000000000000',
      status: 'closed',
      tour_number: 'FV-T-99',
      tour_date: '2026-05-20',
      subcontractors: { name: 'Sub-99' },
    },
  ];
  // Phase 3: Subcontractors fuer Neue-Tour-Form.
  const mockSubs = [
    { id: 'sub-1', name: 'Sub Mueller' },
    { id: 'sub-2', name: 'Sub Schmidt' },
  ];
  return {
    api: {
      // URL-aware:
      //  /best-match     → mockBestMatch (Auto-Ziel da)
      //  /tours          → mockFvTouren (Phase-2 Manual-Picker)
      //  /subcontractors → mockSubs (Phase 3 Neue-Tour-Sub-Dropdown)
      //  default         → mockOptimize (Source-Tour-Detail)
      get: vi.fn((url: string) => {
        if (typeof url === 'string' && url.includes('/best-match')) {
          return Promise.resolve({ data: mockBestMatch });
        }
        if (typeof url === 'string' && url === '/tours') {
          return Promise.resolve({ data: mockFvTouren });
        }
        if (typeof url === 'string' && url === '/subcontractors') {
          return Promise.resolve({ data: mockSubs });
        }
        return Promise.resolve({ data: mockOptimize });
      }),
      // Phase 3: POST /tours → neue Tour. batch-stops → ok.
      post: vi.fn((url: string) => {
        if (typeof url === 'string' && url === '/tours') {
          return Promise.resolve({ data: { id: 'new-tour-1' } });
        }
        return Promise.resolve({ data: { ok: true } });
      }),
      delete: vi.fn().mockResolvedValue({ data: { ok: true } }),
    },
    AUTH_TOKEN_KEY: 'tms_token',
  };
});

import FvSwapOptimizerModal from './FvSwapOptimizerModal';

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('FvSwapOptimizerModal — smoke', () => {
  it('rendert ohne crash mit mock-OptimizeResponse', () => {
    expect(() =>
      render(
        <Wrapper>
          <FvSwapOptimizerModal
            sourceTourId="11111111-2222-3333-4444-555555555555"
            onClose={() => {}}
          />
        </Wrapper>,
      ),
    ).not.toThrow();
  });

  it('Header zeigt FV-Praefix mit ID-Kurzform', async () => {
    const { findByText } = render(
      <Wrapper>
        <FvSwapOptimizerModal
          sourceTourId="11111111-2222-3333-4444-555555555555"
          onClose={() => {}}
        />
      </Wrapper>,
    );
    // ID-Slice(0,8) = "11111111"
    await findByText(/FV 11111111/);
  });

  it('F2.3.b-2: Ausfuehren-Button erscheint mit executableCount > 0', async () => {
    const { findByRole } = render(
      <Wrapper>
        <FvSwapOptimizerModal
          sourceTourId="11111111-2222-3333-4444-555555555555"
          onClose={() => {}}
        />
      </Wrapper>,
    );
    // Mind. 1 Eject + best-match liefert FV-Target → Button "Ausführen (N)".
    const btn = await findByRole('button', { name: /Ausführen \(\d+\)/ });
    expect(btn).toBeTruthy();
  });

  it('Phase 1: Dispotopf-Auswahl im Selector haelt Eject ausfuehrbar', async () => {
    const { findAllByTitle, findByRole } = render(
      <Wrapper>
        <FvSwapOptimizerModal
          sourceTourId="11111111-2222-3333-4444-555555555555"
          onClose={() => {}}
        />
      </Wrapper>,
    );
    const selects = await findAllByTitle(/Ziel der Sendung waehlen/);
    expect(selects.length).toBeGreaterThan(0);
    fireEvent.change(selects[0], { target: { value: '__pool__' } });
    // Pool-Modus → Ausfuehren-Button bleibt sichtbar (Pool zaehlt
    // ohne Auto-Match in executableCount).
    const execBtn = await findByRole('button', {
      name: /Ausführen \(\d+\)/,
    });
    expect(execBtn).toBeTruthy();
  });

  it('Phase 2: Manual-Auswahl (anderer FV-Tour) macht Eject ausfuehrbar', async () => {
    // FV-Tours-Mock liefert tour-77 ('planned') als Manual-Option.
    // Selector-Change auf diese tourId → kind='manual' +
    // manualTourId='77…' → "Ausführen (N)" bleibt sichtbar (oder
    // erhoeht sich falls Auto vorher schon zaehlte).
    const { findAllByTitle, findByRole } = render(
      <Wrapper>
        <FvSwapOptimizerModal
          sourceTourId="11111111-2222-3333-4444-555555555555"
          onClose={() => {}}
        />
      </Wrapper>,
    );
    const selects = await findAllByTitle(/Ziel der Sendung waehlen/);
    fireEvent.change(selects[0], {
      target: { value: '77777777-aaaa-bbbb-cccc-000000000000' },
    });
    const execBtn = await findByRole('button', {
      name: /Ausführen \(\d+\)/,
    });
    expect(execBtn).toBeTruthy();
  });

  it('Phase 3: "Neue Tour"-Auswahl zeigt Gruppen-Form (Datum + Sub)', async () => {
    const { findAllByTitle, findByText } = render(
      <Wrapper>
        <FvSwapOptimizerModal
          sourceTourId="11111111-2222-3333-4444-555555555555"
          onClose={() => {}}
        />
      </Wrapper>,
    );
    const selects = await findAllByTitle(/Ziel der Sendung waehlen/);
    fireEvent.change(selects[0], { target: { value: '__new__' } });
    await findByText(/Neue Gruppen-Tour/);
    // Default-Datum (heute) gesetzt → executableCount > 0.
    const execBtn = await findByText(/Ausführen \(\d+\)/);
    expect(execBtn).toBeTruthy();
  });

  it('Phase 3: "↗ eigen"-Toggle zeigt inline Form fuer einzelnen Eject', async () => {
    const { findAllByTitle, findByText, findByTitle } = render(
      <Wrapper>
        <FvSwapOptimizerModal
          sourceTourId="11111111-2222-3333-4444-555555555555"
          onClose={() => {}}
        />
      </Wrapper>,
    );
    const selects = await findAllByTitle(/Ziel der Sendung waehlen/);
    fireEvent.change(selects[0], { target: { value: '__new__' } });
    const eigenBtn = await findByTitle(/Eigene Tour fuer diese Sendung/);
    fireEvent.click(eigenBtn);
    const execBtn = await findByText(/Ausführen \(\d+\)/);
    expect(execBtn).toBeTruthy();
  });
});

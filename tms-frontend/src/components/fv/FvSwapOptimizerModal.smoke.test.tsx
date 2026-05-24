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
  return {
    api: {
      // URL-aware: optimize-Endpoint vs best-match-Endpoint
      // (F2.3.b-1 — useQueries pro ejectId).
      get: vi.fn((url: string) => {
        if (typeof url === 'string' && url.includes('/best-match')) {
          return Promise.resolve({ data: mockBestMatch });
        }
        return Promise.resolve({ data: mockOptimize });
      }),
      // F2.3.b-2: post-Mock NUR fuer Type-Surface — Smoke-Test
      // klickt KEIN Ausfuehren, also wird's hier nie aufgerufen.
      post: vi.fn(() => Promise.resolve({ data: { ok: true } })),
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

  it('Phase 1: Dispotopf-Toggle schaltet Eject auf "↓ Dispotopf"-Label', async () => {
    // best-match-Mock liefert FV-Target → kind='best' rendert
    // Alt-Tour-Label. Nach "↓"-Klick: Label wechselt zu
    // "↓ Dispotopf" + Toggle-Button-Text wird "Auto".
    const { findAllByTitle, findByText } = render(
      <Wrapper>
        <FvSwapOptimizerModal
          sourceTourId="11111111-2222-3333-4444-555555555555"
          onClose={() => {}}
        />
      </Wrapper>,
    );
    const toggleButtons = await findAllByTitle(
      /Statt Auto-Ziel in Dispotopf entlassen/,
    );
    expect(toggleButtons.length).toBeGreaterThan(0);
    fireEvent.click(toggleButtons[0]);
    // Label-Switch: "↓ Dispotopf" erscheint nach Toggle.
    await findByText(/↓ Dispotopf/);
  });
});

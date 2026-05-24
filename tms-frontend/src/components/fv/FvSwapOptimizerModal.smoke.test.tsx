/**
 * F2.3.a Smoke-Render fuer FvSwapOptimizerModal.
 *
 * Mock-FvOptimizeResponse mit 3 Sendungen (1 VIP-Kunde + 2
 * swappable, leicht ueberladen). Test prueft nur Render + Header.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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
        weightKg: 1000,
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
            weightKg: 1000,
            stackable: false,
          },
        ],
      },
      {
        id: 'sh-a',
        shipmentNumber: 'F-A',
        ldm: 3,
        weightKg: 800,
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
            weightKg: 800,
            stackable: true,
          },
        ],
      },
      {
        id: 'sh-b',
        shipmentNumber: 'F-B',
        ldm: 4,
        weightKg: 900,
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
            weightKg: 900,
            stackable: true,
          },
        ],
      },
    ],
  };
  return {
    api: {
      get: vi.fn().mockResolvedValue({ data: mockOptimize }),
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
});

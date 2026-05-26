/**
 * BUG-D-Fix Tests: LoadingPlanPanel (Dock-Panel, NV).
 *
 * Carlos-Repro: tour.fahrzeug_typ='12T', sub.max_ldm=12 →
 *   Vor Fix: getVehicleDims('12T') → Koffer 7t (620cm). Trailer-
 *     Rahmen 6.2m. packages packed gegen 6.2m → 3 unplaced bei
 *     (0,0,0). KEIN Filter vor LoadingPlan3D → unplaced stapeln
 *     visuell → "verschachtelt".
 *   Nach Fix: resolveVehicleCapacity → 12.0m. Pack passt sauber.
 *     unplaced (falls vorhanden) wird gefiltert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// LoadingPlan3D-Stub: exposed vehicle prop + packages-IDs als
// data-attrs damit wir die Props inspizieren koennen.
const lp3dProps = vi.fn();
vi.mock('../../components/LoadingPlan3D', () => ({
  default: ({
    vehicle,
    packages,
  }: {
    vehicle: { lengthCm: number; widthCm: number; heightCm: number };
    packages: Array<{ id: string; unplaced?: boolean }>;
  }) => {
    lp3dProps({ vehicle, packages });
    return (
      <div
        data-testid="lp3d-stub"
        data-vehicle-l={vehicle.lengthCm}
        data-vehicle-w={vehicle.widthCm}
        data-pkg-count={packages.length}
        data-unplaced-count={packages.filter((p) => p.unplaced).length}
      />
    );
  },
}));

// PanelShell ist internal in LoadingPlanPanel.tsx → KEIN mock noetig.
// Wir lesen vehicleInfo aus dem gerenderten DOM ("· 12T · 12.0×...").

const apiGet = vi.fn();
vi.mock('../../lib/api', () => ({
  api: {
    get: (url: string) => apiGet(url),
  },
  AUTH_TOKEN_KEY: 'tms_token',
}));

vi.mock('../../state/workspace', () => ({
  useWorkspace: () => ({ mode: 'nv' as 'nv' | 'fv' }),
}));

const activeTourViewId = 'tour-1';
vi.mock('../runtime/WorkspaceRuntimeContext', () => ({
  useWorkspaceRuntime: () => ({ activeTourViewId }),
}));

vi.mock('./DockPanelContext', () => ({
  useDockPanelApi: () => null,
}));

import LoadingPlanPanel from './LoadingPlanPanel';

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

beforeEach(() => {
  lp3dProps.mockClear();
  apiGet.mockReset();
});

// Carlos-Fixture: 12T-Tour mit 12 Klonen (würde in 6.2m überlaufen).
const TOUR_12T = {
  id: 'tour-1',
  datum: '2026-05-26',
  status: 'PLANNING',
  fahrzeug_typ: '12T',
  nv_stamm_tour: { code: 'NV-A', name: 'A-Runde' },
  subunternehmer: {
    id: 'sub-1',
    name: 'Sub Mueller',
    fahrzeug_typ: '12T',
    max_ldm: 12,
    max_gewicht_kg: 8000,
  },
  stops: [
    {
      id: 'stop-A',
      position: 1,
      shipment: {
        id: 'ship-A',
        shipment_number: 'A',
        ldm: 1.6,
        weight_kg: 100,
        shipment_package_items: [
          {
            id: 'pi-A',
            line_index: 1,
            quantity: 1,
            length_cm: 160,
            width_cm: 80,
            height_cm: 197,
            weight_kg: 100,
            stackable: true,
            pos_x_cm: null,
            pos_y_cm: null,
            pos_z_cm: null,
            rotation_deg: 0,
          },
        ],
      },
    },
    {
      id: 'stop-D',
      position: 2,
      shipment: {
        id: 'ship-D',
        shipment_number: 'D',
        ldm: 1.9,
        weight_kg: 100,
        shipment_package_items: [
          {
            id: 'pi-D',
            line_index: 1,
            quantity: 7,
            length_cm: 190,
            width_cm: 110,
            height_cm: 100,
            weight_kg: 100,
            stackable: true,
            pos_x_cm: null,
            pos_y_cm: null,
            pos_z_cm: null,
            rotation_deg: 0,
          },
        ],
      },
    },
    {
      id: 'stop-B',
      position: 3,
      shipment: {
        id: 'ship-B',
        shipment_number: 'B',
        ldm: 1.2,
        weight_kg: 100,
        shipment_package_items: [
          {
            id: 'pi-B',
            line_index: 1,
            quantity: 2,
            length_cm: 120,
            width_cm: 80,
            height_cm: 157,
            weight_kg: 100,
            stackable: true,
            pos_x_cm: null,
            pos_y_cm: null,
            pos_z_cm: null,
            rotation_deg: 0,
          },
        ],
      },
    },
    {
      id: 'stop-C',
      position: 4,
      shipment: {
        id: 'ship-C',
        shipment_number: 'C',
        ldm: 1.2,
        weight_kg: 100,
        shipment_package_items: [
          {
            id: 'pi-C',
            line_index: 1,
            quantity: 2,
            length_cm: 120,
            width_cm: 80,
            height_cm: 157,
            weight_kg: 100,
            stackable: true,
            pos_x_cm: null,
            pos_y_cm: null,
            pos_z_cm: null,
            rotation_deg: 0,
          },
        ],
      },
    },
  ],
};

describe('LoadingPlanPanel BUG-D-Fix (12T-Tour)', () => {
  it('Trailer-Rahmen: vehicle.lengthCm === 1200 (resolveVehicleCapacity) — NICHT 620 (Koffer-7t-Fallback)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    // useQuery laeuft async — warte bis Stub die props bekommt.
    await vi.waitFor(() => {
      expect(lp3dProps).toHaveBeenCalled();
    });
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    expect(lastCall.vehicle.lengthCm).toBe(1200);
    expect(lastCall.vehicle.widthCm).toBe(240);
    expect(lastCall.vehicle.heightCm).toBe(240);
  });

  it('unplaced wird vor LoadingPlan3D gefiltert (kein Stack bei 0,0,0)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(lp3dProps).toHaveBeenCalled();
    });
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    // Alle packages.unplaced === false (Filter greift).
    const unplaced = lastCall.packages.filter(
      (p: { unplaced?: boolean }) => p.unplaced,
    );
    expect(unplaced.length).toBe(0);
    // 12 Klone passen in 12m-Trailer → alle 12 placed.
    expect(lastCall.packages.length).toBe(12);
  });

  it('vehicleInfo-Label: "12T · 12.0×2.40×2.40 m" (Tonnen-Typ + capacity-Dims)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { findByText } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    // PanelShell rendert "· {vehicleInfo}" in einem Span. Sucht den
    // Span-Text — sollte fahrzeug_typ "12T" + capacity-Dims (12.0m)
    // zeigen, NICHT Koffer 7t · 6.2m.
    expect(
      await findByText(/12T · 12\.0×2\.40×2\.40 m/),
    ).toBeInTheDocument();
  });
});

/**
 * Schritt 2 KRITISCHER Test: Übernehmen-Mutation persistiert
 * Sandbox-State VOLLSTAENDIG + KORREKT.
 *
 * Carlos-Akzeptanz: "Auto-PATCH wird entfernt. Übernehmen muss
 * vollstaendig + korrekt persistieren — sonst Daten-Verlust."
 *
 * Scope
 *   · Position-Override → PATCH /loading/package-item/:id/position
 *   · Ejected Shipment → DELETE /nv-touren/:tourId/stops/:stopId
 *   · Reihenfolge: Position-Patches ZUERST, Stops danach.
 *   · Sandbox wird NUR bei vollstaendigem Erfolg geleert.
 *   · Error → Sandbox bleibt erhalten + Toast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// LoadingPlan3D stub — vermeidet three.js im jsdom + exposed
// onPositionChange als Test-Button.
vi.mock('../components/LoadingPlan3D', () => ({
  default: ({
    packages,
    onPositionChange,
    onPackageContextMenu,
  }: {
    packages: Array<{ id: string }>;
    onPositionChange: (
      id: string,
      x: number,
      y: number,
      z: number,
    ) => void;
    onPackageContextMenu?: (id: string, x: number, y: number) => void;
  }) => (
    <div data-testid="lp3d-stub">
      {packages.map((p) => (
        <div key={p.id}>
          <button
            data-testid={`drag-${p.id}`}
            onClick={() => onPositionChange(p.id, 100, 200, 0)}
          >
            drag {p.id}
          </button>
          <button
            data-testid={`ctxmenu-${p.id}`}
            onClick={() => onPackageContextMenu?.(p.id, 10, 10)}
          >
            ctx {p.id}
          </button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../components/AxleLoadPanel', () => ({
  default: () => <div data-testid="axle-stub" />,
}));

vi.mock('./NvLoadingPlanHofPanel', () => ({
  default: () => <div data-testid="hof-stub" />,
}));

// confirm-Dialog auto-accept (Eject braucht es).
beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const apiGet = vi.fn();
const apiPatch = vi.fn().mockResolvedValue({ data: {} });
const apiDelete = vi.fn().mockResolvedValue({ data: {} });
vi.mock('../lib/api', () => ({
  api: {
    get: (url: string) => apiGet(url),
    patch: (url: string, body: unknown) => apiPatch(url, body),
    delete: (url: string) => apiDelete(url),
  },
  AUTH_TOKEN_KEY: 'tms_token',
}));

vi.mock('../realtime/realtimeClient', () => ({
  getClientId: () => 'test-client',
}));

import NvLoadingPlanPage from './NvLoadingPlanPage';

afterEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset().mockResolvedValue({ data: {} });
  apiDelete.mockReset().mockResolvedValue({ data: {} });
});

const TOUR_FIXTURE = {
  id: 'tour-1',
  datum: '2099-12-31',
  status: 'PLANNING',
  fahrzeug_typ: 'Sattel',
  nv_stamm_tour: { code: 'NV-A', name: 'A-Runde' },
  subunternehmer: {
    id: 'sub-1',
    name: 'Sub Mueller',
    fahrzeug_typ: 'Sattel',
    max_ldm: 13.6,
    max_gewicht_kg: 24000,
  },
  stops: [
    {
      id: 'stop-1',
      position: 1,
      is_stamm_kunde: true,
      shipment: {
        id: 'sh-1',
        shipment_number: 'S-1',
        ldm: 2,
        weight_kg: 500,
        length_cm: 120,
        width_cm: 80,
        height_cm: 100,
        customer_id: 'c-1',
        loading_date: '2099-12-31',
        status: 'new',
        has_active_lock: false,
        is_hazmat: false,
        customers: { priority_tier: null },
        shipment_package_items: [
          {
            id: 'pi-1',
            line_index: 0,
            quantity: 1,
            length_cm: 120,
            width_cm: 80,
            height_cm: 100,
            weight_kg: 500,
            stackable: true,
          },
        ],
      },
    },
    {
      id: 'stop-2',
      position: 2,
      is_stamm_kunde: false,
      shipment: {
        id: 'sh-2',
        shipment_number: 'S-2',
        ldm: 2,
        weight_kg: 500,
        length_cm: 120,
        width_cm: 80,
        height_cm: 100,
        customer_id: 'c-2',
        loading_date: '2099-12-31',
        status: 'new',
        has_active_lock: false,
        is_hazmat: false,
        customers: { priority_tier: null },
        shipment_package_items: [
          {
            id: 'pi-2',
            line_index: 0,
            quantity: 1,
            length_cm: 120,
            width_cm: 80,
            height_cm: 100,
            weight_kg: 500,
            stackable: true,
          },
        ],
      },
    },
  ],
};

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <MemoryRouter initialEntries={['/nv-loading/tour-1']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/nv-loading/:tourId" element={children} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('NvLoadingPlanPage Übernehmen-Mutation (Schritt 2)', () => {
  it('Initial: Übernehmen disabled (Sandbox leer)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_FIXTURE });
    render(
      <Wrapper>
        <NvLoadingPlanPage />
      </Wrapper>,
    );
    const btn = await screen.findByRole('button', { name: /Übernehmen/ });
    expect(btn).toBeDisabled();
    expect(apiPatch).not.toHaveBeenCalled();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it('Drag → Sandbox-Override, KEIN auto-PATCH', async () => {
    apiGet.mockResolvedValue({ data: TOUR_FIXTURE });
    render(
      <Wrapper>
        <NvLoadingPlanPage />
      </Wrapper>,
    );
    // Drag pi-1 — der Stub triggert handlePosition(pi-1, 100, 200, 0).
    const dragBtn = await screen.findByTestId('drag-pi-1');
    fireEvent.click(dragBtn);
    // Sandbox-Badge erscheint.
    expect(
      await screen.findByText(/Sandbox: 1 Änderung/),
    ).toBeInTheDocument();
    // KEIN BE-Write.
    expect(apiPatch).not.toHaveBeenCalled();
    // Übernehmen ist jetzt enabled.
    const uebBtn = screen.getByRole('button', { name: /Übernehmen/ });
    expect(uebBtn).not.toBeDisabled();
  });

  it('Übernehmen: PATCH alle positionOverrides + DELETE ejected Stops (in Reihenfolge)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_FIXTURE });
    render(
      <Wrapper>
        <NvLoadingPlanPage />
      </Wrapper>,
    );
    // 1 Drag + 1 Eject.
    fireEvent.click(await screen.findByTestId('drag-pi-1'));
    fireEvent.click(screen.getByTestId('ctxmenu-pi-2'));
    fireEvent.click(
      await screen.findByText(/Sendung aus Tour entfernen \(Sandbox\)/),
    );
    expect(
      await screen.findByText(/Sandbox: 2 Änderung/),
    ).toBeInTheDocument();

    // Übernehmen klicken.
    fireEvent.click(screen.getByRole('button', { name: /Übernehmen/ }));

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledTimes(1);
      expect(apiDelete).toHaveBeenCalledTimes(1);
    });

    // Reihenfolge: PATCH zuerst (mock-call-order via mock.invocationCallOrder).
    const patchOrder = apiPatch.mock.invocationCallOrder[0];
    const deleteOrder = apiDelete.mock.invocationCallOrder[0];
    expect(patchOrder).toBeLessThan(deleteOrder);

    // PATCH-Inhalt: korrekte URL + body.
    expect(apiPatch.mock.calls[0]).toEqual([
      '/loading/package-item/pi-1/position',
      { posXCm: 100, posYCm: 200, posZCm: 0 },
    ]);
    // DELETE: korrekte stop-id (lookup ueber tour.stops).
    expect(apiDelete.mock.calls[0][0]).toBe(
      '/nv-touren/tour-1/stops/stop-2',
    );

    // Sandbox wird nach Erfolg geleert.
    await waitFor(() => {
      expect(screen.queryByText(/Sandbox: /)).toBeNull();
    });
  });

  it('Übernehmen-Fehler: Sandbox BLEIBT erhalten (kein Daten-Verlust)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_FIXTURE });
    // Erste Patch fails.
    apiPatch.mockRejectedValue({ response: { status: 500 } });
    render(
      <Wrapper>
        <NvLoadingPlanPage />
      </Wrapper>,
    );
    fireEvent.click(await screen.findByTestId('drag-pi-1'));
    expect(
      await screen.findByText(/Sandbox: 1 Änderung/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Übernehmen/ }));
    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledTimes(1);
    });
    // Sandbox unveraendert (1 Aenderung weiterhin sichtbar).
    expect(screen.getByText(/Sandbox: 1 Änderung/)).toBeInTheDocument();
  });

  it('Verwerfen: Sandbox leert, KEIN BE-Write', async () => {
    apiGet.mockResolvedValue({ data: TOUR_FIXTURE });
    render(
      <Wrapper>
        <NvLoadingPlanPage />
      </Wrapper>,
    );
    fireEvent.click(await screen.findByTestId('drag-pi-1'));
    expect(
      await screen.findByText(/Sandbox: 1 Änderung/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Verwerfen/ }));
    await waitFor(() => {
      expect(screen.queryByText(/Sandbox: /)).toBeNull();
    });
    expect(apiPatch).not.toHaveBeenCalled();
    expect(apiDelete).not.toHaveBeenCalled();
  });
});

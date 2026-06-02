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
// Render-Position pro Paket via data-attrs (fuer Fix-C: Quantity-
// Klonen-Propagation-Assertions). Fix-C-Test prueft dass q===0-Drag
// ALLE Klone (q===1, q===2, ...) mit-bewegt via re-pack.
vi.mock('../components/LoadingPlan3D', () => ({
  default: ({
    packages,
    onPositionChange,
    onPackageContextMenu,
  }: {
    packages: Array<{
      id: string;
      posX: number;
      posY: number;
      posZ: number;
    }>;
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
        <div
          key={p.id}
          data-testid={`pkg-${p.id}`}
          data-pos-x={p.posX}
          data-pos-y={p.posY}
          data-pos-z={p.posZ}
        >
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
  NV_DRAG_SHIPMENT_MIME: 'application/x-nv-shipment-id',
}));

// confirm-Dialog auto-accept (Eject braucht es).
beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const apiGet = vi.fn();
const apiPatch = vi.fn().mockResolvedValue({ data: {} });
const apiPost = vi.fn().mockResolvedValue({ data: {} });
const apiDelete = vi.fn().mockResolvedValue({ data: {} });
// Schritt 3: per-Test ueberschreibbarer nearby-Pool (default leer).
let nearbyMock: unknown = [];
vi.mock('../lib/api', () => ({
  api: {
    // Schritt 3: nearby-shipments getrennt mocken — der nearbyQ
    // (Page-seitiger Lookup fuer Drag-IN) wuerde sonst TOUR_FIXTURE
    // bekommen und .map crashen.
    get: (url: string) => {
      if (url.includes('/nearby-shipments')) {
        return Promise.resolve({ data: nearbyMock });
      }
      return apiGet(url);
    },
    patch: (url: string, body: unknown) => apiPatch(url, body),
    post: (url: string, body: unknown) => apiPost(url, body),
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
  apiPost.mockReset().mockResolvedValue({ data: {} });
  apiDelete.mockReset().mockResolvedValue({ data: {} });
  nearbyMock = [];
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

    // PATCH-Inhalt: korrekte URL + body. H5b: body enthaelt paletteIndex
    // (parsed aus Sandbox-Key `${dbItemId}|${paletteIndex}`).
    expect(apiPatch.mock.calls[0]).toEqual([
      '/loading/package-item/pi-1/position',
      { paletteIndex: 0, posXCm: 100, posYCm: 200, posZCm: 0 },
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

  it('Fix-C: Drag q===0 verschiebt clones q>0 in der Visualisierung mit (re-pack)', async () => {
    // Tour mit 1 Sendung, qty=3 → 3 Klone:
    //   q===0 mit dbItemId='pi-3x', initial-storedPos (50,0,0) via BE.
    //   q===1, q===2 ohne dbItemId, ohne storedPos → Phase-2 auto-pack.
    // Erwartung pre-Fix-C: drag q===0 → nur q===0 wandert; q>0 bleiben.
    // Erwartung Fix-C:    drag q===0 → patchedTour mit neuer pos_x_cm
    //   auf q===0 → flattenPackages re-runs → Phase-2 platziert q>0
    //   um die NEUE q===0-Pos herum (clustered).
    const TOUR_QTY3 = {
      ...TOUR_FIXTURE,
      stops: [
        {
          id: 'stop-q',
          position: 1,
          is_stamm_kunde: false,
          shipment: {
            id: 'sh-q',
            shipment_number: 'Q-1',
            ldm: 6,
            weight_kg: 1500,
            length_cm: 120,
            width_cm: 80,
            height_cm: 100,
            customer_id: 'c-q',
            loading_date: '2099-12-31',
            status: 'new',
            has_active_lock: false,
            is_hazmat: false,
            customers: { priority_tier: null },
            shipment_package_items: [
              {
                id: 'pi-3x',
                line_index: 0,
                quantity: 3,
                length_cm: 120,
                width_cm: 80,
                height_cm: 100,
                weight_kg: 500,
                stackable: true,
                // Initial-BE-Pos: bei posY=50, klein.
                pos_x_cm: 0,
                pos_y_cm: 50,
                pos_z_cm: 0,
              },
            ],
          },
        },
      ],
    };
    apiGet.mockResolvedValue({ data: TOUR_QTY3 });
    render(
      <Wrapper>
        <NvLoadingPlanPage />
      </Wrapper>,
    );
    // 3 Klone gerendert (id-Pattern via nvExpand L136:
    //   qty>1 → `${it.id}:pkg:${q}` für ALLE q inkl 0).
    const c0 = await screen.findByTestId('pkg-pi-3x:pkg:0');
    const c1 = await screen.findByTestId('pkg-pi-3x:pkg:1');
    const c2 = await screen.findByTestId('pkg-pi-3x:pkg:2');
    // Initial-Layout: q===0 bei posY≈50; q>0 von Phase-2 um q===0
    // herum auto-platziert. q>0 sollten in der Nähe von q===0 sein
    // (Cluster).
    const initialY0 = Number(c0.getAttribute('data-pos-y'));
    const initialY1 = Number(c1.getAttribute('data-pos-y'));
    const initialY2 = Number(c2.getAttribute('data-pos-y'));
    expect(initialY0).toBe(50);
    // q>0 koennen bei 0 oder Nachbar-Slots liegen — wichtig: sie
    // sind NICHT mehrere hundert cm entfernt (Phase-2 packt in Reihen).
    expect(Math.abs(initialY1 - initialY0)).toBeLessThan(400);
    expect(Math.abs(initialY2 - initialY0)).toBeLessThan(400);

    // Drag q===0 → handlePosition(pi-3x:pkg:0, 100, 200, 0).
    // handlePosition macht pkg-Lookup via id und nutzt dbItemId (it.id
    // = 'pi-3x') als Sandbox-Key → patchedTour ersetzt pos auf der
    // line_index-Row → flattenPackages re-packt alle 3 Klone.
    fireEvent.click(screen.getByTestId('drag-pi-3x:pkg:0'));

    // Re-Pack-Check
    //   1. q===0 ist auf der neuen Drag-Position (Phase-1 honor).
    //   2. KEIN clone steht mehr bei posY=50 (das wäre die alte BE-
    //      Pos für q===0; pre-Fix-C wären alle Phase-2-Auto-Slots
    //      relativ zu Y=50 berechnet → mind. ein clone in [40,70]).
    //   3. Alle 3 Klone weiterhin gerendert (keine Eject-Regression).
    //   4. q>0 ueberlappen NICHT mit q===0 (Phase-2 obstacle-aware).
    await waitFor(() => {
      const c0el = screen.getByTestId('pkg-pi-3x:pkg:0');
      const c1el = screen.getByTestId('pkg-pi-3x:pkg:1');
      const c2el = screen.getByTestId('pkg-pi-3x:pkg:2');
      const newY0 = Number(c0el.getAttribute('data-pos-y'));
      const newY1 = Number(c1el.getAttribute('data-pos-y'));
      const newY2 = Number(c2el.getAttribute('data-pos-y'));
      // (1) q===0 auf neuer Drag-Pos.
      expect(newY0).toBe(200);
      // (3) 3 Klone (durch findByTestId oben implizit garantiert).
      // (2) Kein Clone bei der alten BE-Pos Y=50 (würde bei pre-Fix-C
      //     so passieren weil clones nie re-platziert wurden und
      //     Phase-2 sie initial NEBEN q===0_alt=50 setzte).
      expect(Math.abs(newY1 - 50)).toBeGreaterThan(10);
      expect(Math.abs(newY2 - 50)).toBeGreaterThan(10);
      // (4) Overlap-Check: q===0 spannt Y=200..320 (length 120cm).
      //     Wenn ein Clone ebenfalls in diesem Y-Bereich liegt, muss
      //     sein posX oder posZ ausserhalb der q===0-X/Z-Box sein.
      const overlapsY = (y: number) => y >= 80 && y <= 320;
      [{ y: newY1, el: c1el }, { y: newY2, el: c2el }].forEach(
        ({ y, el }) => {
          if (overlapsY(y)) {
            const x = Number(el.getAttribute('data-pos-x'));
            const z = Number(el.getAttribute('data-pos-z'));
            // q===0 bei X=100, Z=0 → kein Overlap wenn x ≥ 180 oder
            // z ≥ 100. (Pakete 80 breit × 100 hoch.)
            // Akzeptable Toleranzbereiche.
            expect(x >= 100 + 80 || z >= 100).toBe(true);
          }
        },
      );
    });
    // initialY1/initialY2 sind in dem Scope deklariert aber nicht
    // strikt-vergleichend hier — sie zeigen nur, dass die initial-
    // Pos im selben Lauf gesetzt waren; das Erfolgskriterium ist die
    // re-pack-Konsistenz (Assertions 1-4 oben).
    void initialY1;
    void initialY2;
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

/* ─── Schritt 3: Drag IN (Hof → Auflieger) ──────────────────── */

describe('NvLoadingPlanPage Drag-IN (Schritt 3)', () => {
  it('Drop auf 3D-Wrapper → Sandbox-Insert + Übernehmen POSTet /nv-touren/:id/stops', async () => {
    apiGet.mockResolvedValue({ data: TOUR_FIXTURE });
    // nearby-Pool enthaelt die zu inserting Sendung mit package_items.
    nearbyMock = [
      {
        id: 'sh-new',
        shipment_number: 'NEW-1',
        weight_kg: 200,
        ldm: 1.2,
        length_cm: 120,
        width_cm: 80,
        height_cm: 110,
        package_items: [
          {
            id: 'pi-new',
            length_cm: 120,
            width_cm: 80,
            height_cm: 110,
            weight_kg: 200,
            quantity: 1,
            stackable: true,
          },
        ],
      },
    ];
    render(
      <Wrapper>
        <NvLoadingPlanPage />
      </Wrapper>,
    );
    // Übernehmen anfangs disabled (Sandbox leer).
    const uebernehmen = await screen.findByRole('button', {
      name: /Übernehmen/,
    });
    expect(uebernehmen).toBeDisabled();
    // Drop simulieren: dataTransfer mit shipmentId via fake DataTransfer-Stub.
    const dropzone = await screen.findByTestId('nv-3d-dropzone');
    const dataTransfer = {
      types: ['application/x-nv-shipment-id'],
      getData: (mime: string) =>
        mime === 'application/x-nv-shipment-id' ? 'sh-new' : '',
      setData: () => {},
      effectAllowed: 'copy' as const,
      dropEffect: 'copy' as const,
    };
    fireEvent.dragOver(dropzone, { dataTransfer });
    fireEvent.drop(dropzone, { dataTransfer });
    // Sandbox-Badge zeigt 1 Aenderung.
    await waitFor(() => {
      expect(screen.getByText(/Sandbox: 1 Änderung/)).toBeInTheDocument();
    });
    // Übernehmen jetzt enabled.
    expect(
      screen.getByRole('button', { name: /Übernehmen/ }),
    ).not.toBeDisabled();
    // Übernehmen klicken → apiPost wurde mit shipment_id aufgerufen.
    fireEvent.click(screen.getByRole('button', { name: /Übernehmen/ }));
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/nv-touren/tour-1/stops', {
        shipment_id: 'sh-new',
      });
    });
    // Sandbox geleert nach Erfolg.
    await waitFor(() => {
      expect(screen.queryByText(/Sandbox: /)).toBeNull();
    });
  });

  it('Übernehmen-Reihenfolge: Position → Insert → Eject', async () => {
    apiGet.mockResolvedValue({ data: TOUR_FIXTURE });
    nearbyMock = [
      {
        id: 'sh-new',
        shipment_number: 'NEW-1',
        weight_kg: 100,
        ldm: 1,
        length_cm: 100,
        width_cm: 80,
        height_cm: 100,
        package_items: [
          {
            id: 'pi-new',
            length_cm: 100,
            width_cm: 80,
            height_cm: 100,
            weight_kg: 100,
            quantity: 1,
            stackable: true,
          },
        ],
      },
    ];
    // Call-Tracking ueber alle API-Mocks fuer Reihenfolge-Pruefung.
    const callOrder: string[] = [];
    apiPatch.mockImplementation(async () => {
      callOrder.push('PATCH');
      return { data: {} };
    });
    apiPost.mockImplementation(async () => {
      callOrder.push('POST');
      return { data: {} };
    });
    apiDelete.mockImplementation(async () => {
      callOrder.push('DELETE');
      return { data: {} };
    });
    render(
      <Wrapper>
        <NvLoadingPlanPage />
      </Wrapper>,
    );
    // 1) Position-Drag (PATCH)
    const drag1 = await screen.findByTestId('drag-pi-1');
    fireEvent.click(drag1);
    // 2) Eject sh-2 via Context-Menu
    fireEvent.click(screen.getByTestId('ctxmenu-pi-2'));
    fireEvent.click(
      await screen.findByText(/Sendung aus Tour entfernen \(Sandbox\)/),
    );
    // 3) Drop Insert sh-new
    const dropzone = screen.getByTestId('nv-3d-dropzone');
    const dataTransfer = {
      types: ['application/x-nv-shipment-id'],
      getData: (mime: string) =>
        mime === 'application/x-nv-shipment-id' ? 'sh-new' : '',
      setData: () => {},
      effectAllowed: 'copy' as const,
      dropEffect: 'copy' as const,
    };
    fireEvent.dragOver(dropzone, { dataTransfer });
    fireEvent.drop(dropzone, { dataTransfer });
    // Übernehmen
    fireEvent.click(screen.getByRole('button', { name: /Übernehmen/ }));
    await waitFor(() => {
      expect(callOrder).toContain('POST');
      expect(callOrder).toContain('DELETE');
    });
    // Reihenfolge: PATCH (Position) zuerst, dann POST (Insert), dann DELETE.
    expect(callOrder.indexOf('PATCH')).toBeLessThan(callOrder.indexOf('POST'));
    expect(callOrder.indexOf('POST')).toBeLessThan(
      callOrder.indexOf('DELETE'),
    );
  });
});

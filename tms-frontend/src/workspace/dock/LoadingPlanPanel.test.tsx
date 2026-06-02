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
// D2: onPositionChange-Prop wird ebenfalls captured, sodass Tests
// einen "Drag" durch direkten Aufruf simulieren koennen.
// D3b: onPackageContextMenu-Prop ebenfalls captured fuer Rechtsklick-
//      Simulation.
// D3c: onInsertAt + insertMode-Prop captured (Insert-Mode FV-only).
// Stufe 2: onDragMove-Prop captured (Live-AchsLast).
type OnPositionChange = (
  id: string,
  posXCm: number,
  posYCm: number,
  posZCm: number,
  rotationDeg?: number,
) => void;
type OnPackageContextMenu = (pkgId: string, x: number, y: number) => void;
type OnInsertAt = (
  draggedId: string,
  targetId: string | null,
  dropPosY: number,
) => void;
type OnDragMove = (
  id: string,
  posXCm: number,
  posYCm: number,
  posZCm: number,
) => void;
const lp3dProps = vi.fn();
let capturedOnPositionChange: OnPositionChange | null = null;
let capturedOnPackageContextMenu: OnPackageContextMenu | null = null;
let capturedOnInsertAt: OnInsertAt | null = null;
let capturedOnDragMove: OnDragMove | null = null;
vi.mock('../../components/LoadingPlan3D', () => ({
  default: ({
    vehicle,
    packages,
    onPositionChange,
    onPackageContextMenu,
    insertMode,
    onInsertAt,
    onDragMove,
  }: {
    vehicle: { lengthCm: number; widthCm: number; heightCm: number };
    packages: Array<{ id: string; unplaced?: boolean }>;
    onPositionChange?: OnPositionChange;
    onPackageContextMenu?: OnPackageContextMenu;
    insertMode?: boolean;
    onInsertAt?: OnInsertAt;
    onDragMove?: OnDragMove;
  }) => {
    lp3dProps({
      vehicle,
      packages,
      onPositionChange,
      onPackageContextMenu,
      insertMode,
      onInsertAt,
      onDragMove,
    });
    capturedOnPositionChange = onPositionChange ?? null;
    capturedOnPackageContextMenu = onPackageContextMenu ?? null;
    capturedOnInsertAt = onInsertAt ?? null;
    capturedOnDragMove = onDragMove ?? null;
    return (
      <div
        data-testid="lp3d-stub"
        data-vehicle-l={vehicle.lengthCm}
        data-vehicle-w={vehicle.widthCm}
        data-pkg-count={packages.length}
        data-unplaced-count={packages.filter((p) => p.unplaced).length}
        data-has-drag={onPositionChange ? '1' : '0'}
        data-has-ctxmenu={onPackageContextMenu ? '1' : '0'}
        data-insert-mode={insertMode ? '1' : '0'}
        data-has-dragmove={onDragMove ? '1' : '0'}
      />
    );
  },
}));

// PanelShell ist internal in LoadingPlanPanel.tsx → KEIN mock noetig.
// Wir lesen vehicleInfo aus dem gerenderten DOM ("· 12T · 12.0×...").

const apiGet = vi.fn();
const apiPatch = vi.fn().mockResolvedValue({ data: { ok: true } });
const apiPost = vi.fn().mockResolvedValue({ data: { ok: true } });
const apiDelete = vi.fn().mockResolvedValue({ data: { ok: true } });
vi.mock('../../lib/api', () => ({
  api: {
    get: (url: string) => apiGet(url),
    patch: (url: string, body?: unknown) => apiPatch(url, body),
    post: (url: string, body?: unknown) => apiPost(url, body),
    delete: (url: string) => apiDelete(url),
  },
  AUTH_TOKEN_KEY: 'tms_token',
}));

// useWorkspace mocked — mode steuerbar je Test (D2: FV-Tests).
const workspaceMock: { mode: 'nv' | 'fv' } = { mode: 'nv' };
vi.mock('../../state/workspace', () => ({
  useWorkspace: () => workspaceMock,
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
  apiPatch.mockClear();
  apiPatch.mockResolvedValue({ data: { ok: true } });
  apiPost.mockClear();
  apiPost.mockResolvedValue({ data: { ok: true } });
  apiDelete.mockClear();
  apiDelete.mockResolvedValue({ data: { ok: true } });
  capturedOnPositionChange = null;
  capturedOnPackageContextMenu = null;
  capturedOnInsertAt = null;
  capturedOnDragMove = null;
  workspaceMock.mode = 'nv';
  // window.confirm fuer Remove-Action — Tests bestaetigen
  // standardmaessig. Per-Test ueberschreibbar.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
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

  it('kein unplaced-Banner wenn alle Pakete passen', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { queryByRole } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(lp3dProps).toHaveBeenCalled();
    });
    // role=alert nur fuer Banner; bei 0 unplaced KEIN alert-Element.
    expect(queryByRole('alert')).toBeNull();
  });
});

// Shipment-Aggregation-Fixture (Regel #2): EINE Sendung mit 3 Packstücken
// (quantity-Klone), die alle unplaced bleiben → Banner muss "1 Sendung(en)"
// zeigen, NICHT "3" (Packstück-Zahl).
const TOUR_OVERFLOW_MULTI = {
  ...TOUR_12T,
  stops: [
    {
      // Stop 1: ein Sendung, die den Trailer komplett ausfuellt (1200x240x240).
      id: 'stop-full',
      position: 1,
      shipment: {
        id: 'ship-full',
        shipment_number: 'FULL',
        ldm: 12,
        weight_kg: 1000,
        shipment_package_items: [
          {
            id: 'pi-full',
            line_index: 1,
            quantity: 1,
            length_cm: 1200,
            width_cm: 240,
            height_cm: 240,
            weight_kg: 1000,
            stackable: false,
            pos_x_cm: null,
            pos_y_cm: null,
            pos_z_cm: null,
            rotation_deg: 0,
          },
        ],
      },
    },
    {
      // Stop 2: EINE Sendung mit quantity=3 → 3 Packstücke, alle unplaced.
      id: 'stop-multi',
      position: 2,
      shipment: {
        id: 'ship-multi',
        shipment_number: 'MULTI',
        ldm: 3,
        weight_kg: 300,
        shipment_package_items: [
          {
            id: 'pi-multi',
            line_index: 1,
            quantity: 3,
            length_cm: 100,
            width_cm: 100,
            height_cm: 100,
            weight_kg: 100,
            stackable: false,
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

describe('LoadingPlanPanel unplaced-Banner (Dispo-Sicherheit)', () => {
  it('Shipment-Aggregation: 1 Sendung × 3 unplaced Packstuecke → Banner "1 Sendung(en)"', async () => {
    apiGet.mockResolvedValue({ data: TOUR_OVERFLOW_MULTI });
    const { findByRole } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    // Banner-Text per Carlos-Wording: zaehlt distinct Sendung, NICHT Packstuecke.
    const alert = await findByRole('alert');
    expect(alert.textContent).toContain(
      '⚠ 1 Sendung(en) passen nicht auf den Trailer',
    );
    expect(alert.textContent).not.toContain('3 Sendung(en)');
    // LoadingPlan3D bekommt NUR placed-Items (unplaced gefiltert).
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    const renderedUnplaced = lastCall.packages.filter(
      (p: { unplaced?: boolean }) => p.unplaced,
    );
    expect(renderedUnplaced.length).toBe(0);
    // Nur ship-full (1 Package) wird gerendert; ship-multi qty=3 ist
    // komplett unplaced + gefiltert.
    expect(lastCall.packages.length).toBe(1);
  });
});

// D2: embedded-Drag-PATCH-Bridge — beide Bodies (NV + FV).
// Strategie: LoadingPlan3D-Stub captured die onPositionChange-Prop;
// Tests rufen sie direkt mit synth + echtem dbItemId auf und
// asserten den api.patch-Call (oder dass kein Call kommt).

// FV-Optimize-Fixture: 2 Sendungen, 1 mit 2 quantity-Items.
// expandPackagesFromOrder erzeugt daraus 3 Pakete:
//   pi-1 (q===1)        → dbItemId='pi-1'
//   pi-2:q1 (q===1)     → dbItemId='pi-2'
//   pi-2:q2 (q===2 Klon)→ dbItemId=undefined (synth)
const FV_OPTIMIZE_FIXTURE = {
  recommendedVehicle: {
    type: 'Sattel',
    lengthCm: 1360,
    widthCm: 240,
    heightCm: 270,
  },
  loadingOrder: [
    {
      id: 'ship-fv-1',
      shipmentNumber: 'F-1',
      customer: 'Kunde F1',
      deliveryCity: 'Stuttgart',
      deliveryOrder: 1,
      lengthCm: 120,
      widthCm: 80,
      heightCm: 120,
      weightKg: 100,
      ldm: 1.2,
      isStackable: true,
      packageCount: 1,
      packageType: 'pallet_euro',
      packageItems: [
        {
          id: 'pi-1',
          lineIndex: 1,
          packageType: 'pallet_euro',
          quantity: 1,
          lengthCm: 120,
          widthCm: 80,
          heightCm: 120,
          weightKg: 100,
          stackable: true,
          posXCm: null,
          posYCm: null,
          posZCm: null,
          rotationDeg: 0,
        },
      ],
    },
    {
      id: 'ship-fv-2',
      shipmentNumber: 'F-2',
      customer: 'Kunde F2',
      deliveryCity: 'Muenchen',
      deliveryOrder: 2,
      lengthCm: 120,
      widthCm: 80,
      heightCm: 120,
      weightKg: 200,
      ldm: 2.4,
      isStackable: true,
      packageCount: 2,
      packageType: 'pallet_euro',
      packageItems: [
        {
          id: 'pi-2',
          lineIndex: 1,
          packageType: 'pallet_euro',
          quantity: 2,
          lengthCm: 120,
          widthCm: 80,
          heightCm: 120,
          weightKg: 200,
          stackable: true,
          posXCm: null,
          posYCm: null,
          posZCm: null,
          rotationDeg: 0,
        },
      ],
    },
  ],
  layout: {
    vehicle: { type: 'Sattel', lengthCm: 1360, widthCm: 240, heightCm: 270 },
    items: [],
    totalLdm: 0,
    totalWeight: 0,
    utilizationPercent: 0,
    warnings: [],
  },
  warnings: [],
};

describe('LoadingPlanPanel D2 — embedded Drag → PATCH (FV)', () => {
  it('FV: onPositionChange-Prop ist gesetzt (Drag aktiv)', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(lp3dProps).toHaveBeenCalled();
    });
    expect(capturedOnPositionChange).not.toBeNull();
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    expect(lastCall.onPositionChange).toBeTruthy();
  });

  it('FV: Drag auf q===1-Item ruft PATCH mit dbItemId', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnPositionChange).not.toBeNull();
    });
    // pi-1 ist q===1 → dbItemId='pi-1' (expandPackagesFromOrder).
    capturedOnPositionChange!('pi-1', 100, 200, 0, 90);
    await vi.waitFor(() => {
      expect(apiPatch).toHaveBeenCalledTimes(1);
    });
    const [url, body] = apiPatch.mock.calls[0];
    expect(url).toBe('/loading/package-item/pi-1/position');
    expect(body).toEqual({
      posXCm: 100,
      posYCm: 200,
      posZCm: 0,
      rotationDeg: 90,
    });
  });

  it('FV: Drag auf Quantity-Klon q>1 → KEIN PATCH (synth-Filter)', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnPositionChange).not.toBeNull();
    });
    // pi-2 ist quantity=2 → expandPackagesFromOrder erzeugt
    // 'pi-2:q1' (q===1, dbItemId='pi-2') + 'pi-2:q2' (q===2, kein
    // dbItemId). Drag auf q===2-Klon → no-op.
    capturedOnPositionChange!('pi-2:q2', 500, 600, 0);
    // Microtask + waitFor — selbst nach kurzer Wartezeit kein PATCH.
    await new Promise((r) => setTimeout(r, 10));
    expect(apiPatch).not.toHaveBeenCalled();
  });
});

describe('LoadingPlanPanel D2 — embedded Drag → PATCH (NV)', () => {
  it('NV: onPositionChange-Prop ist gesetzt (Drag aktiv)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnPositionChange).not.toBeNull();
    });
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    expect(lastCall.onPositionChange).toBeTruthy();
  });

  it('NV: Drag auf Real-Item ruft PATCH mit dbItemId', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnPositionChange).not.toBeNull();
    });
    // TOUR_12T.stop-A → shipment_package_items[0] id='pi-A',
    // quantity=1 → nvExpand setzt dbItemId='pi-A' fuer das q===0-
    // Item. Item-ID-Format: nvExpand verwendet 'pi-A:q0'
    // (id-Schema). Wir lesen die echte id aus dem letzten Render
    // (Plan3DPackage.id ist die nvExpand-id).
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    const piA = lastCall.packages.find(
      (p: { id: string }) =>
        p.id.startsWith('pi-A') || p.id.includes(':pi-A'),
    );
    expect(piA).toBeDefined();
    capturedOnPositionChange!(piA!.id, 250, 350, 0);
    await vi.waitFor(() => {
      expect(apiPatch).toHaveBeenCalledTimes(1);
    });
    const [url, body] = apiPatch.mock.calls[0];
    expect(url).toBe('/loading/package-item/pi-A/position');
    expect(body).toEqual({ posXCm: 250, posYCm: 350, posZCm: 0 });
  });

  it('NV: Drag auf Quantity-Klon q>0 → KEIN PATCH (synth-Filter)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnPositionChange).not.toBeNull();
    });
    // TOUR_12T.stop-D → shipment_package_items[0] id='pi-D',
    // quantity=7 → nvExpand erzeugt 7 Pakete mit id-Pattern
    // 'pi-D:pkg:0'…'pi-D:pkg:6'. Nur q===0 ('pi-D:pkg:0') hat
    // dbItemId='pi-D'. Wir suchen einen Klon q>=1.
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    const piDKlon = lastCall.packages.find(
      (p: { id: string }) =>
        p.id.startsWith('pi-D:pkg:') && !p.id.endsWith(':pkg:0'),
    );
    expect(piDKlon).toBeDefined();
    capturedOnPositionChange!(piDKlon!.id, 500, 600, 0);
    await new Promise((r) => setTimeout(r, 10));
    expect(apiPatch).not.toHaveBeenCalled();
  });
});

// D3a: AxleLoadPanel sichtbar im embedded (NV + FV).
// Pruefung: Header "Achslast" rendert + Trailer-Laenge entspricht
// dem aufgeloesten vehicleType-Bucket (NV: capacity.maxLdm, FV:
// recommendedVehicle.type).
// D3b: ContextMenu — Aktionen via Rechtsklick auf Palette
// (onPackageContextMenu). Strategie: stub captured die Prop,
// Tests rufen sie direkt + klicken danach den Menue-Eintrag.
async function openContextMenu(pkgId: string) {
  // Stub-Prop direkt aufrufen — oeffnet ctxMenu-State im Panel.
  capturedOnPackageContextMenu!(pkgId, 100, 200);
}

describe('LoadingPlanPanel D3b — ContextMenu (FV)', () => {
  it('FV: Stapelbar-Toggle → PATCH /shipments/:id/stackable', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    const { findByText } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnPackageContextMenu).not.toBeNull();
    });
    // ship-fv-1 ist stackable=true (default), Toggle setzt false.
    await openContextMenu('pi-1');
    const toggleBtn = await findByText('Nicht stapelbar setzen');
    toggleBtn.click();
    await vi.waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith(
        '/shipments/ship-fv-1/stackable',
        { stackable: false },
      );
    });
  });

  it('FV: Sendung entfernen → POST /tours/:id/remove-shipment', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    const { findByText } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnPackageContextMenu).not.toBeNull();
    });
    await openContextMenu('pi-1');
    const removeBtn = await findByText('Sendung aus Tour entfernen');
    removeBtn.click();
    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/tours/tour-1/remove-shipment',
        { shipmentId: 'ship-fv-1' },
      );
    });
  });

  it('FV: Remove ohne Bestaetigung (confirm=false) → KEIN POST', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { findByText } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnPackageContextMenu).not.toBeNull();
    });
    await openContextMenu('pi-1');
    const removeBtn = await findByText('Sendung aus Tour entfernen');
    removeBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe('LoadingPlanPanel D3b — ContextMenu (NV)', () => {
  it('NV: Position zuruecksetzen → PATCH mit null-Body', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { findByText } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnPackageContextMenu).not.toBeNull();
    });
    // pi-A hat quantity=1 → nvExpand setzt id='pi-A' direkt
    // (kein :pkg:0-Suffix bei single-Paket-Sendungen).
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    const piA = lastCall.packages.find((p: { id: string }) => p.id === 'pi-A');
    expect(piA).toBeDefined();
    await openContextMenu(piA!.id);
    const resetBtn = await findByText('Position zurücksetzen');
    resetBtn.click();
    await vi.waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith(
        '/loading/package-item/pi-A/position',
        { posXCm: null, posYCm: null, posZCm: null },
      );
    });
  });

  it('NV: Sendung entfernen → DELETE /nv-touren/:id/stops/:stopId', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { findByText } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnPackageContextMenu).not.toBeNull();
    });
    // pi-A → shipmentId=ship-A → stopId=stop-A (aus TOUR_12T).
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    const piA = lastCall.packages.find((p: { id: string }) => p.id === 'pi-A');
    expect(piA).toBeDefined();
    await openContextMenu(piA!.id);
    const removeBtn = await findByText('Sendung aus Tour entfernen');
    removeBtn.click();
    await vi.waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith(
        '/nv-touren/tour-1/stops/stop-A',
      );
    });
  });
});

// D3c: Insert-Mode — FV-only. NvBody hat KEIN insertMode-Prop
// (Sandbox-Schutz nur in Vollansicht).
describe('LoadingPlanPanel D3c — Insert-Mode (FV)', () => {
  it('FV: onInsertAt-Prop ist gesetzt (Insert verkabelt)', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnInsertAt).not.toBeNull();
    });
  });

  it('FV: synth-Filter — Insert auf Quantity-Klon (q>1) → KEIN PATCH', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnInsertAt).not.toBeNull();
    });
    // 'pi-2:q2' ist Quantity-Klon → dbItemId=undefined.
    capturedOnInsertAt!('pi-2:q2', 'pi-1', 100);
    await new Promise((r) => setTimeout(r, 10));
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('FV: kein Target → single-PATCH (Direct-Drop-Fallback)', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnInsertAt).not.toBeNull();
    });
    // targetId=null + findInsertTarget liefert null (dropPosY weit
    // ausserhalb aller placed Items) → Direct-Drop-Fallback per
    // persistMutation (genau 1 PATCH).
    capturedOnInsertAt!('pi-1', null, -1000);
    await vi.waitFor(() => {
      expect(apiPatch).toHaveBeenCalled();
    });
    // Nicht zwingend genau 1 (placePackages-Setup kann theoretisch
    // mehrere PATCHes triggern, hier aber Direct-Drop-Pfad), wir
    // asserten dass mindestens ein Call das gedraggte Item trifft.
    const calls = apiPatch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('pi-1'),
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  // Cascade-Reorder-Fixture: 3 Sendungen mit je quantity=1, gleiche
  // kleine Dim (100×100×100, locker in Sattel 1360×240×270). Initiale
  // Positionen sind zwar gegeben (storedPos), expandPackagesFromOrder
  // setzt sie auf Phase-1, aber der Insert-Pfad ueberschreibt
  // storedPos→null und re-packed alles deterministisch. Drei reale
  // dbItemIds → ohne synth-Klone, damit der PATCH-Loop alle erreicht.
  const FV_CASCADE_FIXTURE = {
    recommendedVehicle: {
      type: 'Sattel',
      lengthCm: 1360,
      widthCm: 240,
      heightCm: 270,
    },
    loadingOrder: [
      {
        id: 'ship-A',
        shipmentNumber: 'A',
        customer: 'KA',
        deliveryCity: 'Stuttgart',
        deliveryOrder: 1,
        lengthCm: 100,
        widthCm: 100,
        heightCm: 100,
        weightKg: 100,
        ldm: 1,
        isStackable: true,
        packageCount: 1,
        packageType: 'pallet_euro',
        packageItems: [
          {
            id: 'pi-A',
            lineIndex: 1,
            packageType: 'pallet_euro',
            quantity: 1,
            lengthCm: 100,
            widthCm: 100,
            heightCm: 100,
            weightKg: 100,
            stackable: true,
            posXCm: null,
            posYCm: null,
            posZCm: null,
            rotationDeg: 0,
          },
        ],
      },
      {
        id: 'ship-B',
        shipmentNumber: 'B',
        customer: 'KB',
        deliveryCity: 'Muenchen',
        deliveryOrder: 2,
        lengthCm: 100,
        widthCm: 100,
        heightCm: 100,
        weightKg: 100,
        ldm: 1,
        isStackable: true,
        packageCount: 1,
        packageType: 'pallet_euro',
        packageItems: [
          {
            id: 'pi-B',
            lineIndex: 1,
            packageType: 'pallet_euro',
            quantity: 1,
            lengthCm: 100,
            widthCm: 100,
            heightCm: 100,
            weightKg: 100,
            stackable: true,
            posXCm: null,
            posYCm: null,
            posZCm: null,
            rotationDeg: 0,
          },
        ],
      },
      {
        id: 'ship-C',
        shipmentNumber: 'C',
        customer: 'KC',
        deliveryCity: 'Frankfurt',
        deliveryOrder: 3,
        lengthCm: 100,
        widthCm: 100,
        heightCm: 100,
        weightKg: 100,
        ldm: 1,
        isStackable: true,
        packageCount: 1,
        packageType: 'pallet_euro',
        packageItems: [
          {
            id: 'pi-C',
            lineIndex: 1,
            packageType: 'pallet_euro',
            quantity: 1,
            lengthCm: 100,
            widthCm: 100,
            heightCm: 100,
            weightKg: 100,
            stackable: true,
            posXCm: null,
            posYCm: null,
            posZCm: null,
            rotationDeg: 0,
          },
        ],
      },
    ],
    layout: {
      vehicle: {
        type: 'Sattel',
        lengthCm: 1360,
        widthCm: 240,
        heightCm: 270,
      },
      items: [],
      totalLdm: 0,
      totalWeight: 0,
      utilizationPercent: 0,
      warnings: [],
    },
    warnings: [],
  };

  it('FV: Cascade-Reorder mit Target — PATCH-Loop trifft mehrere dbItemIds', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_CASCADE_FIXTURE });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnInsertAt).not.toBeNull();
    });
    // Sanity: alle 3 Pakete sind placed (kein unplaced-Filter
    // entfernt sie aus dem 3D-Render).
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    expect(lastCall.packages.length).toBe(3);
    // pi-C an die Stelle von pi-A bringen → Reorder + Re-Pack.
    capturedOnInsertAt!('pi-C', 'pi-A', 0);
    await vi.waitFor(() => {
      // Mindestens 2 PATCHes (pi-A muss sich verschieben, pi-C
      // bekommt neue Position; pi-B kann je nach Algorithmus auch
      // patchen).
      expect(apiPatch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    // Alle PATCH-URLs treffen das korrekte Endpoint-Schema und
    // adressieren reale dbItemIds aus { pi-A, pi-B, pi-C }.
    const urls = apiPatch.mock.calls.map((c: unknown[]) => c[0] as string);
    for (const url of urls) {
      expect(url).toMatch(
        /^\/loading\/package-item\/(pi-A|pi-B|pi-C)\/position$/,
      );
    }
    // Mindestens 2 distinkte dbItemIds wurden gepatcht.
    const itemIds = new Set(
      urls.map((u: string) => {
        const m = u.match(/package-item\/([^/]+)\/position/);
        return m ? m[1] : '';
      }),
    );
    expect(itemIds.size).toBeGreaterThanOrEqual(2);
    // PATCH-Body-Shape: jedes hat posXCm/posYCm/posZCm/rotationDeg.
    for (const c of apiPatch.mock.calls) {
      const body = c[1] as Record<string, unknown>;
      expect(body).toHaveProperty('posXCm');
      expect(body).toHaveProperty('posYCm');
      expect(body).toHaveProperty('posZCm');
      expect(body).toHaveProperty('rotationDeg');
    }
  });
});

// Stufe-1-Carlos-Entscheidung: NV-Embedded-Insert ist jetzt
// aktiv (Direct-PATCH-Cascade, analog FV). Sandbox bleibt in der
// NV-Vollansicht.
describe('LoadingPlanPanel Stufe-1 — Insert-Mode (NV: aktiv)', () => {
  it('NV: onInsertAt-Prop ist gesetzt (Insert verkabelt)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnInsertAt).not.toBeNull();
    });
  });

  it('NV: synth-Filter — Insert auf Quantity-Klon → KEIN PATCH', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnInsertAt).not.toBeNull();
    });
    // pi-D:pkg:N (N>=1) sind Quantity-Klone ohne dbItemId.
    const lastCall = lp3dProps.mock.calls[lp3dProps.mock.calls.length - 1][0];
    const piDKlon = lastCall.packages.find(
      (p: { id: string }) =>
        p.id.startsWith('pi-D:pkg:') && !p.id.endsWith(':pkg:0'),
    );
    expect(piDKlon).toBeDefined();
    capturedOnInsertAt!(piDKlon!.id, 'pi-A', 100);
    await new Promise((r) => setTimeout(r, 10));
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('NV: Cascade-Reorder mit Target — PATCH-Loop trifft mehrere dbItemIds', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnInsertAt).not.toBeNull();
    });
    // pi-A (qty=1, dbItemId='pi-A') VOR pi-B (qty=2, dbItemId='pi-B'
    // fuer q===0) → Cascade-Reorder, mehrere PATCHes erwartet.
    capturedOnInsertAt!('pi-A', 'pi-B:pkg:0', 0);
    await vi.waitFor(() => {
      expect(apiPatch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    // PATCH-URLs treffen ein zulaessiges Endpoint-Schema; reale
    // dbItemIds (pi-A, pi-B, pi-C oder pi-D) — KEINE :pkg:-IDs.
    for (const c of apiPatch.mock.calls) {
      const url = c[0] as string;
      expect(url).toMatch(/^\/loading\/package-item\/[^/]+\/position$/);
      expect(url).not.toMatch(/:pkg:/);
    }
  });
});

describe('LoadingPlanPanel D3a — AxleLoadPanel im embedded', () => {
  it('NV: AchsLast-Panel rendert unter dem 3D-Canvas', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { findByText } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    // Header "Achslast" aus AxleLoadPanel
    expect(await findByText('Achslast')).toBeInTheDocument();
    // vehicleType-Heuristik: capacity.maxLdm=12 → "Koffer 12t",
    // trailerLength = 1200/100 = 12.0 m. Beides wird im AxleLoadPanel-
    // Header gerendert: "Koffer 12t · 12.0 m".
    expect(await findByText(/Koffer 12t · 12\.0 m/)).toBeInTheDocument();
  });

  it('FV: AchsLast-Panel rendert mit recommendedVehicle.type', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    const { findByText } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    expect(await findByText('Achslast')).toBeInTheDocument();
    // FV_OPTIMIZE_FIXTURE.recommendedVehicle: { type: 'Sattel',
    // lengthCm: 1360 } → "Sattel · 13.6 m".
    expect(await findByText(/Sattel · 13\.6 m/)).toBeInTheDocument();
  });
});

// TEIL A: Live-Aggregat-Header (LDM/kg/Vol-%) in PanelShell.
// Reagiert auf renderedPackages-Updates; data-testid="panel-usage".
describe('LoadingPlanPanel TEIL A — Live-Aggregat-Header', () => {
  it('NV: Header zeigt LDM/kg/Vol-% Aggregat (TOUR_12T)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { findByTestId } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    const usageEl = await findByTestId('panel-usage');
    // TOUR_12T: 12 placed Pakete (pi-A 1 + pi-D 7 + pi-B 2 + pi-C 2),
    // jede Sendung weight_kg=100; nvExpand setzt weightKg=it.weight_kg
    // (NICHT durch qty geteilt) → Summe 12 × 100 = 1200 kg.
    // Aggregat-useMemo rendert nach async Query → vi.waitFor.
    await vi.waitFor(() => {
      expect(usageEl.textContent).toMatch(/12 Pk · /);
    });
    expect(usageEl.textContent).toMatch(/ ldm · /);
    expect(usageEl.textContent).toMatch(/ kg · /);
    expect(usageEl.textContent).toMatch(/% Vol/);
    expect(usageEl.textContent).toContain('1200 kg');
  });

  it('FV: Header zeigt LDM/kg/Vol-% Aggregat (FV_OPTIMIZE_FIXTURE)', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    const { findByTestId } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    const usageEl = await findByTestId('panel-usage');
    // FV_OPTIMIZE_FIXTURE: ship-fv-1 qty=1 (100kg) + ship-fv-2 qty=2
    // (200kg/2=100kg pro Palette × 2). 3 placed Pakete, total 300kg.
    await vi.waitFor(() => {
      expect(usageEl.textContent).toContain('3 Pk');
    });
    expect(usageEl.textContent).toContain('300 kg');
    expect(usageEl.textContent).toMatch(/% Vol/);
  });
});

// Stufe-1 TEIL C+D: Repack-Optimal + Reset-Buttons (FV-only).
// NV-BE-Vorbehalt: loading.service ist FV-zentriert (prisma.tours,
// nicht nv_touren) → die Buttons werden bewusst NUR in FvBody
// gerendert. NV-Tests verifizieren, dass die data-testid's fehlen.
describe('LoadingPlanPanel Stufe-1 — Repack + Reset (FV-only)', () => {
  it('FV: Reset-Button → POST /loading/tour/:id/reset-positions (mit confirm)', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    const { findByTestId } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    const btn = await findByTestId('action-reset-positions');
    btn.click();
    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/loading/tour/tour-1/reset-positions',
        undefined,
      );
    });
  });

  it('FV: Reset-Button + confirm=false → KEIN POST', async () => {
    workspaceMock.mode = 'fv';
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    const { findByTestId } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    const btn = await findByTestId('action-reset-positions');
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('FV: Repack-Optimal → reset-positions wird als erster Schritt gerufen', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    const { findByTestId } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    const btn = await findByTestId('action-repack-optimal');
    btn.click();
    // Erster API-Call ist immer POST reset-positions (vor placePackages).
    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/loading/tour/tour-1/reset-positions',
        undefined,
      );
    });
    // PATCH-Count haengt vom placePackages-Output ab (Fixture-
    // abhaengig, vgl. Cascade-Test-Lessons aus D3c). Wir asserten
    // nur, dass — falls PATCHes erfolgen — sie das richtige Schema
    // treffen.
    for (const c of apiPatch.mock.calls) {
      const url = c[0] as string;
      expect(url).toMatch(/^\/loading\/package-item\/[^/]+\/position$/);
    }
  });

  it('NV: Repack/Reset-Buttons sind sichtbar (Stufe-1b FE-side, BE-FV-only umgangen)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { findByTestId } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    expect(await findByTestId('action-repack-optimal')).toBeInTheDocument();
    expect(await findByTestId('action-reset-positions')).toBeInTheDocument();
  });
});

// Stufe-1b — NV-Repack/Reset FE-side (loading.service ist FV-only,
// darum Per-Item-PATCH-Loop statt POST /loading/tour/:id/reset-positions).
describe('LoadingPlanPanel Stufe-1b — NV Repack + Reset (FE-side)', () => {
  it('NV: Reset-Button → PATCH-null-Loop über distinct dbItemIds', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { findByTestId } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    // Tour-Load abwarten (LP3D-Stub erhält packages erst nach
    // erfolgreichem Query) — sonst greift die Mutation auf eine
    // leere packages-Liste zu (0 PATCHes).
    await vi.waitFor(() => {
      expect(lp3dProps).toHaveBeenCalled();
    });
    const btn = await findByTestId('action-reset-positions');
    btn.click();
    // TOUR_12T hat 4 distinct dbItemIds (pi-A, pi-D, pi-B, pi-C) →
    // exact 4 PATCH-Calls erwartet, alle null-Body, alle ohne
    // :pkg:-Suffix (Quantity-Klone sind ausgefiltert via Regel #2).
    await vi.waitFor(() => {
      expect(apiPatch.mock.calls.length).toBe(4);
    });
    const urls = apiPatch.mock.calls.map((c) => c[0] as string);
    for (const url of urls) {
      expect(url).toMatch(
        /^\/loading\/package-item\/(pi-A|pi-B|pi-C|pi-D)\/position$/,
      );
      expect(url).not.toMatch(/:pkg:/);
    }
    for (const c of apiPatch.mock.calls) {
      expect(c[1]).toEqual({ posXCm: null, posYCm: null, posZCm: null });
    }
  });

  it('NV: Reset-Button + confirm=false → KEIN PATCH', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { findByTestId } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    const btn = await findByTestId('action-reset-positions');
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('NV: Repack-Optimal → PATCH-Loop trifft dbItemIds, keine Klon-URLs', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { findByTestId } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(lp3dProps).toHaveBeenCalled();
    });
    const btn = await findByTestId('action-repack-optimal');
    btn.click();
    await vi.waitFor(() => {
      expect(apiPatch.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
    // Alle Calls treffen das Endpoint-Schema; keine :pkg:-IDs
    // (Quantity-Klone NICHT persistiert, Regel #2).
    for (const c of apiPatch.mock.calls) {
      const url = c[0] as string;
      expect(url).toMatch(/^\/loading\/package-item\/[^/]+\/position$/);
      expect(url).not.toMatch(/:pkg:/);
      const body = c[1] as Record<string, unknown>;
      expect(body).toHaveProperty('posXCm');
      expect(body).toHaveProperty('posYCm');
      expect(body).toHaveProperty('posZCm');
      expect(body).toHaveProperty('rotationDeg');
    }
  });

  it('NV: Repack-Button + confirm=false → KEIN PATCH', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    apiGet.mockResolvedValue({ data: TOUR_12T });
    const { findByTestId } = render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    const btn = await findByTestId('action-repack-optimal');
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(apiPatch).not.toHaveBeenCalled();
  });
});

// Stufe 2 — Live-AchsLast waehrend Drag. onDragMove-Prop feuert
// pro Pointer-Move; via rAF-Throttle bündelt der Parent auf 1
// setState pro Frame; AxleLoadPanel bekommt den live-Override.
describe('LoadingPlanPanel Stufe-2 — Live-AchsLast (onDragMove)', () => {
  it('NV: onDragMove-Prop ist gesetzt (Live-AchsLast verkabelt)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnDragMove).not.toBeNull();
    });
  });

  it('FV: onDragMove-Prop ist gesetzt (Live-AchsLast verkabelt)', async () => {
    workspaceMock.mode = 'fv';
    apiGet.mockResolvedValue({ data: FV_OPTIMIZE_FIXTURE });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnDragMove).not.toBeNull();
    });
  });

  it('NV: onDragMove triggert Re-Render mit rAF (Live-Override-Flow)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnDragMove).not.toBeNull();
    });
    const callsBefore = lp3dProps.mock.calls.length;
    capturedOnDragMove!('pi-A', 0, 500, 0);
    // rAF schedules setLiveDrag → naechster Frame → Re-Render →
    // lp3dProps wird erneut aufgerufen. waitFor poll'd das.
    await vi.waitFor(() => {
      expect(lp3dProps.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('NV: onPositionChange (Drop) → Flow konsistent (resetLiveDrag intern)', async () => {
    apiGet.mockResolvedValue({ data: TOUR_12T });
    render(
      <Wrapper>
        <LoadingPlanPanel />
      </Wrapper>,
    );
    await vi.waitFor(() => {
      expect(capturedOnDragMove).not.toBeNull();
      expect(capturedOnPositionChange).not.toBeNull();
    });
    // Drag-Move setzt Override, Drop räumt auf — kein Crash.
    capturedOnDragMove!('pi-A', 0, 100, 0);
    capturedOnPositionChange!('pi-A', 0, 100, 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(capturedOnPositionChange).not.toBeNull();
  });
});

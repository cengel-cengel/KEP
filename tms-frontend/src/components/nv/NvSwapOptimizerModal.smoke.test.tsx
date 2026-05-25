/**
 * F2.2.a Smoke-Render fuer NvSwapOptimizerModal.
 *
 * Scope: renders-without-crash mit mock-NvLoadingDetail. KEIN
 * Coverage-Detail — der Algorithmus selbst ist in nvSwapOptimizer.
 * test.ts ausfuehrlich getestet.
 *
 * Phase 1 Dispotopf-Test: User klickt "↓" pro Eject → executableCount
 * geht hoch, "Ausführen (N)" erscheint auch ohne best-match-Target.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
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
      // T1: TONNEN_CAPACITY 12T wurde auf 6000 kg / 8.7 ldm aktualisiert
      // (Carlos-Spec). Ohne explizites sub-Override wuerde die alte
      // Test-Tour (Σ ~4000 kg) nicht mehr overloaden → keine Ejects.
      // sub.max_ldm/max_gewicht_kg gewinnt vor Tonnen-Fallback und haelt
      // das alte 8 ldm / 3000 kg Szenario stabil.
      max_ldm: 8,
      max_gewicht_kg: 3000,
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
          weight_kg: 2000,
          length_cm: 480,
          width_cm: 240,
          height_cm: 100,
          customer_id: 'cust-1',
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
              length_cm: 480,
              width_cm: 240,
              height_cm: 100,
              weight_kg: 2000,
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
          weight_kg: 2000,
          length_cm: 360,
          width_cm: 240,
          height_cm: 100,
          customer_id: 'cust-2',
          loading_date: '2099-12-31',
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
              weight_kg: 2000,
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
          weight_kg: 2000,
          length_cm: 480,
          width_cm: 240,
          height_cm: 100,
          customer_id: 'cust-3',
          loading_date: '2099-12-31',
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
              weight_kg: 2000,
              stackable: true,
            },
          ],
        },
      },
    ],
  };
  // Phase 2: NV-Touren-Liste fuer Manual-Picker. 2 Alt-Touren in
  // 'PLANNING'-Status, 1 nicht-passende (status 'IN_PROGRESS' wird
  // gefiltert). Source-Tour selbst (tour-1) wird durch !== filter
  // ausgeschlossen.
  const mockNvTouren = [
    {
      id: 'tour-1',
      status: 'PLANNING',
      datum: '2026-05-24',
      nv_stamm_tour: { code: 'NV-A' },
      overload: { vol: 0.7, weight: 0.6 },
    },
    {
      id: 'tour-2',
      status: 'PLANNING',
      datum: '2026-05-25',
      nv_stamm_tour: { code: 'NV-B' },
      overload: { vol: 0.3, weight: 0.4 },
    },
    {
      id: 'tour-3',
      status: 'IN_PROGRESS',
      datum: '2026-05-25',
      nv_stamm_tour: { code: 'NV-X' },
    },
  ];
  // Phase 3: Stamm-Touren fuer Neue-Tour-Form-Dropdown.
  const mockNvStammTouren = [
    { id: 'stamm-1', code: 'NV-A', name: 'A-Runde' },
    { id: 'stamm-2', code: 'NV-B', name: 'B-Runde' },
  ];
  return {
    api: {
      // URL-aware:
      //  /best-match       → leeres Array (kein Auto-Ziel; Test toggelt manuell)
      //  /nv-touren        → Liste fuer Manual-Picker
      //  /nv-stamm-touren  → Liste fuer Neue-Tour-Form (Phase 3)
      //  default           → loading-Detail
      get: vi.fn((url: string) => {
        if (typeof url === 'string' && url.includes('/best-match')) {
          return Promise.resolve({ data: [] });
        }
        if (typeof url === 'string' && url === '/nv-touren') {
          return Promise.resolve({ data: mockNvTouren });
        }
        if (typeof url === 'string' && url === '/nv-stamm-touren') {
          return Promise.resolve({ data: mockNvStammTouren });
        }
        return Promise.resolve({ data: mockLoadingDetail });
      }),
      // F2.2.b-2: batch-stops-Calls beim Execute. Smoke triggert
      // den Pfad NICHT (kein "Ausfuehren"-Klick fuer Phase-1/2),
      // aber api.post muss im Mock-Surface existieren damit Modal-
      // Component-Import nicht crash. Phase 3 testet POST-Aufrufe
      // via spy: api.post wird mit createdTour-Stub gewrappt.
      post: vi.fn((url: string) => {
        // POST /nv-touren → Mock-Tour zurueck (Phase 3 create-tour).
        if (typeof url === 'string' && url === '/nv-touren') {
          return Promise.resolve({ data: { id: 'new-tour-1' } });
        }
        return Promise.resolve({ data: { ok: true } });
      }),
      delete: vi.fn().mockResolvedValue({ data: { ok: true } }),
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

  it('Phase 1: Dispotopf-Auswahl macht Eject ausfuehrbar ohne best-match', async () => {
    // best-match-Mock liefert [] → kein Auto-Ziel. Vor Selektor-
    // Change: KEIN "Ausführen"-Button. Nach Auswahl '__pool__'
    // (Dispotopf) im Selector: "Ausführen (≥1)" erscheint.
    const { findAllByTitle, findByRole, queryByRole } = render(
      <Wrapper>
        <NvSwapOptimizerModal sourceTourId="tour-1" onClose={() => {}} />
      </Wrapper>,
    );
    const selects = await findAllByTitle(/Ziel der Sendung waehlen/);
    expect(selects.length).toBeGreaterThan(0);
    expect(queryByRole('button', { name: /Ausführen \(\d+\)/ })).toBeNull();

    fireEvent.change(selects[0], { target: { value: '__pool__' } });

    const execBtn = await findByRole('button', {
      name: /Ausführen \(\d+\)/,
    });
    expect(execBtn).toBeTruthy();
  });

  it('Phase 2: Manual-Tour-Auswahl macht Eject ausfuehrbar mit gewaehlter tourId', async () => {
    // Manual-Pick = tour-2 (NV-B). Verifiziert dass executableCount
    // hochgeht und der Selector den manual-Modus erkennt.
    const { findAllByTitle, findByRole } = render(
      <Wrapper>
        <NvSwapOptimizerModal sourceTourId="tour-1" onClose={() => {}} />
      </Wrapper>,
    );
    const selects = await findAllByTitle(/Ziel der Sendung waehlen/);
    fireEvent.change(selects[0], { target: { value: 'tour-2' } });

    const execBtn = await findByRole('button', {
      name: /Ausführen \(\d+\)/,
    });
    expect(execBtn).toBeTruthy();
  });

  it('Phase 3: "Neue Tour"-Auswahl zeigt Gruppen-Form (Stamm + Datum)', async () => {
    // Beide Ejects auf 'new' → 1 Gruppen-Form (Stamm + Datum) wird
    // sichtbar. Default-Stamm = Source-Stamm 'stamm-1'.
    const { findAllByTitle, findByText } = render(
      <Wrapper>
        <NvSwapOptimizerModal sourceTourId="tour-1" onClose={() => {}} />
      </Wrapper>,
    );
    const selects = await findAllByTitle(/Ziel der Sendung waehlen/);
    fireEvent.change(selects[0], { target: { value: '__new__' } });
    await findByText(/Neue Gruppen-Tour/);
    // Defaults sind aus Source-Tour vorbelegt → executableCount > 0.
    const execBtn = await findByText(/Ausführen \(\d+\)/);
    expect(execBtn).toBeTruthy();
  });

  it('Phase 3: "↗ eigen"-Toggle zeigt inline Form fuer einzelnen Eject', async () => {
    const { findAllByTitle, findByText, findByTitle } = render(
      <Wrapper>
        <NvSwapOptimizerModal sourceTourId="tour-1" onClose={() => {}} />
      </Wrapper>,
    );
    const selects = await findAllByTitle(/Ziel der Sendung waehlen/);
    // Beide Ejects auf 'new' → Toggle erscheint.
    fireEvent.change(selects[0], { target: { value: '__new__' } });
    // "↗ eigen"-Button klicken → eigene Form inline.
    const eigenBtn = await findByTitle(/Eigene Tour fuer diese Sendung/);
    fireEvent.click(eigenBtn);
    // Inline-Form-Hinweis: pro-Eject Datum-Input ist nun da.
    // Ausfuehren-Button bleibt (newForm prefilled aus Group).
    const execBtn = await findByText(/Ausführen \(\d+\)/);
    expect(execBtn).toBeTruthy();
  });
});

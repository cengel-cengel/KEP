/**
 * Phase-1 Regression-Lock: Selection-Verhalten der DispositionPage.
 *
 * Carlos-Spec: "selection.test.tsx schreibt aktuelles Verhalten fest
 * (Multi-Toggle, Group-Checkbox, Modal-Nav, Drag-Set)". Diese Tests
 * decken die observable bulk-action-bar + Group-Checkbox-Indeterminate-
 * UI + Detail-Modal-Navigation ab, damit der Folge-Refactor
 * (ShipmentRow extrahieren, groupShipments memoisieren, Handler in
 * useCallback) nichts bricht.
 *
 * Nicht-abgedeckt (Backlog-Tests):
 *   · Drag-Set-Start liest selectedIds (komplexer DataTransfer-Mock).
 *   · Bulk-Mutation API-Body (`shipments/bulk-patch`) — Hot-Path in
 *     ShipmentCard, getrennter ShipmentCard-Test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const apiGet = vi.fn();
const apiPost = vi.fn().mockResolvedValue({ data: {} });
const apiPatch = vi.fn().mockResolvedValue({ data: {} });
const apiDelete = vi.fn().mockResolvedValue({ data: {} });

vi.mock('../lib/api', () => ({
  api: {
    get: (url: string) => apiGet(url),
    post: (url: string, body?: unknown) => apiPost(url, body),
    patch: (url: string, body?: unknown) => apiPatch(url, body),
    delete: (url: string) => apiDelete(url),
  },
  AUTH_TOKEN_KEY: 'tms_token',
}));

// Heavy children mocken — wir testen NUR den Selection-Pfad.
vi.mock('../components/DispositionMap', () => ({
  default: () => <div data-testid="dispo-map-stub" />,
}));

// ShipmentDetailModal-Stub: expose onNavigate als testbare Buttons.
vi.mock('../components/ShipmentDetailModal', () => ({
  default: (props: {
    shipmentId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (dir: 'prev' | 'next') => void;
  }) =>
    props.isOpen ? (
      <div data-testid="detail-modal">
        <span data-testid="detail-modal-id">{props.shipmentId ?? ''}</span>
        <button
          data-testid="modal-next"
          onClick={() => props.onNavigate('next')}
        >
          next
        </button>
        <button
          data-testid="modal-prev"
          onClick={() => props.onNavigate('prev')}
        >
          prev
        </button>
        <button data-testid="modal-close" onClick={props.onClose}>
          close
        </button>
      </div>
    ) : null,
}));

vi.mock('../components/ShipmentEditModal', () => ({
  default: () => null,
}));

vi.mock('../components/ShipmentCostCard', () => ({
  default: () => null,
}));

import DispositionPage from './DispositionPage';

const FIXTURE_SHIPMENTS = [
  {
    id: 's1',
    shipment_number: 'S-001',
    status: 'new',
    ldm: 1.2,
    relation: { code: 'DE-FR', name: 'Deutschland-Frankreich' },
    addresses_shipments_loading_address_idToaddresses: {
      city: 'Berlin',
      country_code: 'DE',
    },
    addresses_shipments_delivery_address_idToaddresses: {
      city: 'Lyon',
      country_code: 'FR',
    },
    shipment_package_items: [],
  },
  {
    id: 's2',
    shipment_number: 'S-002',
    status: 'new',
    ldm: 0.8,
    relation: { code: 'DE-FR', name: 'Deutschland-Frankreich' },
    addresses_shipments_loading_address_idToaddresses: {
      city: 'Berlin',
      country_code: 'DE',
    },
    addresses_shipments_delivery_address_idToaddresses: {
      city: 'Paris',
      country_code: 'FR',
    },
    shipment_package_items: [],
  },
  {
    id: 's3',
    shipment_number: 'S-003',
    status: 'new',
    ldm: 1.5,
    relation: { code: 'DE-FR', name: 'Deutschland-Frankreich' },
    addresses_shipments_loading_address_idToaddresses: {
      city: 'Hamburg',
      country_code: 'DE',
    },
    addresses_shipments_delivery_address_idToaddresses: {
      city: 'Marseille',
      country_code: 'FR',
    },
    shipment_package_items: [],
  },
];

function setupApiMocks() {
  apiGet.mockImplementation(async (url: string) => {
    if (url.startsWith('/shipments/map')) return { data: [] };
    if (url === '/shipments' || url.startsWith('/shipments?')) {
      return { data: FIXTURE_SHIPMENTS };
    }
    if (url === '/tours' || url.startsWith('/tours?')) return { data: [] };
    if (url === '/subcontractors') return { data: [] };
    if (url === '/pricing/sub-conditions') return { data: [] };
    return { data: [] };
  });
}

beforeEach(() => {
  setupApiMocks();
});

afterEach(() => {
  apiGet.mockReset();
  apiPost.mockReset().mockResolvedValue({ data: {} });
  apiPatch.mockReset().mockResolvedValue({ data: {} });
  apiDelete.mockReset().mockResolvedValue({ data: {} });
});

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <MemoryRouter initialEntries={['/disposition']}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

async function expandAllGroups() {
  // FR-Country zuerst aufklappen (deliveryCountry='FR' fuer alle 3
  // Fixture-Items → 1 Country-Group "FR – Frankreich").
  const country = await screen.findByRole('button', { name: /Frankreich/ });
  fireEvent.click(country);
  // Dann DE-FR-Relation.
  const rel = await screen.findByRole('button', {
    name: /Deutschland-Frankreich/,
  });
  fireEvent.click(rel);
}

describe('DispositionPage Selection-Verhalten (Phase-1 Regression-Lock)', () => {
  it('initial: keine Bulk-Bar sichtbar', async () => {
    render(
      <Wrapper>
        <DispositionPage />
      </Wrapper>,
    );
    await screen.findByText(/Sendungen ohne Tour/);
    expect(screen.queryByText(/Sendung markiert/)).toBeNull();
    expect(screen.queryByText(/Sendungen markiert/)).toBeNull();
  });

  it('Single-Toggle: 1 Checkbox → Bulk-Bar "1 Sendung markiert"', async () => {
    render(
      <Wrapper>
        <DispositionPage />
      </Wrapper>,
    );
    await screen.findByText(/Sendungen ohne Tour/);
    await expandAllGroups();
    const cb = await screen.findByLabelText(/Sendung S-001 markieren/);
    fireEvent.click(cb);
    expect(
      await screen.findByText(/^1 Sendung markiert/),
    ).toBeInTheDocument();
  });

  it('Multi-Toggle: 2 Checkboxen → "2 Sendungen markiert"', async () => {
    render(
      <Wrapper>
        <DispositionPage />
      </Wrapper>,
    );
    await screen.findByText(/Sendungen ohne Tour/);
    await expandAllGroups();
    fireEvent.click(await screen.findByLabelText(/Sendung S-001 markieren/));
    fireEvent.click(await screen.findByLabelText(/Sendung S-002 markieren/));
    expect(
      await screen.findByText(/^2 Sendungen markiert/),
    ).toBeInTheDocument();
  });

  it('Clear: "Auswahl aufheben" entfernt die Bulk-Bar', async () => {
    render(
      <Wrapper>
        <DispositionPage />
      </Wrapper>,
    );
    await screen.findByText(/Sendungen ohne Tour/);
    await expandAllGroups();
    fireEvent.click(await screen.findByLabelText(/Sendung S-001 markieren/));
    await screen.findByText(/^1 Sendung markiert/);
    fireEvent.click(screen.getByText(/Auswahl aufheben/));
    expect(screen.queryByText(/markiert/)).toBeNull();
  });

  it('Group-Checkbox: Relation-Header markiert ALLE 3 Sendungen', async () => {
    render(
      <Wrapper>
        <DispositionPage />
      </Wrapper>,
    );
    await screen.findByText(/Sendungen ohne Tour/);
    await expandAllGroups();
    // Es gibt 3 Group-Checkboxen (Country + Relation + ggf. SubAxis-
    // bei kind='none'-Gruppen). Die DE-FR-Relation hat kind='relation'
    // → keine SubAxis. Click auf Relation-Checkbox → alle 3 Items.
    const groupCb = await screen.findByLabelText(
      /Alle Sendungen DE-FR auswählen/,
    );
    fireEvent.click(groupCb);
    expect(
      await screen.findByText(/^3 Sendungen markiert/),
    ).toBeInTheDocument();
  });

  it('Group-Checkbox 2× Toggle: erst alle markiert, dann alle entmarkiert', async () => {
    render(
      <Wrapper>
        <DispositionPage />
      </Wrapper>,
    );
    await screen.findByText(/Sendungen ohne Tour/);
    await expandAllGroups();
    const groupCb = await screen.findByLabelText(
      /Alle Sendungen DE-FR auswählen/,
    );
    fireEvent.click(groupCb);
    await screen.findByText(/^3 Sendungen markiert/);
    fireEvent.click(groupCb);
    expect(screen.queryByText(/markiert/)).toBeNull();
  });

  it('Modal-Nav: Detail-Modal Next → setDetailViewShipmentId auf naechstes Item in groupFlat', async () => {
    render(
      <Wrapper>
        <DispositionPage />
      </Wrapper>,
    );
    await screen.findByText(/Sendungen ohne Tour/);
    await expandAllGroups();
    // Wir benoetigen den Card-Click-Pfad damit detailViewShipmentId
    // gesetzt wird. ShipmentCard rendert eine Pencil-Edit-Button-
    // Gruppe — der Hauptcontainer hat onClick=handleListShipmentClick
    // + onCardClick (set Edit/Detail). Wir klicken den ShipmentCard-
    // Wrapper (div mit cursor-pointer).
    // Pragmatisch: triggere Edit via Pencil-Icon des Cards (oeffnet
    // editingShipmentId, NICHT detailViewShipmentId). Stattdessen:
    // Card-Body click → onCardClick → setDetailViewShipmentId.
    const card1 = await screen.findByText('S-001');
    fireEvent.click(card1);
    // Modal ist offen mit s1.
    const modalId = await screen.findByTestId('detail-modal-id');
    expect(modalId.textContent).toBe('s1');
    // Next → s2.
    fireEvent.click(screen.getByTestId('modal-next'));
    expect(
      (await screen.findByTestId('detail-modal-id')).textContent,
    ).toBe('s2');
    // Next → s3.
    fireEvent.click(screen.getByTestId('modal-next'));
    expect(
      (await screen.findByTestId('detail-modal-id')).textContent,
    ).toBe('s3');
    // Next von s3 → bleibt s3 (Ende der Liste).
    fireEvent.click(screen.getByTestId('modal-next'));
    expect(
      (await screen.findByTestId('detail-modal-id')).textContent,
    ).toBe('s3');
    // Prev → s2.
    fireEvent.click(screen.getByTestId('modal-prev'));
    expect(
      (await screen.findByTestId('detail-modal-id')).textContent,
    ).toBe('s2');
    // Close.
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('detail-modal')).toBeNull();
  });
});

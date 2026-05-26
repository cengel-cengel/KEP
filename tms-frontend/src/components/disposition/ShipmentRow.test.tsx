/**
 * Phase-1 ShipmentRow Unit-Test: memo + Click-Handler-Wiring.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import ShipmentRow from './ShipmentRow';
import type { Shipment } from '../../types/shipment';

const apiPost = vi.fn().mockResolvedValue({ data: {} });
const apiPatch = vi.fn().mockResolvedValue({ data: {} });
const apiGet = vi.fn().mockResolvedValue({ data: [] });
vi.mock('../../lib/api', () => ({
  api: {
    get: (url: string) => apiGet(url),
    post: (url: string, body?: unknown) => apiPost(url, body),
    patch: (url: string, body?: unknown) => apiPatch(url, body),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  AUTH_TOKEN_KEY: 'tms_token',
}));

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

const SHIPMENT: Shipment = {
  id: 's1',
  shipment_number: 'S-001',
  status: 'new',
  ldm: 1.2,
} as unknown as Shipment;

beforeEach(() => {
  apiGet.mockReset().mockResolvedValue({ data: [] });
  apiPost.mockReset().mockResolvedValue({ data: {} });
  apiPatch.mockReset().mockResolvedValue({ data: {} });
});

afterEach(() => {
  cleanup();
});

describe('ShipmentRow', () => {
  it('rendert Checkbox + Card mit shipment_number', () => {
    render(
      <Wrapper>
        <ShipmentRow
          shipment={SHIPMENT}
          isSelected={false}
          isHighlighted={false}
          isDetailFocused={false}
          onToggleSelection={vi.fn()}
          onRowClick={vi.fn()}
          onCardClick={vi.fn()}
          registerRef={vi.fn()}
          isBulkSelected={false}
          getBulkIds={() => []}
        />
      </Wrapper>,
    );
    const cb = screen.getByLabelText(/Sendung S-001 markieren/);
    expect(cb).toBeInTheDocument();
    expect((cb as HTMLInputElement).checked).toBe(false);
  });

  it('isSelected=true: Checkbox checked + blau-Border', () => {
    const { container } = render(
      <Wrapper>
        <ShipmentRow
          shipment={SHIPMENT}
          isSelected
          isHighlighted={false}
          isDetailFocused={false}
          onToggleSelection={vi.fn()}
          onRowClick={vi.fn()}
          onCardClick={vi.fn()}
          registerRef={vi.fn()}
          isBulkSelected={false}
          getBulkIds={() => ['s1']}
        />
      </Wrapper>,
    );
    const cb = screen.getByLabelText(/Sendung S-001 markieren/);
    expect((cb as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector('.border-blue-300')).toBeTruthy();
  });

  it('isHighlighted=true: yellow-Pulse-Border', () => {
    const { container } = render(
      <Wrapper>
        <ShipmentRow
          shipment={SHIPMENT}
          isSelected={false}
          isHighlighted
          isDetailFocused={false}
          onToggleSelection={vi.fn()}
          onRowClick={vi.fn()}
          onCardClick={vi.fn()}
          registerRef={vi.fn()}
          isBulkSelected={false}
          getBulkIds={() => []}
        />
      </Wrapper>,
    );
    expect(container.querySelector('.border-yellow-500')).toBeTruthy();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('Checkbox-Click → onToggleSelection(id)', () => {
    const onToggle = vi.fn();
    render(
      <Wrapper>
        <ShipmentRow
          shipment={SHIPMENT}
          isSelected={false}
          isHighlighted={false}
          isDetailFocused={false}
          onToggleSelection={onToggle}
          onRowClick={vi.fn()}
          onCardClick={vi.fn()}
          registerRef={vi.fn()}
          isBulkSelected={false}
          getBulkIds={() => []}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText(/Sendung S-001 markieren/));
    expect(onToggle).toHaveBeenCalledWith('s1');
  });

  it('Checkbox-Click stoppt propagation (kein Row-Click-Trigger)', () => {
    const onToggle = vi.fn();
    const onRowClick = vi.fn();
    render(
      <Wrapper>
        <ShipmentRow
          shipment={SHIPMENT}
          isSelected={false}
          isHighlighted={false}
          isDetailFocused={false}
          onToggleSelection={onToggle}
          onRowClick={onRowClick}
          onCardClick={vi.fn()}
          registerRef={vi.fn()}
          isBulkSelected={false}
          getBulkIds={() => []}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText(/Sendung S-001 markieren/));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('Phase-C Bulk: isBulkSelected=true + getBulkIds → Stackable-Toggle ruft /bulk-patch', async () => {
    const getBulkIds = vi.fn(() => ['s1', 's2', 's3']);
    // Damit der Stackable-Button "canToggle" true ist, braucht shipment
    // mindestens 1 package_item.
    const SHIPMENT_WITH_ITEMS = {
      ...SHIPMENT,
      shipment_package_items: [
        { id: 'pi-1', stackable: true } as { id: string; stackable: boolean },
      ],
    } as unknown as Shipment;
    render(
      <Wrapper>
        <ShipmentRow
          shipment={SHIPMENT_WITH_ITEMS}
          isSelected
          isHighlighted={false}
          isDetailFocused={false}
          onToggleSelection={vi.fn()}
          onRowClick={vi.fn()}
          onCardClick={vi.fn()}
          registerRef={vi.fn()}
          isBulkSelected
          getBulkIds={getBulkIds}
        />
      </Wrapper>,
    );
    // Stackable-Button hat Text "🔵 Stapelbar" — emoji-prefix bricht
    // findByRole-name-matching; getByText auf den Inhalt reicht.
    const stackBtn = await screen.findByText(/^🔵 Stapelbar$/);
    fireEvent.click(stackBtn);
    // apiPost wurde mit Bulk-Body gerufen, getBulkIds wurde JIT
    // evaluiert (3 IDs → Bulk-Pfad).
    await new Promise((r) => setTimeout(r, 0));
    expect(getBulkIds).toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledWith('/shipments/bulk-patch', {
      ids: ['s1', 's2', 's3'],
      patch: { stackable: false },
    });
  });

  it('Phase-C Single-Mode: isBulkSelected=false → Stackable-Toggle ruft /shipments/:id/stackable', async () => {
    const SHIPMENT_WITH_ITEMS = {
      ...SHIPMENT,
      shipment_package_items: [
        { id: 'pi-1', stackable: true } as { id: string; stackable: boolean },
      ],
    } as unknown as Shipment;
    render(
      <Wrapper>
        <ShipmentRow
          shipment={SHIPMENT_WITH_ITEMS}
          isSelected={false}
          isHighlighted={false}
          isDetailFocused={false}
          onToggleSelection={vi.fn()}
          onRowClick={vi.fn()}
          onCardClick={vi.fn()}
          registerRef={vi.fn()}
          isBulkSelected={false}
          getBulkIds={() => []}
        />
      </Wrapper>,
    );
    // Stackable-Button hat Text "🔵 Stapelbar" — emoji-prefix bricht
    // findByRole-name-matching; getByText auf den Inhalt reicht.
    const stackBtn = await screen.findByText(/^🔵 Stapelbar$/);
    fireEvent.click(stackBtn);
    await new Promise((r) => setTimeout(r, 0));
    expect(apiPatch).toHaveBeenCalledWith('/shipments/s1/stackable', {
      stackable: false,
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('registerRef wird mit (id, el) gerufen on mount + (id, null) on unmount', () => {
    const registerRef = vi.fn();
    const { unmount } = render(
      <Wrapper>
        <ShipmentRow
          shipment={SHIPMENT}
          isSelected={false}
          isHighlighted={false}
          isDetailFocused={false}
          onToggleSelection={vi.fn()}
          onRowClick={vi.fn()}
          onCardClick={vi.fn()}
          registerRef={registerRef}
          isBulkSelected={false}
          getBulkIds={() => []}
        />
      </Wrapper>,
    );
    // Mount: registerRef gerufen mit el !== null
    const mountCall = registerRef.mock.calls.find((c) => c[1] !== null);
    expect(mountCall?.[0]).toBe('s1');
    expect(mountCall?.[1]).toBeInstanceOf(HTMLDivElement);
    // Unmount: registerRef gerufen mit (id, null)
    unmount();
    const unmountCall = registerRef.mock.calls.find((c) => c[1] === null);
    expect(unmountCall?.[0]).toBe('s1');
  });
});

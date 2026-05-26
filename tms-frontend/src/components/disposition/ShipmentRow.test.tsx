/**
 * Phase-1 ShipmentRow Unit-Test: memo + Click-Handler-Wiring.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
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
          selectedIds={new Set()}
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
          selectedIds={new Set(['s1'])}
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
          selectedIds={new Set()}
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
          selectedIds={new Set()}
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
          selectedIds={new Set()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText(/Sendung S-001 markieren/));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
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
          selectedIds={new Set()}
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

/**
 * C-2 SplitShipmentDialog Render-Tests.
 *
 * Mockt api.get/post via vitest. Verifiziert:
 *   - Items rendern als Checkbox-Liste
 *   - "Splitten"-Btn disabled wenn 0 selected oder ALL selected
 *   - Tooltip-Hint wenn items < 2
 *   - Submit-Button enabled bei valider Selection
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SplitShipmentDialog from './SplitShipmentDialog';

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from '../../../lib/api';

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const baseItems = [
  {
    id: 'item-1',
    line_index: 1,
    package_type: 'pallet_euro',
    quantity: 2,
    length_cm: 120,
    width_cm: 80,
    height_cm: 120,
    weight_kg: 250,
  },
  {
    id: 'item-2',
    line_index: 2,
    package_type: 'pallet_euro',
    quantity: 1,
    length_cm: 120,
    width_cm: 80,
    height_cm: 100,
    weight_kg: 180,
  },
  {
    id: 'item-3',
    line_index: 3,
    package_type: 'box',
    quantity: 4,
    length_cm: 60,
    width_cm: 40,
    height_cm: 30,
    weight_kg: 30,
  },
];

describe('SplitShipmentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rendert Items als Checkbox-Liste', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: {
        id: 'sh-1',
        shipment_number: 'S26-000001',
        shipment_package_items: baseItems,
      },
    });
    renderWithClient(
      <SplitShipmentDialog
        tourId="t1"
        stopId="st1"
        shipmentId="sh-1"
        onClose={() => {}}
      />,
    );
    await screen.findByText(/Wähle Items/);
    expect(screen.getAllByRole('checkbox').length).toBe(baseItems.length);
  });

  it('Splitten-Btn disabled wenn 0 selected', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: { id: 'sh-1', shipment_package_items: baseItems },
    });
    renderWithClient(
      <SplitShipmentDialog
        tourId="t1"
        stopId="st1"
        shipmentId="sh-1"
        onClose={() => {}}
      />,
    );
    await screen.findByText(/Wähle Items/);
    const btn = screen.getByRole('button', { name: /Splitten/ });
    expect(btn).toBeDisabled();
  });

  it('Splitten-Btn disabled wenn ALL selected', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: { id: 'sh-1', shipment_package_items: baseItems },
    });
    renderWithClient(
      <SplitShipmentDialog
        tourId="t1"
        stopId="st1"
        shipmentId="sh-1"
        onClose={() => {}}
      />,
    );
    await screen.findByText(/Wähle Items/);
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => fireEvent.click(cb));
    expect(screen.getByText(/Mindestens 1 Item.*verbleiben/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Splitten/ })).toBeDisabled();
  });

  it('Submit-Btn enabled bei 1 selected, posted body korrekt', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: { id: 'sh-1', shipment_package_items: baseItems },
    });
    (api.post as any).mockResolvedValueOnce({ data: {} });
    renderWithClient(
      <SplitShipmentDialog
        tourId="t1"
        stopId="st1"
        shipmentId="sh-1"
        onClose={() => {}}
      />,
    );
    await screen.findByText(/Wähle Items/);
    fireEvent.click(screen.getAllByRole('checkbox')[0]); // item-1
    const btn = screen.getByRole('button', { name: /Splitten/ });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 50));
    expect(api.post).toHaveBeenCalledWith(
      '/nv-touren/t1/stops/st1/split',
      { splitItemIds: ['item-1'] },
    );
  });

  it('zeigt Warn-Hint wenn items < 2', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: { id: 'sh-1', shipment_package_items: [baseItems[0]] },
    });
    renderWithClient(
      <SplitShipmentDialog
        tourId="t1"
        stopId="st1"
        shipmentId="sh-1"
        onClose={() => {}}
      />,
    );
    await screen.findByText(/mindestens 2 Items/);
    expect(screen.getByRole('button', { name: /Splitten/ })).toBeDisabled();
  });
});

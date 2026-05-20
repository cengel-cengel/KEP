/**
 * C-2 + C-2.1 SplitShipmentDialog Render-Tests.
 *
 * Mockt api.get/post via vitest. Verifiziert:
 *   - Items rendern als Quantity-Input-Liste
 *   - "Splitten"-Btn disabled wenn 0 oder ALL gewählt
 *   - +/- Buttons funktionieren
 *   - Submit-Payload = itemSplits[]
 *   - mode='fv' nutzt /tours-Endpoint
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
    quantity: 5,
    length_cm: 120,
    width_cm: 80,
    height_cm: 120,
    weight_kg: 250,
  },
  {
    id: 'item-2',
    line_index: 2,
    package_type: 'pallet_euro',
    quantity: 3,
    length_cm: 120,
    width_cm: 80,
    height_cm: 100,
    weight_kg: 180,
  },
];

describe('SplitShipmentDialog (C-2.1 Partial-Qty)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rendert Quantity-Inputs pro Item (Minus/Plus + Number-Input)', async () => {
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
    await screen.findByText(/Wähle pro Item/);
    expect(screen.getAllByLabelText(/Split-Qty für Item/).length).toBe(2);
    expect(screen.getAllByLabelText('Mehr').length).toBe(2);
    expect(screen.getAllByLabelText('Weniger').length).toBe(2);
  });

  it('Splitten-Btn disabled wenn 0 Total-Qty', async () => {
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
    await screen.findByText(/Wähle pro Item/);
    expect(screen.getByRole('button', { name: /Splitten/ })).toBeDisabled();
  });

  it('Plus-Btn erhöht Qty, Submit-Btn enabled', async () => {
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
    await screen.findByText(/Wähle pro Item/);
    fireEvent.click(screen.getAllByLabelText('Mehr')[0]);
    expect(screen.getByRole('button', { name: /Splitten/ })).not.toBeDisabled();
  });

  it('Submit payload — itemSplits Format (NV)', async () => {
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
    await screen.findByText(/Wähle pro Item/);
    fireEvent.click(screen.getAllByLabelText('Mehr')[0]);
    fireEvent.click(screen.getAllByLabelText('Mehr')[0]); // qty=2 of item-1
    fireEvent.click(screen.getByRole('button', { name: /Splitten/ }));
    await new Promise((r) => setTimeout(r, 50));
    expect(api.post).toHaveBeenCalledWith(
      '/nv-touren/t1/stops/st1/split',
      { itemSplits: [{ itemId: 'item-1', quantity: 2 }] },
    );
  });

  it('mode=fv → /tours-Endpoint', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: { id: 'sh-1', shipment_package_items: baseItems },
    });
    (api.post as any).mockResolvedValueOnce({ data: {} });
    renderWithClient(
      <SplitShipmentDialog
        tourId="t1"
        shipmentId="sh-1"
        mode="fv"
        onClose={() => {}}
      />,
    );
    await screen.findByText(/Wähle pro Item/);
    fireEvent.click(screen.getAllByLabelText('Mehr')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Splitten/ }));
    await new Promise((r) => setTimeout(r, 50));
    expect(api.post).toHaveBeenCalledWith(
      '/tours/t1/shipments/sh-1/split',
      { itemSplits: [{ itemId: 'item-1', quantity: 1 }] },
    );
  });

  it('ALL Qty selected → Submit disabled (mind. 1 muss bleiben)', async () => {
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
    await screen.findByText(/Wähle pro Item/);
    // item-1 hat 5 stück → 5x Mehr-Click
    const moreBtn1 = screen.getAllByLabelText('Mehr')[0];
    for (let i = 0; i < 5; i++) fireEvent.click(moreBtn1);
    // item-2 hat 3 stück → 3x Mehr-Click
    const moreBtn2 = screen.getAllByLabelText('Mehr')[1];
    for (let i = 0; i < 3; i++) fireEvent.click(moreBtn2);
    expect(screen.getByText(/Mindestens 1 Stück muss/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Splitten/ })).toBeDisabled();
  });

  it('zeigt Warn-Hint wenn totalQty < 2', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: {
        id: 'sh-1',
        shipment_package_items: [{ ...baseItems[0], quantity: 1 }],
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
    await screen.findByText(/mindestens 2/);
    expect(screen.getByRole('button', { name: /Splitten/ })).toBeDisabled();
  });
});

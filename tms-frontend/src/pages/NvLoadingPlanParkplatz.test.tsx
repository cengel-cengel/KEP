/**
 * Schritt 4: NvLoadingPlanParkplatz — Drop-Zone + Restore.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import NvLoadingPlanParkplatz from './NvLoadingPlanParkplatz';
import type { NvLoadingDetail } from './NvLoadingPlanPage';

afterEach(() => {
  cleanup();
});

const TOUR_STOPS: NvLoadingDetail['stops'] = [
  {
    id: 'stop-1',
    position: 1,
    shipment: {
      id: 'sh-1',
      shipment_number: 'S-001',
      ldm: 1.6,
      weight_kg: 100,
      shipment_package_items: [],
    },
  },
  {
    id: 'stop-2',
    position: 2,
    shipment: {
      id: 'sh-2',
      shipment_number: 'S-002',
      ldm: 1.9,
      weight_kg: 250,
      shipment_package_items: [],
    },
  },
];

describe('NvLoadingPlanParkplatz', () => {
  it('leerer Parkplatz → dashed-Border + Hinweistext', () => {
    render(
      <NvLoadingPlanParkplatz
        tourStops={TOUR_STOPS}
        ejectedShipmentIds={new Set()}
        insertedShipmentIds={new Set()}
        dispatch={vi.fn()}
      />,
    );
    const dropzone = screen.getByTestId('nv-parkplatz-dropzone');
    expect(dropzone.className).toContain('border-dashed');
    expect(screen.getByText(/aus der Tour zu werfen/)).toBeInTheDocument();
  });

  it('Drop einer Tour-Sendung → dispatch eject', () => {
    const dispatch = vi.fn();
    render(
      <NvLoadingPlanParkplatz
        tourStops={TOUR_STOPS}
        ejectedShipmentIds={new Set()}
        insertedShipmentIds={new Set()}
        dispatch={dispatch}
      />,
    );
    const dropzone = screen.getByTestId('nv-parkplatz-dropzone');
    const dataTransfer = {
      types: ['application/x-nv-shipment-id'],
      getData: (mime: string) =>
        mime === 'application/x-nv-shipment-id' ? 'sh-1' : '',
      setData: () => {},
      effectAllowed: 'move' as const,
      dropEffect: 'move' as const,
    };
    fireEvent.dragOver(dropzone, { dataTransfer });
    fireEvent.drop(dropzone, { dataTransfer });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'eject',
      shipmentId: 'sh-1',
    });
  });

  it('Drop einer inserted-Sendung (NICHT in TourStops) → dispatch eject (Reducer-Symmetrie macht removeInsert)', () => {
    const dispatch = vi.fn();
    render(
      <NvLoadingPlanParkplatz
        tourStops={TOUR_STOPS}
        ejectedShipmentIds={new Set()}
        insertedShipmentIds={new Set(['sh-new'])}
        dispatch={dispatch}
      />,
    );
    const dropzone = screen.getByTestId('nv-parkplatz-dropzone');
    const dataTransfer = {
      types: ['application/x-nv-shipment-id'],
      getData: (mime: string) =>
        mime === 'application/x-nv-shipment-id' ? 'sh-new' : '',
      setData: () => {},
      effectAllowed: 'move' as const,
      dropEffect: 'move' as const,
    };
    fireEvent.dragOver(dropzone, { dataTransfer });
    fireEvent.drop(dropzone, { dataTransfer });
    // Caller dispatcht 'eject'; der Reducer wandelt das intern in
    // removeInsert (siehe nvLoadingPlanSandbox.test.ts).
    expect(dispatch).toHaveBeenCalledWith({
      type: 'eject',
      shipmentId: 'sh-new',
    });
  });

  it('Drop einer fremden Sendung (weder Tour noch inserted) → no-op', () => {
    const dispatch = vi.fn();
    render(
      <NvLoadingPlanParkplatz
        tourStops={TOUR_STOPS}
        ejectedShipmentIds={new Set()}
        insertedShipmentIds={new Set()}
        dispatch={dispatch}
      />,
    );
    const dropzone = screen.getByTestId('nv-parkplatz-dropzone');
    const dataTransfer = {
      types: ['application/x-nv-shipment-id'],
      getData: (mime: string) =>
        mime === 'application/x-nv-shipment-id' ? 'sh-foreign' : '',
      setData: () => {},
      effectAllowed: 'move' as const,
      dropEffect: 'move' as const,
    };
    fireEvent.dragOver(dropzone, { dataTransfer });
    fireEvent.drop(dropzone, { dataTransfer });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('ejected-Card + Restore-Button → dispatch restore', () => {
    const dispatch = vi.fn();
    render(
      <NvLoadingPlanParkplatz
        tourStops={TOUR_STOPS}
        ejectedShipmentIds={new Set(['sh-1'])}
        insertedShipmentIds={new Set()}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByTestId('parkplatz-card-sh-1')).toBeInTheDocument();
    expect(screen.getByText('S-001')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('parkplatz-restore-sh-1'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'restore',
      shipmentId: 'sh-1',
    });
  });
});

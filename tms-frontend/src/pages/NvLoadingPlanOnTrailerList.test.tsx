/**
 * Schritt 4: NvLoadingPlanOnTrailerList — draggable Mini-Cards.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import NvLoadingPlanOnTrailerList from './NvLoadingPlanOnTrailerList';
import type { NvLoadingDetail } from './NvLoadingPlanPage';

afterEach(() => {
  cleanup();
});

const STOPS: NvLoadingDetail['stops'] = [
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

describe('NvLoadingPlanOnTrailerList', () => {
  it('rendert pro stop eine Card mit shipment_number + ldm + kg', () => {
    render(<NvLoadingPlanOnTrailerList stops={STOPS} />);
    expect(screen.getByTestId('ontrailer-card-sh-1')).toBeInTheDocument();
    expect(screen.getByTestId('ontrailer-card-sh-2')).toBeInTheDocument();
    expect(screen.getByText('S-001')).toBeInTheDocument();
    expect(screen.getByText(/1\.6 ldm.*100 kg/)).toBeInTheDocument();
    expect(screen.getByText(/1\.9 ldm.*250 kg/)).toBeInTheDocument();
  });

  it('Card ist draggable mit shipmentId via dataTransfer', () => {
    render(<NvLoadingPlanOnTrailerList stops={STOPS} />);
    const card = screen.getByTestId('ontrailer-card-sh-1');
    expect(card).toHaveAttribute('draggable');
    const setData = vi.fn();
    fireEvent.dragStart(card, {
      dataTransfer: {
        setData,
        effectAllowed: 'move',
      },
    });
    expect(setData).toHaveBeenCalledWith(
      'application/x-nv-shipment-id',
      'sh-1',
    );
  });

  it('leerer Tour → "Tour ist leer"-Hinweis', () => {
    render(<NvLoadingPlanOnTrailerList stops={[]} />);
    expect(screen.getByText(/Tour ist leer/)).toBeInTheDocument();
  });
});

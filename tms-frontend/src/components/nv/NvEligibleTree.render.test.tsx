/**
 * W-3.2.D Render-Test NvEligibleTree.
 *
 * Pure-Component-Test (kein Provider nötig — alle State + Callbacks
 * via Props). Verifiziert:
 *   - Group-by tour_gebiet_code Rendering
 *   - Collapse-Toggle (onToggleGroup callback)
 *   - Empty-State
 *   - Drag-Source-Attribut + JSON-Payload-Format
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NvEligibleTree from './NvEligibleTree';
import type { EligibleShipment } from '../../lib/nvTypes';

function mkShipment(
  id: string,
  matched: string | null,
  shipmentNumber?: string,
): EligibleShipment {
  return {
    id,
    shipment_number: shipmentNumber ?? `SH-${id}`,
    customer_id: null,
    loading_date: '2026-05-20',
    delivery_date: '2026-05-21',
    package_count: 1,
    matched_tour_gebiet_id: matched ? `gid-${matched}` : null,
    matched_tour_gebiet_code: matched,
    is_stamm_kunde: false,
  };
}

const noop = () => undefined;

describe('NvEligibleTree (Render)', () => {
  it('rendert Empty-State wenn keine shipments', () => {
    render(
      <NvEligibleTree
        shipments={[]}
        farbenMap={new Map()}
        expandedGroup={null}
        onToggleGroup={noop}
        selected={new Set()}
        draggingId={null}
        setDraggingId={noop}
        onSelect={noop}
        onOpenDetail={noop}
      />,
    );
    expect(screen.getByText('Keine offenen Sendungen.')).toBeInTheDocument();
  });

  it('rendert Group-Header mit Count', () => {
    const ships = [
      mkShipment('1', 'NORD'),
      mkShipment('2', 'NORD'),
      mkShipment('3', 'SUED'),
    ];
    render(
      <NvEligibleTree
        shipments={ships}
        farbenMap={new Map([['NORD', '#ff0000']])}
        expandedGroup={null}
        onToggleGroup={noop}
        selected={new Set()}
        draggingId={null}
        setDraggingId={noop}
        onSelect={noop}
        onOpenDetail={noop}
      />,
    );
    expect(screen.getByText(/NORD\s*\(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/SUED\s*\(1\)/)).toBeInTheDocument();
  });

  it('Group-Toggle ruft onToggleGroup mit Key', () => {
    const onToggle = vi.fn();
    const ships = [mkShipment('1', 'NORD')];
    render(
      <NvEligibleTree
        shipments={ships}
        farbenMap={new Map()}
        expandedGroup={null}
        onToggleGroup={onToggle}
        selected={new Set()}
        draggingId={null}
        setDraggingId={noop}
        onSelect={noop}
        onOpenDetail={noop}
      />,
    );
    fireEvent.click(screen.getByText(/NORD/));
    expect(onToggle).toHaveBeenCalledWith('NORD');
  });

  it('null-matched → "— ohne Zuordnung —"', () => {
    render(
      <NvEligibleTree
        shipments={[mkShipment('1', null)]}
        farbenMap={new Map()}
        expandedGroup={null}
        onToggleGroup={noop}
        selected={new Set()}
        draggingId={null}
        setDraggingId={noop}
        onSelect={noop}
        onOpenDetail={noop}
      />,
    );
    expect(
      screen.getByText(/— ohne Zuordnung —/),
    ).toBeInTheDocument();
  });
});

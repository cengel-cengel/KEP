/**
 * C' Sprint: Render + Aggregate-Compute-Tests für MultiTourAggregateStrip.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MultiTourAggregateStrip, {
  computeMultiTourAggregates,
} from './MultiTourAggregateStrip';
import type { NvTour } from '../../lib/nvTypes';

function mkTour(
  id: string,
  km: number | null,
  euro: number | null,
  stops: Array<{ shipmentId: string; kg: number }>,
): NvTour {
  return {
    id,
    datum: '2026-05-20',
    status: 'PLANNING',
    fahrzeug_typ: null,
    fahrer_kosten_eur: null,
    fahrzeug_kosten_eur: null,
    kraftstoff_kosten_eur: null,
    dispo_kosten_eur: null,
    sonstige_kosten_eur: null,
    total_kosten_eur: euro,
    angefahrene_km: null,
    geplante_km: km,
    stunden_geleistet: null,
    notizen: null,
    subunternehmer_id: null,
    nv_stamm_tour_id: null,
    stops: stops.map((s, i) => ({
      id: `${id}-st-${i}`,
      position: i + 1,
      status: 'PLANNED',
      servicezeit_min: null,
      routing_klasse: null,
      shipment: {
        id: s.shipmentId,
        shipment_number: s.shipmentId,
        customer_id: null,
        weight_kg: s.kg,
      },
    })),
  } as NvTour;
}

describe('computeMultiTourAggregates', () => {
  it('Σ über alle Touren', () => {
    const tours = [
      mkTour('A', 50, 100, [
        { shipmentId: 's1', kg: 100 },
        { shipmentId: 's2', kg: 200 },
      ]),
      mkTour('B', 30, 50, [{ shipmentId: 's3', kg: 50 }]),
    ];
    const agg = computeMultiTourAggregates(tours);
    expect(agg.tourCount).toBe(2);
    expect(agg.shipmentCount).toBe(3);
    expect(agg.weightKgSum).toBe(350);
    expect(agg.kmTotal).toBe(80);
    expect(agg.euroTotal).toBe(150);
  });

  it('Sendung in 2 Touren → dedupe via Set', () => {
    const tours = [
      mkTour('A', 0, 0, [{ shipmentId: 'dup', kg: 100 }]),
      mkTour('B', 0, 0, [{ shipmentId: 'dup', kg: 100 }]),
    ];
    const agg = computeMultiTourAggregates(tours);
    expect(agg.shipmentCount).toBe(1);
    expect(agg.weightKgSum).toBe(200); // weight wird trotzdem summiert
  });

  it('null/non-finite Werte ignoriert', () => {
    const tours = [
      mkTour('A', null, null, []),
      mkTour('B', 10, 20, []),
    ];
    const agg = computeMultiTourAggregates(tours);
    expect(agg.kmTotal).toBe(10);
    expect(agg.euroTotal).toBe(20);
  });
});

describe('MultiTourAggregateStrip', () => {
  it('rendert nichts bei 0 Touren', () => {
    const { container } = render(<MultiTourAggregateStrip tours={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rendert nichts bei 1 Tour (Schwelle ≥2)', () => {
    const { container } = render(
      <MultiTourAggregateStrip
        tours={[mkTour('A', 10, 20, [{ shipmentId: 's', kg: 50 }])]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('rendert 5 Kacheln bei ≥2 Touren', () => {
    render(
      <MultiTourAggregateStrip
        tours={[
          mkTour('A', 10, 20, [
            { shipmentId: 's1', kg: 50 },
            { shipmentId: 's2', kg: 25 },
          ]),
          mkTour('B', 5, 30, [{ shipmentId: 's3', kg: 100 }]),
        ]}
      />,
    );
    expect(screen.getByTestId('multi-tour-aggregate-strip')).toBeInTheDocument();
    expect(screen.getByText('Touren (Σ)')).toBeInTheDocument();
    expect(screen.getByText('Sendg.')).toBeInTheDocument();
    expect(screen.getByText('Gewicht')).toBeInTheDocument();
    expect(screen.getByText('km')).toBeInTheDocument();
    expect(screen.getByText('Kosten')).toBeInTheDocument();
    // Werte (Tour=2, Sendg=3, kg=175, km=15, €=50) → keine Kollisionen.
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('175')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });
});

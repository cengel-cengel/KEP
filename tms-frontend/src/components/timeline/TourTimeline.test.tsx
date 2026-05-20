/**
 * S-4 Timeline-Fokus Render-Tests.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TourTimeline, { type TimelineStop } from './TourTimeline';

const baseStop = (id: string, h: number, sev?: string): TimelineStop => ({
  id,
  position: Number(id.slice(1)),
  shipment_number: `S-${id}`,
  stop_type: 'DELIVERY',
  planned_arrival: new Date(2026, 4, 20, h, 0).toISOString(),
  planned_departure: new Date(2026, 4, 20, h, 30).toISOString(),
  risk_severity: sev ?? 'ok',
});

describe('TourTimeline (S-4)', () => {
  it('rendert "adaptiv"-Badge wenn planned_arrival-Range schmaler als 06-22', () => {
    render(<TourTimeline stops={[baseStop('s1', 10), baseStop('s2', 14)]} />);
    expect(screen.getByText('adaptiv')).toBeInTheDocument();
  });

  it('fallback 06-22 wenn keine planned_*-Zeiten', () => {
    const empty: TimelineStop = {
      id: 'x',
      position: 1,
      shipment_number: 'S-x',
      planned_arrival: null,
      planned_departure: null,
    };
    render(<TourTimeline stops={[empty]} />);
    expect(screen.queryByText('adaptiv')).not.toBeInTheDocument();
  });

  it('zeigt JETZT-Label wenn now im Range', () => {
    const now = new Date();
    // Stop um now ± 2h → range deckt now ab
    const around: TimelineStop = {
      id: 's1',
      position: 1,
      shipment_number: 'S-now',
      stop_type: 'DELIVERY',
      planned_arrival: new Date(now.getTime() - 60 * 60_000).toISOString(),
      planned_departure: new Date(now.getTime() + 60 * 60_000).toISOString(),
    };
    render(<TourTimeline stops={[around]} />);
    expect(screen.getByText('JETZT')).toBeInTheDocument();
  });

  it('Critical-Mode-Toggle erscheint wenn ≥1 critical', () => {
    render(
      <TourTimeline
        stops={[
          baseStop('s1', 10, 'ok'),
          baseStop('s2', 12, 'critical'),
        ]}
      />,
    );
    // auto-on → Btn "Alle zeigen"
    expect(screen.getByText('Alle zeigen')).toBeInTheDocument();
  });

  it('Toggle wechselt Label Fokus ↔ Alle zeigen', () => {
    render(
      <TourTimeline
        stops={[baseStop('s1', 10, 'ok'), baseStop('s2', 12, 'critical')]}
      />,
    );
    const btn = screen.getByText('Alle zeigen');
    fireEvent.click(btn);
    expect(screen.getByText('Fokus')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Fokus'));
    expect(screen.getByText('Alle zeigen')).toBeInTheDocument();
  });

  it('Critical-Toggle nicht sichtbar wenn 0 critical', () => {
    render(<TourTimeline stops={[baseStop('s1', 10, 'ok')]} />);
    expect(screen.queryByText('Alle zeigen')).not.toBeInTheDocument();
    expect(screen.queryByText('Fokus')).not.toBeInTheDocument();
  });

  it('Count-Anzeige stimmt', () => {
    render(
      <TourTimeline
        stops={[
          baseStop('s1', 10, 'ok'),
          baseStop('s2', 12, 'critical'),
          baseStop('s3', 14, 'warning'),
          baseStop('s4', 16, 'critical'),
        ]}
      />,
    );
    expect(screen.getByText(/2 kritisch · 1 Warnung/)).toBeInTheDocument();
  });
});

/**
 * B' Sprint Render-Test TourAggregateStrip.
 * Verifiziert: 4-Kachel-Rendering, fmtKg-Tonne-Schwelle,
 * fmtKm/fmtEur null → "—", Schedule-Hint-Row mit Stamm-Wochentage.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TourAggregateStrip from './TourAggregateStrip';

describe('TourAggregateStrip', () => {
  it('rendert 4 Kacheln (Sendungen, Gewicht, km, Kosten)', () => {
    render(
      <TourAggregateStrip
        aggregates={{
          shipmentCount: 5,
          weightKgSum: 1234,
          kmTotal: 87,
          euroTotal: 245,
        }}
      />,
    );
    expect(screen.getByText('Sendg.')).toBeInTheDocument();
    expect(screen.getByText('Gewicht')).toBeInTheDocument();
    expect(screen.getByText('km')).toBeInTheDocument();
    expect(screen.getByText('Kosten')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('245')).toBeInTheDocument();
  });

  it('fmtKg: >=1000 → "1.2t" Schwelle', () => {
    render(
      <TourAggregateStrip
        aggregates={{
          shipmentCount: 0,
          weightKgSum: 1234,
          kmTotal: null,
          euroTotal: null,
        }}
      />,
    );
    expect(screen.getByText('1.2t')).toBeInTheDocument();
  });

  it('null-Werte → "—"', () => {
    render(
      <TourAggregateStrip
        aggregates={{
          shipmentCount: 0,
          weightKgSum: 0,
          kmTotal: null,
          euroTotal: null,
        }}
      />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('zeigt Schedule-Hint mit Stamm-Wochentagen (MO→SO sortiert)', () => {
    render(
      <TourAggregateStrip
        aggregates={{
          shipmentCount: 0,
          weightKgSum: 0,
          kmTotal: null,
          euroTotal: null,
        }}
        stammSchedule={['FR', 'MO', 'MI']}
      />,
    );
    expect(screen.getByText(/Schedule:\s*MO,MI,FR/)).toBeInTheDocument();
  });

  it('zeigt dateLabel wenn gesetzt', () => {
    render(
      <TourAggregateStrip
        aggregates={{
          shipmentCount: 0,
          weightKgSum: 0,
          kmTotal: null,
          euroTotal: null,
        }}
        dateLabel="Mittwoch · 2026-05-20"
      />,
    );
    expect(screen.getByText('Mittwoch · 2026-05-20')).toBeInTheDocument();
  });

  it('keine Hint-Row ohne Schedule oder dateLabel', () => {
    render(
      <TourAggregateStrip
        aggregates={{
          shipmentCount: 0,
          weightKgSum: 0,
          kmTotal: null,
          euroTotal: null,
        }}
      />,
    );
    expect(screen.queryByText(/Schedule:/)).not.toBeInTheDocument();
  });
});

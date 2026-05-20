/**
 * W-3.2.D Render-Test FilterBar.
 *
 * Verifiziert:
 *   - mode='nv' rendert Pickup/Delivery-Toggle + Status-Buttons
 *   - mode='fv' versteckt NV-spezifische Buttons
 *   - Sort-Toggle-Click schreibt workspace.filter.sort
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithWorkspace } from '../../test/workspace-test-utils';
import FilterBar from './FilterBar';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});

describe('FilterBar (NV mode)', () => {
  it('rendert Pickup + Delivery + Status-Buttons', () => {
    renderWithWorkspace(<FilterBar />, {
      initialEntries: ['/workspace?mode=nv'],
    });
    expect(screen.getByText('Abholung')).toBeInTheDocument();
    expect(screen.getByText('Zustellung')).toBeInTheDocument();
    expect(screen.getByText('Geplant')).toBeInTheDocument();
    expect(screen.getByText('In Fahrt')).toBeInTheDocument();
    expect(screen.getByText('Fertig')).toBeInTheDocument();
  });

  it('Sort-Buttons sind im NV-Mode da (title-selector)', () => {
    renderWithWorkspace(<FilterBar />, {
      initialEntries: ['/workspace?mode=nv'],
    });
    expect(screen.getByTitle('Sort: Auto')).toBeInTheDocument();
    expect(screen.getByTitle('Sort: Datum')).toBeInTheDocument();
    expect(screen.getByTitle('Sort: Land')).toBeInTheDocument();
  });

  it('Click auf Datum-Sort persistiert in workspace.filter', () => {
    renderWithWorkspace(<FilterBar />, {
      initialEntries: ['/workspace?mode=nv'],
    });
    fireEvent.click(screen.getByTitle('Sort: Datum'));
    const stored = localStorage.getItem('tms.workspace.filter');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.sort).toBe('date');
  });

  it('Click Zustellung schaltet filter.pickupMode auf DELIVERY', () => {
    renderWithWorkspace(<FilterBar />, {
      initialEntries: ['/workspace?mode=nv'],
    });
    fireEvent.click(screen.getByText('Zustellung'));
    const stored = JSON.parse(
      localStorage.getItem('tms.workspace.filter') ?? '{}',
    );
    expect(stored.pickupMode).toBe('DELIVERY');
  });
});

describe('FilterBar (FV mode)', () => {
  it('blendet NV-spezifische Buttons aus', () => {
    renderWithWorkspace(<FilterBar />, {
      initialEntries: ['/workspace?mode=fv'],
    });
    expect(screen.queryByText('Abholung')).not.toBeInTheDocument();
    expect(screen.queryByText('Zustellung')).not.toBeInTheDocument();
    expect(screen.queryByText('Geplant')).not.toBeInTheDocument();
  });

  it('Sort-Toggle bleibt aktiv (title-selector)', () => {
    renderWithWorkspace(<FilterBar />, {
      initialEntries: ['/workspace?mode=fv'],
    });
    expect(screen.getByTitle('Sort: Auto')).toBeInTheDocument();
    expect(screen.getByTitle('Sort: Land')).toBeInTheDocument();
  });
});

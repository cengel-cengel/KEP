/**
 * Sprint C: StopStatusBadge + DE-Mapper Tests.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StopStatusBadge, {
  stopStatusMeta,
  STOP_STATUS_UI_OPTIONS,
} from './StopStatusBadge';

describe('stopStatusMeta', () => {
  it('PLANNED → Offen / gray-400', () => {
    const m = stopStatusMeta('PLANNED');
    expect(m.label).toBe('Offen');
    expect(m.dotClass).toContain('gray-400');
  });
  it('EN_ROUTE → Unterwegs / blue-500', () => {
    const m = stopStatusMeta('EN_ROUTE');
    expect(m.label).toBe('Unterwegs');
    expect(m.dotClass).toContain('blue-500');
  });
  it('ARRIVED → Angekommen / amber-500', () => {
    expect(stopStatusMeta('ARRIVED').label).toBe('Angekommen');
    expect(stopStatusMeta('ARRIVED').dotClass).toContain('amber-500');
  });
  it('COMPLETED → Abgeschlossen / green-500', () => {
    expect(stopStatusMeta('COMPLETED').label).toBe('Abgeschlossen');
    expect(stopStatusMeta('COMPLETED').dotClass).toContain('green-500');
  });
  it('FAILED → Ausgefallen / red-500', () => {
    expect(stopStatusMeta('FAILED').label).toBe('Ausgefallen');
    expect(stopStatusMeta('FAILED').dotClass).toContain('red-500');
  });
  it('Unknown / null → Fallback Offen', () => {
    expect(stopStatusMeta(null).label).toBe('Offen');
    expect(stopStatusMeta('XYZ').label).toBe('Offen');
  });
});

describe('STOP_STATUS_UI_OPTIONS', () => {
  it('5 Optionen, ohne SKIPPED-Legacy', () => {
    expect(STOP_STATUS_UI_OPTIONS).toEqual([
      'PLANNED',
      'EN_ROUTE',
      'ARRIVED',
      'COMPLETED',
      'FAILED',
    ]);
  });
});

describe('StopStatusBadge render', () => {
  it('non-compact: Label sichtbar', () => {
    render(<StopStatusBadge status="EN_ROUTE" />);
    expect(screen.getByText('Unterwegs')).toBeInTheDocument();
  });
  it('compact: nur Dot, kein Text', () => {
    render(<StopStatusBadge status="EN_ROUTE" compact />);
    expect(screen.queryByText('Unterwegs')).not.toBeInTheDocument();
  });
});

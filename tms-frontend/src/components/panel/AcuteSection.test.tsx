/**
 * S-3 Render-Test AcuteSection.
 * Verifiziert: Empty-State, max-3-Limit, Expand-Link, primaryAction-Click,
 * sortAcuteItems-Helper Ordering.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AcuteSection, {
  sortAcuteItems,
  type AcuteItem,
} from './AcuteSection';

const mkItem = (
  id: string,
  severity: AcuteItem['severity'],
  label: string,
  opts: Partial<AcuteItem> = {},
): AcuteItem => ({
  id,
  severity,
  icon: 'alert',
  label,
  ...opts,
});

describe('AcuteSection', () => {
  it('rendert nichts wenn items leer', () => {
    const { container } = render(<AcuteSection items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rendert Heading wenn items vorhanden', () => {
    render(<AcuteSection items={[mkItem('a', 'L1', 'Overload')]} />);
    expect(screen.getByText('Was ist akut?')).toBeInTheDocument();
    expect(screen.getByText('Overload')).toBeInTheDocument();
  });

  it('zeigt max 3 Items default + "+ N weitere" wenn mehr', () => {
    const items = [
      mkItem('1', 'L1', 'Item-1'),
      mkItem('2', 'L1', 'Item-2'),
      mkItem('3', 'L2', 'Item-3'),
      mkItem('4', 'L2', 'Item-4'),
      mkItem('5', 'L3', 'Item-5'),
    ];
    render(<AcuteSection items={items} />);
    expect(screen.getByText('Item-1')).toBeInTheDocument();
    expect(screen.getByText('Item-2')).toBeInTheDocument();
    expect(screen.getByText('Item-3')).toBeInTheDocument();
    expect(screen.queryByText('Item-4')).not.toBeInTheDocument();
    expect(screen.getByText('+ 2 weitere')).toBeInTheDocument();
  });

  it('primaryAction Click triggert onClick', () => {
    const onClick = vi.fn();
    const items = [
      mkItem('a', 'L1', 'Conflict', {
        primaryAction: { label: 'Splitten', onClick },
      }),
    ];
    render(<AcuteSection items={items} />);
    fireEvent.click(screen.getByText('Splitten'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('custom title-Prop überschreibt Default', () => {
    render(
      <AcuteSection
        items={[mkItem('a', 'L1', 'X')]}
        title="Tour-Probleme"
      />,
    );
    expect(screen.getByText('Tour-Probleme')).toBeInTheDocument();
  });

  it('Expand-Button toggled "weniger anzeigen"', () => {
    const items = [
      mkItem('1', 'L1', 'A'),
      mkItem('2', 'L1', 'B'),
      mkItem('3', 'L1', 'C'),
      mkItem('4', 'L2', 'D'),
    ];
    render(<AcuteSection items={items} />);
    const btn = screen.getByText('+ 1 weitere');
    fireEvent.click(btn);
    expect(screen.getByText('weniger anzeigen')).toBeInTheDocument();
  });

  it('hint wird als Sub-Text gerendert', () => {
    render(
      <AcuteSection
        items={[mkItem('a', 'L2', 'Tour-Stop', { hint: 'knapper Puffer' })]}
      />,
    );
    expect(screen.getByText('knapper Puffer')).toBeInTheDocument();
  });
});

describe('sortAcuteItems', () => {
  it('sortiert L1 > L2 > L3', () => {
    const items = [
      mkItem('a', 'L3', 'low'),
      mkItem('b', 'L1', 'high'),
      mkItem('c', 'L2', 'mid'),
    ];
    const sorted = sortAcuteItems(items);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('filtert null-Severities raus', () => {
    const items = [
      mkItem('a', 'L1', 'a'),
      mkItem('b', null, 'b'),
      mkItem('c', 'L2', 'c'),
    ];
    const sorted = sortAcuteItems(items);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'c']);
  });
});

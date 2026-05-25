/**
 * S-4 Smoke fuer CustomTab (Float/Popout-Buttons im Tab-Strip).
 *
 * Was geprueft wird
 *  · Titel rendert.
 *  · Buttons existieren (versteckt-by-default ueber CSS-Opacity).
 *  · Float-Klick → containerApi.addFloatingGroup(group) feuert.
 *  · Popout-Klick → containerApi.addPopoutGroup(group) feuert.
 *  · Wenn Panel bereits 'floating' → nur Popout sichtbar.
 *  · Wenn Panel bereits 'popout' → keine Buttons sichtbar.
 *
 * Popout-End-to-End (echtes window.open mit Portal-Render) ist
 * headless schwer zu verifizieren — bleibt Carlos-Smoke. Hier
 * pruefen wir nur die API-Call-Bruecke.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CustomTab from './CustomTab';

type LocType = 'grid' | 'floating' | 'popout' | 'edge';

function makeProps(opts: {
  title?: string;
  id?: string;
  location?: LocType;
  addFloatingGroup?: ReturnType<typeof vi.fn>;
  addPopoutGroup?: ReturnType<typeof vi.fn>;
}) {
  // Minimal-Stubs — CustomTab nutzt nur die hier gemockten Felder.
  const group = { __markerGroup: true };
  const api = {
    id: opts.id ?? 'panel-test',
    title: opts.title ?? 'Test Panel',
    group: {
      ...group,
      api: { location: { type: opts.location ?? 'grid' } },
    },
  };
  const containerApi = {
    addFloatingGroup: opts.addFloatingGroup ?? vi.fn(),
    addPopoutGroup: opts.addPopoutGroup ?? vi.fn(),
  };
  // Cast bypasst die volle IDockviewPanelHeaderProps-Surface —
  // CustomTab konsumiert nur diese 2 Felder + tabLocation.
  return {
    api,
    containerApi,
    params: {},
    tabLocation: 'header' as const,
  } as unknown as Parameters<typeof CustomTab>[0];
}

describe('CustomTab', () => {
  it('rendert Panel-Titel', () => {
    render(<CustomTab {...makeProps({ title: 'Eingang' })} />);
    expect(screen.getByText('Eingang')).toBeInTheDocument();
  });

  it('grid: Float + Popout vorhanden', () => {
    render(<CustomTab {...makeProps({ location: 'grid' })} />);
    expect(screen.getByLabelText('Float')).toBeInTheDocument();
    expect(screen.getByLabelText('Popout')).toBeInTheDocument();
  });

  it('floating: nur Popout (Float unsichtbar, da schon erfuellt)', () => {
    render(<CustomTab {...makeProps({ location: 'floating' })} />);
    expect(screen.queryByLabelText('Float')).toBeNull();
    expect(screen.getByLabelText('Popout')).toBeInTheDocument();
  });

  it('popout: keine Buttons (bereits popped out)', () => {
    render(<CustomTab {...makeProps({ location: 'popout' })} />);
    expect(screen.queryByLabelText('Float')).toBeNull();
    expect(screen.queryByLabelText('Popout')).toBeNull();
  });

  it('Float-Klick → containerApi.addFloatingGroup(group)', () => {
    const addFloat = vi.fn();
    const props = makeProps({ addFloatingGroup: addFloat });
    render(<CustomTab {...props} />);
    fireEvent.click(screen.getByLabelText('Float'));
    expect(addFloat).toHaveBeenCalledTimes(1);
    // Argument muss das group-Objekt sein (props.api.group).
    expect(addFloat).toHaveBeenCalledWith(props.api.group);
  });

  it('Popout-Klick → containerApi.addPopoutGroup(group)', () => {
    const addPop = vi.fn();
    const props = makeProps({ addPopoutGroup: addPop });
    render(<CustomTab {...props} />);
    fireEvent.click(screen.getByLabelText('Popout'));
    expect(addPop).toHaveBeenCalledTimes(1);
    expect(addPop).toHaveBeenCalledWith(props.api.group);
  });
});

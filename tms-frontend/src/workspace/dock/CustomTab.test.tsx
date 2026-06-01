/**
 * S-4 + D1 Smoke fuer CustomTab (Popout-Button im Tab-Strip).
 *
 * Was geprueft wird
 *  · Titel rendert.
 *  · Popout-Button existiert (versteckt-by-default ueber CSS-Opacity).
 *  · Popout-Klick → containerApi.addPopoutGroup(group, options) feuert.
 *  · Float-Button NICHT mehr im DOM (D1: Float-Feature entfernt).
 *  · Wenn Panel bereits 'popout' → kein Button sichtbar.
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
    addPopoutGroup: opts.addPopoutGroup ?? vi.fn(),
  };
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

  it('grid: Popout vorhanden, KEIN Float (D1)', () => {
    render(<CustomTab {...makeProps({ location: 'grid' })} />);
    expect(screen.getByLabelText('Popout')).toBeInTheDocument();
    expect(screen.queryByLabelText('Float')).toBeNull();
  });

  it('floating: Popout sichtbar, kein Float (D1)', () => {
    // floating-Location entsteht live nicht mehr (disableFloatingGroups=
    // true), bleibt hier als Restore-Fall fuer Layout-Kompat.
    render(<CustomTab {...makeProps({ location: 'floating' })} />);
    expect(screen.getByLabelText('Popout')).toBeInTheDocument();
    expect(screen.queryByLabelText('Float')).toBeNull();
  });

  it('popout: kein Button (bereits popped out)', () => {
    render(<CustomTab {...makeProps({ location: 'popout' })} />);
    expect(screen.queryByLabelText('Popout')).toBeNull();
    expect(screen.queryByLabelText('Float')).toBeNull();
  });

  it('Popout-Klick → containerApi.addPopoutGroup(group, options)', () => {
    const addPop = vi.fn();
    const props = makeProps({ addPopoutGroup: addPop });
    render(<CustomTab {...props} />);
    fireEvent.click(screen.getByLabelText('Popout'));
    expect(addPop).toHaveBeenCalledTimes(1);
    // FIX B: zweites Argument = Popout-Options mit onDidOpen-Hook
    // fuer den Maximize-resize-Relay. group muss als 1. Arg uebergeben
    // werden; options-Shape pruefen wir grob (onDidOpen function).
    const [groupArg, optsArg] = addPop.mock.calls[0];
    expect(groupArg).toBe(props.api.group);
    expect(typeof optsArg?.onDidOpen).toBe('function');
  });
});

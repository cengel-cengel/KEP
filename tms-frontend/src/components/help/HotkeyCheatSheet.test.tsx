/**
 * S-2.2.y HotkeyCheatSheet Modal Tests.
 *
 * Verifiziert: ?-Toggle, Esc-close, Search-Filter, Group-Render.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HotkeyCheatSheet from './HotkeyCheatSheet';

describe('HotkeyCheatSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('default closed (kein Modal-DOM)', () => {
    render(<HotkeyCheatSheet />);
    expect(screen.queryByTestId('hotkey-cheatsheet')).not.toBeInTheDocument();
  });

  it('?-Key öffnet Modal', () => {
    render(<HotkeyCheatSheet />);
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByTestId('hotkey-cheatsheet')).toBeInTheDocument();
    expect(screen.getByText('Tastatur-Shortcuts')).toBeInTheDocument();
  });

  it('Esc schließt Modal', () => {
    render(<HotkeyCheatSheet />);
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByTestId('hotkey-cheatsheet')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('hotkey-cheatsheet')).not.toBeInTheDocument();
  });

  it('Search-Filter blendet nicht-Matches aus', () => {
    render(<HotkeyCheatSheet />);
    fireEvent.keyDown(window, { key: '?' });
    const input = screen.getByPlaceholderText('Filtern…');
    fireEvent.change(input, { target: { value: 'pin' } });
    // 'pin' kommt in 'Panel pin/unpin' vor
    expect(screen.getByText(/Panel pin\/unpin/)).toBeInTheDocument();
    // 'pin' kommt NICHT in 'nächster Stop' vor
    expect(screen.queryByText('nächster Stop')).not.toBeInTheDocument();
  });

  it('Filter ohne Treffer → "Keine Treffer"-Hint', () => {
    render(<HotkeyCheatSheet />);
    fireEvent.keyDown(window, { key: '?' });
    const input = screen.getByPlaceholderText('Filtern…');
    fireEvent.change(input, { target: { value: 'xyz-no-match' } });
    expect(screen.getByText('Keine Treffer.')).toBeInTheDocument();
  });

  it('?-Key skip wenn focus in INPUT', () => {
    render(
      <>
        <input data-testid="text-input" />
        <HotkeyCheatSheet />
      </>,
    );
    const input = screen.getByTestId('text-input');
    input.focus();
    fireEvent.keyDown(input, { key: '?' });
    expect(screen.queryByTestId('hotkey-cheatsheet')).not.toBeInTheDocument();
  });
});

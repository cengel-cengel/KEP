import { describe, it, expect } from 'vitest';
import { renderHook, act, fireEvent } from '@testing-library/react';
import { useInsertMode } from './useInsertMode';

describe('useInsertMode', () => {
  it('initial false', () => {
    const { result } = renderHook(() => useInsertMode());
    expect(result.current.active).toBe(false);
  });

  it('I-Hotkey toggle', () => {
    const { result } = renderHook(() => useInsertMode());
    act(() => {
      fireEvent.keyDown(window, { key: 'i' });
    });
    expect(result.current.active).toBe(true);
    act(() => {
      fireEvent.keyDown(window, { key: 'i' });
    });
    expect(result.current.active).toBe(false);
  });

  it('Capital "I" auch', () => {
    const { result } = renderHook(() => useInsertMode());
    act(() => {
      fireEvent.keyDown(window, { key: 'I' });
    });
    expect(result.current.active).toBe(true);
  });

  it('Esc cancel wenn aktiv', () => {
    const { result } = renderHook(() => useInsertMode());
    act(() => {
      fireEvent.keyDown(window, { key: 'i' });
    });
    expect(result.current.active).toBe(true);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(result.current.active).toBe(false);
  });

  it('toggle()-API funktioniert', () => {
    const { result } = renderHook(() => useInsertMode());
    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);
    act(() => result.current.cancel());
    expect(result.current.active).toBe(false);
  });

  it('I-Hotkey skip in INPUT', () => {
    const { result } = renderHook(() => useInsertMode());
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => {
      fireEvent.keyDown(input, { key: 'i' });
    });
    expect(result.current.active).toBe(false);
    document.body.removeChild(input);
  });
});

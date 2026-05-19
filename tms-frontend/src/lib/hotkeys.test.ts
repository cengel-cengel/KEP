import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { registerHotkey, registerHotkeys } from './hotkeys';

let listeners: Array<(e: KeyboardEvent) => void> = [];

beforeEach(() => {
  listeners = [];
  (globalThis as any).window = {
    addEventListener: (type: string, fn: any) => {
      if (type === 'keydown') listeners.push(fn);
    },
    removeEventListener: (type: string, fn: any) => {
      if (type === 'keydown') {
        listeners = listeners.filter((l) => l !== fn);
      }
    },
  };
});

afterEach(() => {
  listeners = [];
});

function fireEvent(opts: Partial<KeyboardEvent> & { key: string }) {
  const evt = {
    key: opts.key,
    metaKey: !!opts.metaKey,
    ctrlKey: !!opts.ctrlKey,
    altKey: !!opts.altKey,
    shiftKey: !!opts.shiftKey,
    target: opts.target ?? { tagName: 'DIV', isContentEditable: false },
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
  for (const l of listeners) l(evt);
  return evt;
}

describe('registerHotkey', () => {
  it('handler fires bei matched binding', () => {
    const h = vi.fn();
    registerHotkey('j', h);
    fireEvent({ key: 'j' });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('case-insensitive binding', () => {
    const h = vi.fn();
    registerHotkey('J', h);
    fireEvent({ key: 'j' });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('skip in input-elements default', () => {
    const h = vi.fn();
    registerHotkey('j', h);
    fireEvent({
      key: 'j',
      target: { tagName: 'INPUT', isContentEditable: false } as any,
    });
    expect(h).not.toHaveBeenCalled();
  });

  it('allowInInputs override', () => {
    const h = vi.fn();
    registerHotkey('j', h, { allowInInputs: true });
    fireEvent({
      key: 'j',
      target: { tagName: 'INPUT', isContentEditable: false } as any,
    });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('modifier ctrl+k', () => {
    const h = vi.fn();
    registerHotkey('ctrl+k', h);
    fireEvent({ key: 'k', ctrlKey: true });
    expect(h).toHaveBeenCalledTimes(1);
    // ohne Modifier → kein Trigger
    fireEvent({ key: 'k' });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('cmd → meta alias', () => {
    const h = vi.fn();
    registerHotkey('cmd+k', h);
    fireEvent({ key: 'k', metaKey: true });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('Arrow-Key normalization', () => {
    const h = vi.fn();
    registerHotkey('down', h);
    fireEvent({ key: 'ArrowDown' });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe entfernt listener', () => {
    const h = vi.fn();
    const unsub = registerHotkey('j', h);
    unsub();
    fireEvent({ key: 'j' });
    expect(h).not.toHaveBeenCalled();
  });

  it('registerHotkeys multi-binding', () => {
    const a = vi.fn();
    const b = vi.fn();
    registerHotkeys({ a, b });
    fireEvent({ key: 'a' });
    fireEvent({ key: 'b' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

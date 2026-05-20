/**
 * Sprint C: useLongPress Hook-Tests.
 * Verifiziert: Right-Click direkt, Touch-Hold 500ms, Cancel on Move>10px,
 *              Cancel on TouchEnd vor 500ms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLongPress } from './useLongPress';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const mkTouch = (x: number, y: number): React.TouchEvent => {
  return {
    touches: [{ clientX: x, clientY: y }] as unknown as React.TouchList,
    preventDefault: () => {},
  } as unknown as React.TouchEvent;
};

describe('useLongPress', () => {
  it('Right-Click feuert handler sofort mit preventDefault', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useLongPress(handler));
    const preventDefault = vi.fn();
    act(() => {
      result.current.onContextMenu({
        clientX: 100,
        clientY: 200,
        preventDefault,
      } as unknown as React.MouseEvent);
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(100, 200);
  });

  it('Touch-Hold 500ms → handler', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useLongPress(handler, 500));
    act(() => {
      result.current.onTouchStart(mkTouch(50, 60));
    });
    expect(handler).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(handler).toHaveBeenCalledWith(50, 60);
  });

  it('Touch-End vor 500ms → cancel', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useLongPress(handler, 500));
    act(() => {
      result.current.onTouchStart(mkTouch(0, 0));
    });
    act(() => {
      vi.advanceTimersByTime(200);
      result.current.onTouchEnd(mkTouch(0, 0));
      vi.advanceTimersByTime(500);
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('Touch-Move >10px → cancel', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useLongPress(handler, 500));
    act(() => {
      result.current.onTouchStart(mkTouch(0, 0));
    });
    act(() => {
      result.current.onTouchMove(mkTouch(20, 0));
      vi.advanceTimersByTime(500);
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('Touch-Move <10px → handler still feuert', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useLongPress(handler, 500));
    act(() => {
      result.current.onTouchStart(mkTouch(0, 0));
    });
    act(() => {
      result.current.onTouchMove(mkTouch(5, 5));
      vi.advanceTimersByTime(500);
    });
    expect(handler).toHaveBeenCalledWith(0, 0);
  });

  it('Custom ms override', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useLongPress(handler, 1000));
    act(() => {
      result.current.onTouchStart(mkTouch(0, 0));
    });
    act(() => vi.advanceTimersByTime(500));
    expect(handler).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(handler).toHaveBeenCalled();
  });
});

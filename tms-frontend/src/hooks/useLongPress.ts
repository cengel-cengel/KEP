/**
 * Sprint C: useLongPress — universal Long-Press + Right-Click Handler.
 *
 * Touch (Mobile): hold 500ms (default) ohne >10px-Move-Cancel
 *                 → handler(x, y) mit clientX/Y des Touch-Start
 * Desktop:        Right-Click (contextmenu) → handler(x, y)
 *
 * Verbraucht: spread auf das Target-Element (z.B. <button {...lp}>).
 *
 * Return-Type ist als React-Event-Props gemodelliert (TouchEvent +
 * MouseEvent) — direkt auf jedes DOM-Element ge-spread-bar.
 */
import { useCallback, useEffect, useRef } from 'react';

export interface LongPressBindings {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const DEFAULT_MS = 500;
const MOVE_THRESHOLD_PX = 10;

export function useLongPress(
  handler: (x: number, y: number) => void,
  ms: number = DEFAULT_MS,
): LongPressBindings {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  // Cleanup on unmount.
  useEffect(() => clear, [clear]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const x = t.clientX;
      const y = t.clientY;
      startRef.current = { x, y };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        handler(x, y);
      }, ms);
    },
    [handler, ms],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      const s = startRef.current;
      if (!t || !s) return;
      const dx = Math.abs(t.clientX - s.x);
      const dy = Math.abs(t.clientY - s.y);
      if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) clear();
    },
    [clear],
  );

  const onTouchEnd = useCallback(
    (_e: React.TouchEvent) => {
      clear();
    },
    [clear],
  );

  const onTouchCancel = useCallback(
    (_e: React.TouchEvent) => {
      clear();
    },
    [clear],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handler(e.clientX, e.clientY);
    },
    [handler],
  );

  return {
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onTouchCancel,
    onContextMenu,
  };
}

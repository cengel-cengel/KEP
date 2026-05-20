/**
 * B-2 useInsertMode Hook.
 *
 * - 'I' (oder 'i') Hotkey: Toggle Insert-Mode (skip wenn focus
 *   in INPUT/TEXTAREA/contenteditable).
 * - 'Esc': Cancel Insert-Mode (deaktiviert nur wenn aktiv).
 * - Page-local State — kein global Singleton.
 *
 * Returns: { active, cancel, toggle }.
 */
import { useCallback, useEffect, useState } from 'react';

export function useInsertMode(): {
  active: boolean;
  cancel: () => void;
  toggle: () => void;
} {
  const [active, setActive] = useState(false);

  const cancel = useCallback(() => setActive(false), []);
  const toggle = useCallback(() => setActive((v) => !v), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (e.target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setActive((v) => !v);
        return;
      }
      if (e.key === 'Escape' && active) {
        e.preventDefault();
        setActive(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  return { active, cancel, toggle };
}

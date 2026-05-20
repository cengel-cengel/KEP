/**
 * B-1 ContextMenu — Leichtgewichtiges Right-Click-Menu.
 *
 * Position: absolute über Viewport (clientX/clientY).
 * Auto-close: Click outside, Esc, Item-Click.
 *
 * Verwendet von LoadingPlan3D mesh-Right-Click.
 */
import { useEffect, useRef, type ReactNode } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  /** Lucide-Icon-React-Node (klein, z.B. <Trash2 size={12} />). */
  icon?: ReactNode;
  /** Rote Variante für destruktive Actions. */
  danger?: boolean;
  /** Disabled-State. */
  disabled?: boolean;
  /** Optional Separator NACH diesem Item. */
  separator?: boolean;
}

export interface ContextMenuProps {
  /** Viewport-Coordinates (clientX/clientY) — Menu positioniert
   *  sich rechts/unten von x/y, ggf. flipped wenn knapp am Rand. */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 200;
const MENU_ITEM_H = 28;

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Click-outside + Esc-close.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Listener async-anhängen (sonst feuert das mousedown das
    // den Menu öffnet selbst).
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Edge-Flip: wenn Menu rechts/unten überlappt, nach links/oben.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const menuHeight = items.length * MENU_ITEM_H + 8;
  const left = x + MENU_WIDTH > vw ? x - MENU_WIDTH : x;
  const top = y + menuHeight > vh ? y - menuHeight : y;

  return (
    <div
      ref={ref}
      className="fixed z-[9999] bg-white border border-gray-300 rounded shadow-lg py-1"
      style={{ left, top, width: MENU_WIDTH }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`}>
          <button
            type="button"
            onClick={() => {
              if (it.disabled) return;
              it.onClick();
              onClose();
            }}
            disabled={it.disabled}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
              it.disabled
                ? 'opacity-50 cursor-not-allowed'
                : it.danger
                  ? 'text-red-700 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-blue-50'
            }`}
          >
            {it.icon}
            {it.label}
          </button>
          {it.separator && <div className="border-t border-gray-200 my-1" />}
        </div>
      ))}
    </div>
  );
}

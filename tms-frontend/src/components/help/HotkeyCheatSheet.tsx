/**
 * S-2.2.y HotkeyCheatSheet Modal.
 *
 * Trigger: '?' Key (oder Cmd+? / Ctrl+?). ESC closes.
 *
 * Listet HOTKEYS_DOC gruppiert nach scope mit Search-Filter.
 * Global mount in App.tsx (oder vergleichbar). Self-contained
 * Modal-State.
 */
import { useEffect, useMemo, useState } from 'react';
import { X, Keyboard } from 'lucide-react';
import { HOTKEYS_DOC } from '../../lib/hotkeys';

export default function HotkeyCheatSheet() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Global '?'-Trigger (skip wenn focus in input/textarea/contenteditable).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '?') return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (e.target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setOpen((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Esc → close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? HOTKEYS_DOC.filter(
          (h) =>
            h.keys.toLowerCase().includes(q) ||
            h.desc.toLowerCase().includes(q) ||
            h.scope.toLowerCase().includes(q),
        )
      : HOTKEYS_DOC;
    const map = new Map<string, typeof HOTKEYS_DOC>();
    for (const h of filtered) {
      const arr = map.get(h.scope) ?? [];
      arr.push(h);
      map.set(h.scope, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="Hotkey-Übersicht"
      data-testid="hotkey-cheatsheet"
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="font-semibold text-sm inline-flex items-center gap-2">
            <Keyboard size={14} />
            Tastatur-Shortcuts
          </h3>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-500 hover:text-gray-800"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-3 border-b">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtern…"
            className="w-full text-xs px-2 py-1 border border-gray-300 rounded"
          />
        </div>
        <div className="overflow-y-auto p-3 space-y-3 text-xs">
          {grouped.length === 0 && (
            <div className="text-gray-500 italic">Keine Treffer.</div>
          )}
          {grouped.map(([scope, items]) => (
            <section key={scope}>
              <h4 className="text-[10px] uppercase font-semibold text-gray-500 border-b border-gray-200 pb-0.5 mb-1">
                {scope}
              </h4>
              <table className="w-full">
                <tbody>
                  {items.map((h, i) => (
                    <tr key={`${scope}-${i}`} className="hover:bg-gray-50">
                      <td className="font-mono text-blue-700 py-0.5 pr-2 whitespace-nowrap">
                        {h.keys}
                      </td>
                      <td className="text-gray-700 py-0.5">{h.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        <div className="border-t px-3 py-1.5 text-[10px] text-gray-400">
          <kbd className="font-mono bg-gray-100 px-1 rounded">?</kbd> öffnet/schließt diese Übersicht ·{' '}
          <kbd className="font-mono bg-gray-100 px-1 rounded">Esc</kbd> schließt
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { registerHotkey } from '../lib/hotkeys';

/**
 * W-3 Command Palette.
 *
 * Trigger: Cmd+K (Mac) / Ctrl+K (Win).
 * Modal-overlay, fuzzy search (subsequence-match) + keyboard nav.
 *
 * Commands:
 *  - Navigation (Dashboard/Workspace/Stammdaten/etc.)
 *  - Modus-Switch (NV/FV)
 *
 * S-3b-2 Cleanup: dynamische "Ansicht: …"-Commands aus der alten
 * localStorage-Liste sind entfernt. Benannte Layouts werden jetzt
 * im "Ansichten"-Dropdown der WorkspaceTopBar verwaltet (Backend,
 * pro Modus). Kein Cmd+K-Pfad dorthin noetig, weil Mode-Switch
 * + URL-Navigate die Workspace-Auswahl bereits abdeckt.
 */

interface Command {
  id: string;
  label: string;
  hint?: string;
  category: 'Navigation' | 'Modus' | 'Aktion';
  run: () => void;
}

/** Subsequence-Match: chars in needle appear in order in haystack. */
function fuzzyMatch(needle: string, haystack: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i++;
    if (i === n.length) return true;
  }
  return false;
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd+K / Ctrl+K global toggle
  useEffect(() => {
    const unsubs = [
      registerHotkey('meta+k', () => setOpen((o) => !o), {
        allowInInputs: true,
      }),
      registerHotkey('ctrl+k', () => setOpen((o) => !o), {
        allowInInputs: true,
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Commands (statisch + dynamisch)
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      {
        id: 'nav.dashboard',
        label: 'Dashboard',
        category: 'Navigation',
        run: () => navigate('/'),
      },
      {
        id: 'nav.workspace',
        label: 'Workspace (Disposition)',
        category: 'Navigation',
        run: () => navigate('/workspace'),
      },
      {
        id: 'nav.shipments',
        label: 'Sendungen',
        category: 'Navigation',
        run: () => navigate('/shipments'),
      },
      {
        id: 'nav.shipment.new',
        label: 'Neue Sendung erfassen',
        category: 'Aktion',
        run: () => navigate('/shipments/new'),
      },
      {
        id: 'nav.tours',
        label: 'Touren-Archiv',
        category: 'Navigation',
        run: () => navigate('/tours'),
      },
      {
        id: 'nav.clearance',
        label: 'Abfertigung',
        category: 'Navigation',
        run: () => navigate('/clearance'),
      },
      {
        id: 'nav.hall',
        label: 'Halle',
        category: 'Navigation',
        run: () => navigate('/hall'),
      },
      {
        id: 'nav.invoices',
        label: 'Faktura',
        category: 'Navigation',
        run: () => navigate('/invoices'),
      },
      {
        id: 'nav.masterdata',
        label: 'Stammdaten',
        category: 'Navigation',
        run: () => navigate('/masterdata'),
      },
      {
        id: 'mode.nv',
        label: 'NV-Modus aktivieren',
        category: 'Modus',
        run: () => navigate('/workspace?mode=nv'),
      },
      {
        id: 'mode.fv',
        label: 'FV-Modus aktivieren',
        category: 'Modus',
        run: () => navigate('/workspace?mode=fv'),
      },
    ];
    return cmds;
  }, [navigate]);

  const filtered = useMemo(
    () => commands.filter((c) => fuzzyMatch(query, c.label + ' ' + c.category)),
    [commands, query],
  );

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  if (!open) return null;

  const execute = (idx: number) => {
    const c = filtered[idx];
    if (!c) return;
    c.run();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/30 flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-2xl w-full max-w-xl border border-gray-200 overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Search size={14} className="text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Befehl suchen…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(filtered.length - 1, h + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(0, h - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                execute(highlight);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
              }
            }}
            className="flex-1 outline-none text-sm"
          />
          <kbd className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
            Esc
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">
              Keine Treffer
            </div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                onClick={() => execute(i)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full flex items-center px-3 py-1.5 text-sm text-left ${
                  i === highlight
                    ? 'bg-blue-50 text-blue-900'
                    : 'text-gray-800 hover:bg-gray-50'
                }`}
              >
                <span className="flex-1">{c.label}</span>
                <span className="text-[10px] text-gray-400">
                  {c.hint ?? c.category}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

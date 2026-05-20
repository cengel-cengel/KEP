/**
 * W-2: Minimaler Hotkey-Layer ohne external library.
 *
 * Use:
 *   useEffect(() => {
 *     return registerHotkey('j', () => next(), { scope: 'panel' });
 *   }, []);
 *
 * Skip-in-Input: wenn aktives Element INPUT/TEXTAREA/SELECT
 * oder contenteditable → Hotkey wird übersprungen (außer
 * opts.allowInInputs).
 *
 * Modifier-Keys: 'cmd+k' / 'ctrl+k' / 'shift+/'
 */

export interface HotkeyOpts {
  /** scope für Future-Use (jetzt global). */
  scope?: 'global' | 'panel' | 'timeline';
  /** Default false — Hotkey wird in Inputs ignoriert. */
  allowInInputs?: boolean;
  /** preventDefault (default true). */
  preventDefault?: boolean;
}

function isEditableElement(el: EventTarget | null): boolean {
  // Duck-type check (kein instanceof, Node-test-env-safe).
  if (!el) return false;
  const tag = (el as { tagName?: string }).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as { isContentEditable?: boolean }).isContentEditable) return true;
  return false;
}

function normalizeBinding(raw: string): string {
  // 'Cmd+K' → 'meta+k' etc.
  return raw
    .toLowerCase()
    .replace(/\bcmd\b/, 'meta')
    .replace(/\bcontrol\b/, 'ctrl')
    .split('+')
    .map((s) => s.trim())
    .sort()
    .join('+');
}

function eventBinding(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push('meta');
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  let key = e.key;
  // Special-case arrows
  if (key === 'ArrowUp') key = 'up';
  else if (key === 'ArrowDown') key = 'down';
  else if (key === 'ArrowLeft') key = 'left';
  else if (key === 'ArrowRight') key = 'right';
  else key = key.toLowerCase();
  parts.push(key);
  return parts.sort().join('+');
}

export function registerHotkey(
  binding: string,
  handler: (e: KeyboardEvent) => void,
  opts: HotkeyOpts = {},
): () => void {
  const target = normalizeBinding(binding);
  const fn = (e: KeyboardEvent) => {
    if (!opts.allowInInputs && isEditableElement(e.target)) return;
    if (eventBinding(e) !== target) return;
    if (opts.preventDefault !== false) e.preventDefault();
    handler(e);
  };
  window.addEventListener('keydown', fn);
  return () => window.removeEventListener('keydown', fn);
}

/** Multi-binding-Helper. */
export function registerHotkeys(
  map: Record<string, (e: KeyboardEvent) => void>,
  opts: HotkeyOpts = {},
): () => void {
  const unsubs = Object.entries(map).map(([k, h]) =>
    registerHotkey(k, h, opts),
  );
  return () => unsubs.forEach((u) => u());
}

/** Cheat-Sheet (visible via Cmd+? oder ?, future Sprint). */
export const HOTKEYS_DOC: Array<{ keys: string; desc: string; scope: string }> =
  [
    // Global
    { keys: 'Cmd+K / Ctrl+K', desc: 'Command-Palette', scope: 'global' },
    { keys: 'Esc', desc: 'Selection in Queue/Board clearen', scope: 'queue' },
    { keys: 'Space', desc: 'Selection-Toggle (S-2.2)', scope: 'queue' },
    { keys: 'Cmd/Ctrl+Click', desc: 'Multi-Select Toggle', scope: 'queue' },
    { keys: 'Shift+Click', desc: 'Range-Select (Shift-Range)', scope: 'queue' },
    // Panel
    { keys: 'Esc', desc: 'Panel schließen', scope: 'panel' },
    { keys: 'p', desc: 'Panel pin/unpin', scope: 'panel' },
    { keys: '1 / 2 / 3', desc: 'Sub-Tab Stopps/Stoppliste/Sendungsliste (NV)', scope: 'panel' },
    { keys: '1 / 2', desc: 'Sub-Tab Stops/Tabelle (FV — B\'-2)', scope: 'panel' },
    // Timeline
    { keys: 'j / ↓', desc: 'nächster Stop', scope: 'timeline' },
    { keys: 'k / ↑', desc: 'vorheriger Stop', scope: 'timeline' },
    { keys: 'Enter', desc: 'Sendung öffnen', scope: 'timeline' },
    // LoadingPlan
    { keys: 'r / R', desc: '90°-Rotation während Box-Drag', scope: 'loadingplan' },
    // Stop-Context
    { keys: 'Rechtsklick / Long-Press', desc: 'Stop-ContextMenu (Sprint C)', scope: 'panel' },
  ];

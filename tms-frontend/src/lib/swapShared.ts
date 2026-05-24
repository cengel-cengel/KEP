/**
 * Shared, pure Helfer fuer Swap-Optimizer-Modals (NV + FV).
 *
 * Diese Datei ist React-frei — Typen + reine Functions, damit der
 * Pure-Test-Pfad ohne jsdom laeuft (mirror lib/loadingShared.ts).
 *
 * JSX-Pendants (ExecStatusIcon, CapacityBar) liegen in
 * components/shared/SwapModalBits.tsx.
 *
 * Modal-lokal BLEIBEN: Adapter, Endpoints, useQuery, Capacity-
 * Resolve, isFixSendung-Optionen, Cache-Invalidate-Keys, fixReason
 * + fixListSummary (semantisch divergent zwischen NV+FV).
 */

/**
 * Subset des /tours/best-match-Response, das Swap-Modals brauchen.
 * Reicht zum Label-Rendering + Score-Tooltip.
 */
export interface BestTourMatch {
  tour_id: string;
  mode: 'nv' | 'fv';
  tour_number?: string | null;
  score: number;
  reason?: string;
  datum?: string | null;
  subunternehmer_name?: string | null;
  stops_count?: number | null;
  last_stop_city?: string | null;
}

/**
 * F2.2.b-2 / F2.3.b-2: Per-Eject-Status waehrend Swap-Execute.
 *
 *   idle           noch nicht ausgefuehrt
 *   no-target      kein Best-Match — skip
 *   not-in-source  Sendung nicht (mehr) in Quelle — skip
 *   running        Source-Remove oder Target-Add laeuft
 *   ok             Source-Remove + Target-Add erfolgreich
 *   source-fail    Source-Remove fail — Sendung bleibt in Quelle
 *   rollback       Target-Add fail, Source-Re-Add ok
 *   limbo          Target-Add UND Rollback fail — manuell beheben
 */
export type EjectExecutionStatus =
  | 'idle'
  | 'no-target'
  | 'not-in-source'
  | 'running'
  | 'ok'
  | 'source-fail'
  | 'rollback'
  | 'limbo';

/** Anzeige-Label der Ziel-Tour (Tour-Nr > Sub-Name > ID-Kurzform). */
export function targetLabel(m: BestTourMatch): string {
  if (m.tour_number) return m.tour_number;
  if (m.subunternehmer_name) return m.subunternehmer_name;
  return m.tour_id.slice(0, 8);
}

/** ISO-Datum (YYYY-MM-DD oder voller ISO) → "DD.MM.". */
export function formatDatumShort(iso?: string | null): string | null {
  if (!iso) return null;
  const d = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const parts = d.split('-');
  if (parts.length !== 3) return null;
  return `${parts[2]}.${parts[1]}.`;
}

/**
 * Footer-Live-Counter waehrend Execute. Zaehlt alle Ejects mit
 * State !== 'idle' && !== 'running' als "done". Format "X/Y".
 */
export function countRunning(
  status: Map<string, EjectExecutionStatus>,
  total: number,
): string {
  let done = 0;
  for (const v of status.values()) {
    if (v !== 'running' && v !== 'idle') done += 1;
  }
  return `${done}/${total}`;
}

/**
 * Done-Banner-Summary "✓ N verschoben · ↻ N rollback · ⚠ N im Limbo
 *  · ✗ N übersprungen". skip = no-target | not-in-source | source-fail.
 */
export function execSummary(
  status: Map<string, EjectExecutionStatus>,
): string {
  let ok = 0;
  let rollback = 0;
  let limbo = 0;
  let skip = 0;
  for (const v of status.values()) {
    if (v === 'ok') ok += 1;
    else if (v === 'rollback') rollback += 1;
    else if (v === 'limbo') limbo += 1;
    else if (
      v === 'no-target' ||
      v === 'not-in-source' ||
      v === 'source-fail'
    )
      skip += 1;
  }
  const parts: string[] = [];
  if (ok > 0) parts.push(`✓ ${ok} verschoben`);
  if (rollback > 0) parts.push(`↻ ${rollback} rollback`);
  if (limbo > 0) parts.push(`⚠ ${limbo} im Limbo`);
  if (skip > 0) parts.push(`✗ ${skip} übersprungen`);
  return parts.length > 0 ? parts.join(' · ') : 'Keine Aktion.';
}

/**
 * Shared JSX-Bits fuer Swap-Optimizer-Modals (NV + FV).
 *
 * Pure-Pendants (Typen, Pure-Funktionen) liegen in lib/swapShared.ts.
 */
import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  BestTourMatch,
  EjectExecutionStatus,
} from '../../lib/swapShared';
import { targetLabel, formatDatumShort } from '../../lib/swapShared';

/**
 * F2.2.b-2 / F2.3.b-2: Per-Eject-Status-Icon. Klein + farbig, sitzt
 * rechts vom Alt-Tour-Label in der Eject-Liste.
 *
 * Akzeptiert auch `string`, weil die Modals den Status aus einer
 * Map<string,Status> lesen und Map.get einen `Status | undefined`
 * zurueckliefert (mit ??-Default 'idle' faellt das auf `idle`).
 */
export function ExecStatusIcon({
  status,
}: {
  status: EjectExecutionStatus | string;
}) {
  if (status === 'idle') return null;
  if (status === 'running') {
    return <Loader2 size={11} className="text-blue-600 animate-spin" />;
  }
  if (status === 'ok') {
    return <Check size={11} className="text-emerald-700" />;
  }
  if (status === 'pool') {
    return (
      <span title="In Dispotopf verschoben — Source-Remove ohne Target-Add">
        <ArrowDownToLine size={11} className="text-emerald-700" />
      </span>
    );
  }
  if (status === 'rollback') {
    return (
      <span title="Target-Add fehlgeschlagen, Source-Re-Add ok">
        <RotateCcw size={11} className="text-amber-700" />
      </span>
    );
  }
  if (status === 'limbo') {
    return (
      <span title="Target-Add UND Rollback fehlgeschlagen — Sendung manuell zuordnen!">
        <AlertTriangle size={11} className="text-red-700" />
      </span>
    );
  }
  if (status === 'source-fail') {
    return (
      <span title="Source-Remove fehlgeschlagen — Sendung blieb in Quelle">
        <AlertTriangle size={11} className="text-amber-700" />
      </span>
    );
  }
  if (status === 'not-in-source') {
    return (
      <span title="Sendung ist nicht (mehr) in der Source-Tour — uebersprungen">
        <X size={11} className="text-gray-500" />
      </span>
    );
  }
  if (status === 'no-target') {
    return (
      <span title="Keine Alt-Tour vorhanden — uebersprungen">
        <X size={11} className="text-gray-400" />
      </span>
    );
  }
  return null;
}

/**
 * Volumen/Gewicht-Balken in den Swap-Modals.
 *
 * Format: Label links, "value / max unit (pct%)" rechts. precision
 * steuert Nachkommastellen (default 2; 0 = locale-Round fuer kg).
 * pct > 100 rot, sonst emerald.
 */
export function CapacityBar({
  value,
  max,
  label,
  unit,
  precision = 2,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  /** Nachkommastellen (default 2). 0 fuer kg-Anzeige sinnvoll. */
  precision?: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const clamped = Math.min(100, Math.max(0, pct));
  const over = pct > 100;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span
          className={
            over ? 'font-mono font-semibold text-red-700' : 'font-mono'
          }
        >
          {precision === 0
            ? Math.round(value).toLocaleString('de-DE')
            : value.toFixed(precision)}{' '}
          /{' '}
          {precision === 0
            ? Math.round(max).toLocaleString('de-DE')
            : max.toFixed(precision)}{' '}
          {unit} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded overflow-hidden">
        <div
          className={`h-full ${over ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Phase 2: Eject-Ziel-Selektor pro Eject-Row.
 *
 * Drei Modi:
 *   · 'best'   Auto-Ziel = best-match-Vorschlag (BestTourMatch)
 *   · 'manual' explizit gewaehlte Tour aus der `tours`-Liste
 *   · 'pool'   Dispotopf — Source-Remove ohne Target-Add (Phase 1)
 *
 * Encoding ueber native <select>-value:
 *   '__best__' → kind='best'
 *   '__pool__' → kind='pool'
 *   UUID       → kind='manual', manualTourId=UUID
 *
 * tours-Liste wird vom Parent geliefert (NV-/FV-spezifisch gefiltert
 * + transformiert) — Selector kennt KEINE Mode-Logik. capacityHint
 * ist optional (FV-findAll liefert noch keinen overload — dort
 * einfach leer lassen).
 */
export interface TourOption {
  id: string;
  /** Anzeigbarer Tour-Name (z.B. "NV-T-42 (24.05.)"). */
  label: string;
  /** Optional kurzer Auslastungs-Trailer (z.B. "Vol 65%/Gew 80%"). */
  capacityHint?: string;
}

export type EjectTargetKind = 'best' | 'pool' | 'manual';

export interface EjectTargetSelectorValue {
  kind: EjectTargetKind;
  /** Nur relevant wenn kind='manual'. */
  manualTourId?: string | null;
}

export function EjectTargetSelector({
  value,
  bestMatch,
  bestMatchLoading,
  tours,
  disabled,
  onChange,
}: {
  value: EjectTargetSelectorValue;
  bestMatch?: BestTourMatch | null;
  bestMatchLoading?: boolean;
  tours: TourOption[];
  disabled?: boolean;
  onChange: (v: EjectTargetSelectorValue) => void;
}) {
  const selectValue =
    value.kind === 'best'
      ? '__best__'
      : value.kind === 'pool'
        ? '__pool__'
        : (value.manualTourId ?? '__best__');

  const bestLabel = bestMatchLoading
    ? 'Auto: lade…'
    : bestMatch
      ? `Auto: ${targetLabel(bestMatch)}${
          formatDatumShort(bestMatch.datum)
            ? ` (${formatDatumShort(bestMatch.datum)})`
            : ''
        }`
      : 'Auto: keine Alt-Tour';

  return (
    <select
      value={selectValue}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '__best__') {
          onChange({ kind: 'best', manualTourId: null });
        } else if (v === '__pool__') {
          onChange({ kind: 'pool', manualTourId: null });
        } else {
          onChange({ kind: 'manual', manualTourId: v });
        }
      }}
      className="text-[10px] px-1 py-0.5 border border-gray-300 rounded bg-white text-gray-700 disabled:opacity-60 max-w-[12rem]"
      title="Ziel der Sendung waehlen"
    >
      <option value="__best__">{bestLabel}</option>
      {tours.length > 0 && (
        <optgroup label="andere Tour">
          {tours.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {t.capacityHint ? ` · ${t.capacityHint}` : ''}
            </option>
          ))}
        </optgroup>
      )}
      <option value="__pool__">↓ Dispotopf</option>
    </select>
  );
}

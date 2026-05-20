/**
 * S-3 AcuteSection — "WAS IST AKUT" Universal-Container.
 *
 * Extrahiert aus AiHintsTab (S-1 battle-tested). Generic:
 *   - Konsument liefert items[] (ranked, mit primaryAction)
 *   - AcuteSection rendert top-N compact-rows + Expand-Link
 *   - Internal detailsOpen-State (Item-Detail-Render via Slot)
 *
 * Mode-spezifische Befüllung passiert im Parent (TourDetailsTab /
 * ShipmentDetailsTab). AcuteSection ist nur Renderer + Sortierung.
 */
import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import {
  severityColorClass,
  severityRank,
  type SeverityLevel,
} from '../../lib/severity';

export interface AcuteAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface AcuteItem {
  /** Stable key für React. */
  id: string;
  /** L1=red, L2=amber, L3=blue. null wird nicht gerendert. */
  severity: SeverityLevel;
  /** Icon-Variant: 'shield'=Konflikt struktur, 'alert'=Risk/SLA. */
  icon: 'shield' | 'alert';
  /** Title-Text (prominent). */
  label: string;
  /** Sub-Text (kontextuell, kleiner). */
  hint?: string;
  /** Primäre Action — Knopf rechts neben Label. */
  primaryAction?: AcuteAction;
}

export interface AcuteSectionProps {
  /** Bereits sortierte Items (höchste Severity zuerst). */
  items: AcuteItem[];
  /** Max sichtbare Top-Items vor "+ N weitere". Default 3. */
  maxVisible?: number;
  /** Optional Details-Slot (volle Conflict-Cards etc.) —
   *  gerendert wenn detailsOpen=true. */
  details?: ReactNode;
  /** Übersteuert Heading-Text. Default "Was ist akut?". */
  title?: string;
}

/**
 * Helper: sortiert nach Severity-Rank (L1 > L2 > L3 > null),
 * filtert null-Severities raus (nicht acute).
 */
export function sortAcuteItems(items: AcuteItem[]): AcuteItem[] {
  return items
    .filter((i) => i.severity !== null)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export default function AcuteSection({
  items,
  maxVisible = 3,
  details,
  title = 'Was ist akut?',
}: AcuteSectionProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const visible = items.slice(0, maxVisible);
  const restCount = Math.max(0, items.length - visible.length);
  const hasExpandable = restCount > 0 || details != null;

  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-1.5 text-gray-700 font-medium mb-1 text-xs">
        <AlertTriangle size={14} className="text-red-600" />
        {title}
        <span className="ml-1 text-[10px] text-gray-500">
          ({items.length} insg.)
        </span>
      </div>
      <div className="space-y-1.5">
        {visible.map((it) => (
          <AcuteRow key={it.id} item={it} />
        ))}
      </div>
      {hasExpandable && (
        <button
          onClick={() => setDetailsOpen((o) => !o)}
          className="mt-1.5 text-[10px] text-blue-700 hover:underline inline-flex items-center gap-0.5"
        >
          {detailsOpen ? (
            <ChevronDown size={10} />
          ) : (
            <ChevronRight size={10} />
          )}
          {detailsOpen
            ? 'weniger anzeigen'
            : restCount > 0
              ? `+ ${restCount} weitere`
              : 'Details'}
        </button>
      )}
      {detailsOpen && details && (
        <div className="mt-2 space-y-2">{details}</div>
      )}
    </section>
  );
}

function AcuteRow({ item }: { item: AcuteItem }) {
  const colClass = severityColorClass(item.severity);
  const Icon = item.icon === 'shield' ? ShieldAlert : AlertTriangle;
  return (
    <div
      className={`border ${colClass} rounded px-2 py-1.5 flex items-center gap-1.5 text-xs`}
    >
      <Icon size={12} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{item.label}</div>
        {item.hint && (
          <div className="truncate text-[10px] text-gray-600 mt-0.5">
            {item.hint}
          </div>
        )}
      </div>
      {item.primaryAction && (
        <button
          onClick={item.primaryAction.onClick}
          disabled={item.primaryAction.disabled}
          className="text-[10px] px-1.5 py-0.5 bg-white border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 flex-shrink-0"
        >
          {item.primaryAction.label}
        </button>
      )}
    </div>
  );
}

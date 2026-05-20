/**
 * S-3 StickyHead — Action-First Panel-Kopf.
 *
 * Sticky-top mit:
 *   Row 1: Entity-Title + Sub-Label + Severity-Badge + Pin + Close
 *   Row 2 (conditional): Quick-Action-Buttons
 *
 * Konsumiert lib/severity für Color + Severity-Indicator.
 * Konsumiert state/panel für pin/close (kein Prop-Drilling).
 */
import { Pin, PinOff, X } from 'lucide-react';
import { usePanel } from '../../state/panel';
import {
  severityColorClass,
  severityToken,
  type SeverityLevel,
} from '../../lib/severity';

export interface QuickAction {
  label: string;
  /** Lucide-Icon-Component (z.B. <Box size={11} />). */
  icon?: React.ReactNode;
  onClick: () => void;
  /** Optional title-Attribut (Tooltip). */
  title?: string;
  /** disabled-State (z.B. wenn Action gerade pending). */
  disabled?: boolean;
}

export interface StickyHeadProps {
  /** Anzeigetext (z.B. "SH-12345" oder Tour-Code). */
  title: string;
  /** Sub-Label rechts vom Titel (Status, Sub, Datum). */
  subLabel?: string;
  /** Severity → farbiger Badge mit Token-Label. */
  severity?: SeverityLevel;
  /** Quick-Action-Buttons (0..4 Empfehlung). */
  quickActions?: QuickAction[];
}

export default function StickyHead({
  title,
  subLabel,
  severity,
  quickActions = [],
}: StickyHeadProps) {
  const { pinned, togglePin, close } = usePanel();

  const token = severity ? severityToken(severity) : null;
  const sevColor = severity ? severityColorClass(severity) : null;

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-900 truncate">
              {title}
            </span>
            {token && sevColor && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${sevColor}`}
                title={`Severity: ${token.label}`}
              >
                {token.label}
              </span>
            )}
          </div>
          {subLabel && (
            <div className="text-[11px] text-gray-500 truncate mt-0.5">
              {subLabel}
            </div>
          )}
        </div>
        <button
          onClick={togglePin}
          className="text-gray-500 hover:text-gray-800"
          title={pinned ? 'Pin lösen (Esc schließt wieder)' : 'Pin (bleibt offen)'}
        >
          {pinned ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        <button
          onClick={close}
          className="text-gray-500 hover:text-gray-800"
          title="Schließen (Esc)"
        >
          <X size={16} />
        </button>
      </div>
      {quickActions.length > 0 && (
        <div className="flex items-center gap-1 px-3 pb-2 flex-wrap">
          {quickActions.map((a, i) => (
            <button
              key={`${a.label}-${i}`}
              onClick={a.onClick}
              disabled={a.disabled}
              title={a.title ?? a.label}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border border-gray-300 rounded text-gray-700 hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * B-2 Insert-Mode-Banner für LoadingPlan-Pages (NV + FV).
 *
 * Sichtbar wenn insertMode=true. Click → Esc-Alternative (cancel).
 */
import { Plus, X } from 'lucide-react';

export default function InsertModeBanner({
  active,
  onCancel,
}: {
  active: boolean;
  onCancel: () => void;
}) {
  if (!active) return null;
  return (
    <div
      className="bg-amber-100 border border-amber-400 rounded px-3 py-2 flex items-center gap-2 text-sm text-amber-900"
      role="status"
      aria-live="polite"
      data-testid="insert-mode-banner"
    >
      <Plus size={14} />
      <span className="font-semibold">Insert-Mode aktiv</span>
      <span className="text-xs text-amber-700">
        — Drop auf besetzten Slot verschiebt downstream-Items.
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="ml-auto inline-flex items-center gap-1 text-xs bg-white border border-amber-300 rounded px-2 py-0.5 hover:bg-amber-50"
        aria-label="Insert-Mode beenden"
      >
        <X size={11} />
        Esc
      </button>
    </div>
  );
}

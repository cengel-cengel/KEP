/**
 * Phase-1 Perf-Refactor: Row der Sendungs-Liste in DispositionPage.
 *
 * Extrahiert aus DispositionPage.tsx renderItem (L824-866 vor Refactor)
 * + in React.memo gewrappt. Default-shallow-Compare reicht — Eltern
 * uebergibt scalar/boolean props + useCallback-stabilisierte Handler.
 *
 * Hot-Path-Hinweis (Phase 1 Limit):
 *   selectedIds: Set wird weiterhin durchgereicht (ShipmentCard nutzt
 *   es fuer Bulk-Stackable/Transport-Toggle). Set-Identitaet aendert
 *   sich bei jedem Toggle → Memo greift NICHT bei Selection-Toggles.
 *   Memo schuetzt aber gegen die anderen Re-Render-Triggers (Highlight,
 *   Expand-Toggle, Tour-Klick, Modal-Open). Phase-C-Commit refactort
 *   ShipmentCard auf scalar Bulk-Props → dann greift Memo komplett.
 */
import { memo } from 'react';
import ShipmentCard from '../ShipmentCard';
import type { Shipment } from '../../types/shipment';

export interface ShipmentRowProps {
  shipment: Shipment;
  /** Boolean derivation aus selectedIds.has(shipment.id) — scalar
   *  damit Memo nur DIE EINE Row neu rendert wenn ihr Status flippt
   *  (statt aller Rows). */
  isSelected: boolean;
  /** Yellow-Highlight-Pulse (Focus aus URL/Modal-Nav). */
  isHighlighted: boolean;
  /** Detail-Panel-Selektion (= selectedShipmentId in der Page). */
  isDetailFocused: boolean;
  /** Toggle-Aktion fuer die Checkbox. Parent wrappt in useCallback. */
  onToggleSelection: (id: string) => void;
  /** Row-Body-Klick — oeffnet Detail-Panel via setSelectedShipmentId. */
  onRowClick: (id: string) => void;
  /** Card-Body-Klick — oeffnet Detail-Modal (S-5-Panel). */
  onCardClick: (id: string) => void;
  /** Ref-Registrierung fuer Scroll-To-Focus (cardRefs.current.set). */
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  /** Phase-1 Durchreich-Prop: ShipmentCard nutzt es fuer Bulk-Toggles.
   *  Phase-C wird das durch scalar Bulk-Props ersetzt — bis dahin
   *  bricht Memo bei Selection-Toggles (gewuenscht & dokumentiert). */
  selectedIds: Set<string>;
}

function ShipmentRowImpl({
  shipment,
  isSelected,
  isHighlighted,
  isDetailFocused,
  onToggleSelection,
  onRowClick,
  onCardClick,
  registerRef,
  selectedIds,
}: ShipmentRowProps) {
  const className = `flex items-start gap-2 rounded-lg border transition-colors ${
    isHighlighted
      ? 'border-yellow-500 ring-2 ring-yellow-300 bg-yellow-50 animate-pulse'
      : isDetailFocused
        ? 'border-[#1e40af] bg-yellow-100'
        : isSelected
          ? 'border-blue-300 bg-blue-50'
          : 'border-gray-200 bg-white hover:bg-gray-50'
  }`;
  return (
    <div
      ref={(el) => registerRef(shipment.id, el)}
      className={className}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelection(shipment.id)}
        onClick={(e) => e.stopPropagation()}
        className="mt-3 ml-2"
        aria-label={`Sendung ${shipment.shipment_number ?? shipment.id} markieren`}
      />
      <div
        className="flex-1 cursor-pointer"
        onClick={() => onRowClick(shipment.id)}
      >
        <ShipmentCard
          shipment={shipment}
          draggable
          selectedIds={selectedIds}
          onCardClick={() => onCardClick(shipment.id)}
        />
      </div>
    </div>
  );
}

const ShipmentRow = memo(ShipmentRowImpl);
export default ShipmentRow;

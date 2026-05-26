/**
 * Phase-1 + Phase-C Perf-Refactor: Row der Sendungs-Liste in
 * DispositionPage.
 *
 * Extrahiert aus DispositionPage.tsx renderItem + in React.memo
 * gewrappt. Default-shallow-Compare reicht — Eltern uebergibt
 * scalar/boolean props + useCallback-stabilisierte Handler.
 *
 * Phase-C (Memo-Luecke geschlossen):
 *   selectedIds: Set wurde durch scalar isBulkSelected + getBulkIds-
 *   Callback ersetzt. Selection-Toggle re-rendert jetzt NUR die EINE
 *   betroffene Row (statt aller ~600).
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
  /** Phase-C: scalar Bulk-Flag — true wenn diese Sendung Teil einer
   *  Multi-Selection (>1) ist. Steuert Stackable/Transport-Toggle in
   *  ShipmentCard auf Bulk-Modus um. */
  isBulkSelected: boolean;
  /** Phase-C: Closure-getter fuer Bulk-IDs — JIT-Read aus Parent-Ref.
   *  Stabiler useCallback-Ref damit Memo nicht bricht. */
  getBulkIds: () => string[];
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
  isBulkSelected,
  getBulkIds,
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
          isBulkSelected={isBulkSelected}
          getBulkIds={getBulkIds}
          onCardClick={() => onCardClick(shipment.id)}
        />
      </div>
    </div>
  );
}

const ShipmentRow = memo(ShipmentRowImpl);
export default ShipmentRow;

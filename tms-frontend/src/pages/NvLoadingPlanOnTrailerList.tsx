/**
 * Schritt 4: "Auf Tour"-Liste — pro Tour-Stop eine draggable Mini-
 * Card. Quelle = patchedTour.stops (Sandbox-Filter eingerechnet,
 * ejected verschwinden hier automatisch nach Drag→Parkplatz).
 *
 * Drag-Source: setData(NV_DRAG_SHIPMENT_MIME, shipment.id).
 * Drop-Routing: Parkplatz (dispatch eject) ODER 3D (no-op, da
 * Sendung bereits auf Tour). State-basiert im Parent-Drop-Handler.
 *
 * Card-Info: shipment_number · ldm · kg (kompakt, keine PLZ).
 */
import { NV_DRAG_SHIPMENT_MIME } from './NvLoadingPlanHofPanel';
import type { NvLoadingDetail } from './NvLoadingPlanPage';

interface Props {
  /** patchedTour.stops — Sandbox-gefilterte Tour-Stops. */
  stops: NvLoadingDetail['stops'];
}

export default function NvLoadingPlanOnTrailerList({ stops }: Props) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2 text-xs">
        <span className="font-semibold text-gray-900">🚛 Auf Tour</span>
        <span className="ml-auto font-mono text-gray-700">
          {stops.length} Sdg
        </span>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {stops.length === 0 && (
          <div className="text-xs text-gray-400 p-3 text-center">
            Tour ist leer.
          </div>
        )}
        {stops.map((stop) => {
          const ship = stop.shipment;
          const ldm = Number(ship.ldm) || 0;
          const weightKg = Number(ship.weight_kg) || 0;
          return (
            <button
              key={ship.id}
              type="button"
              draggable
              // MOBILE-DnD: touch-action:none verhindert Page-Scroll
              // waehrend Long-Press-Drag.
              style={{ touchAction: 'none' }}
              onDragStart={(e) => {
                // Schritt 4: shipmentId via dataTransfer. Routing
                // (eject vs removeInsert) macht der Parent-Drop-
                // Handler via Sandbox-State-Lookup.
                e.dataTransfer.setData(NV_DRAG_SHIPMENT_MIME, ship.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              className="w-full text-left p-2 rounded border border-gray-200 bg-white hover:bg-blue-50 active:bg-blue-100 text-xs leading-snug min-h-[44px] cursor-grab"
              data-testid={`ontrailer-card-${ship.id}`}
              title="Drag in den Parkplatz, um die Sendung von der Tour zu werfen"
            >
              <div className="font-mono font-semibold text-gray-900 truncate">
                {ship.shipment_number ?? ship.id}
              </div>
              <div className="text-gray-500 mt-0.5">
                {ldm.toFixed(1)} ldm · {Math.round(weightKg)} kg
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

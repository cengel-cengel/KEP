/**
 * Schritt 4: "Parkplatz" — Drop-Zone fuer ausgeworfene Sendungen.
 *
 * Drag-Quellen + Routing:
 *   · "Auf Tour"-Card (im patchedTour.stops, NICHT in inserted):
 *     → dispatch 'eject'. Sendung verschwindet aus OnTour-Liste,
 *       erscheint im Parkplatz. Beim Uebernehmen DELETE /stops/:id.
 *   · Hof-Card (in nearby-Pool, in sandbox.insertedShipmentIds):
 *     → 'eject'-Reducer-Symmetrie macht daraus 'removeInsert'
 *       (Insert-Undo). Sendung verschwindet vom 3D + Inserted-Badge
 *       weg, taucht NICHT im Parkplatz auf (war nie auf BE-Tour).
 *
 * Restore-Pfad: pro Card-Click im Parkplatz → dispatch 'restore'.
 * Sendung kehrt in OnTour-Liste zurueck.
 *
 * Visual: leerer Parkplatz hat dashed-Border (hint Drop-Target),
 * volle Cards sind kompakt mit ✕ "wiederherstellen"-Button.
 */
import { NV_DRAG_SHIPMENT_MIME } from './NvLoadingPlanHofPanel';
import type { NvLoadingDetail } from './NvLoadingPlanPage';
import type { SandboxAction } from '../lib/nvLoadingPlanSandbox';

interface Props {
  /** Komplette tour.stops aus tourQ.data — Quelle fuer ejected-
   *  Sendungs-Metadaten (shipment_number, ldm, kg). patchedTour
   *  taugt hier NICHT, weil dort ejected gefiltert sind. */
  tourStops: NvLoadingDetail['stops'];
  ejectedShipmentIds: Set<string>;
  /** Sandbox-State-Lookup fuer Drop-Routing (inserted → removeInsert
   *  via Reducer-Symmetrie, NICHT manuell hier). */
  insertedShipmentIds: Set<string>;
  /** Drop-Handler dispatcht direkt — der 'eject'-Reducer-Branch
   *  wandelt zu 'removeInsert' falls inserted (Mirror 'insert'-
   *  Exklusivitaet, siehe nvLoadingPlanSandbox.ts). */
  dispatch: (action: SandboxAction) => void;
}

export default function NvLoadingPlanParkplatz({
  tourStops,
  ejectedShipmentIds,
  insertedShipmentIds,
  dispatch,
}: Props) {
  // Ejected Sendungs-Cards aus tourStops aufloesen (ejected sind
  // Tour-Stop-Sendungen, NICHT Sandbox-Inserts — letztere haben kein
  // eject, sondern werden direkt aus inserted gestrichen).
  const ejectedCards = tourStops
    .filter((s) => ejectedShipmentIds.has(s.shipment.id))
    .map((s) => {
      const ship = s.shipment;
      const ldm = Number(ship.ldm) || 0;
      const weightKg = Number(ship.weight_kg) || 0;
      return {
        id: ship.id,
        shipmentNumber: ship.shipment_number ?? ship.id,
        ldm,
        weightKg,
      };
    });

  const isEmpty = ejectedCards.length === 0;

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2 text-xs">
        <span className="font-semibold text-gray-900">🅿 Parkplatz</span>
        <span className="ml-auto font-mono text-gray-700">
          {ejectedCards.length}
        </span>
      </div>
      <div
        className={
          'flex-1 overflow-auto p-2 ' +
          (isEmpty
            ? 'flex items-center justify-center border-2 border-dashed border-gray-300 m-2 rounded'
            : 'space-y-1.5')
        }
        data-testid="nv-parkplatz-dropzone"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(NV_DRAG_SHIPMENT_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={(e) => {
          const shipmentId = e.dataTransfer.getData(NV_DRAG_SHIPMENT_MIME);
          if (!shipmentId) return;
          e.preventDefault();
          // State-basiertes Routing: 'eject'-Reducer entscheidet selbst,
          // ob inserted-zurueck oder echter eject. Wir dispatchen
          // einfach 'eject'.
          // Hof-Card-Drag (nie auf Tour) hat shipmentId, die WEDER in
          // patchedTour.stops noch in insertedShipmentIds steht →
          // 'eject'-Reducer erstellt einen ejected-Eintrag, der beim
          // Uebernehmen einen NICHT-existierenden Stop sucht → "Stop
          // nicht gefunden"-Error. Wir filtern den Fall hier vor:
          // nur dispatchen, wenn die Sendung tatsaechlich auf der
          // (gepachten) Tour ist ODER ein Insert ist.
          const isOnTour = tourStops.some((s) => s.shipment.id === shipmentId);
          const isInserted = insertedShipmentIds.has(shipmentId);
          if (!isOnTour && !isInserted) return; // no-op (Hof-Karte direkt)
          dispatch({ type: 'eject', shipmentId });
        }}
      >
        {isEmpty && (
          <div className="text-xs text-gray-400 text-center px-3">
            Hier ablegen, um eine Sendung
            <br />
            aus der Tour zu werfen
          </div>
        )}
        {ejectedCards.map((card) => (
          <div
            key={card.id}
            className="flex items-start gap-2 p-2 rounded border border-amber-300 bg-amber-50 text-xs leading-snug"
            data-testid={`parkplatz-card-${card.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-mono font-semibold text-gray-900 truncate">
                {card.shipmentNumber}
              </div>
              <div className="text-gray-600 mt-0.5">
                {card.ldm.toFixed(1)} ldm · {Math.round(card.weightKg)} kg
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'restore', shipmentId: card.id })
              }
              className="shrink-0 px-1.5 py-0.5 text-[11px] rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
              title="Sendung zurueck auf Tour"
              data-testid={`parkplatz-restore-${card.id}`}
            >
              ↩ zurueck
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

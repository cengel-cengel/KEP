/**
 * Schritt 4: rechte Spalte mit 3 Sektionen (vertikal):
 *
 *   ┌─── 🚛 Auf Tour ─────┐ flex 1.5, scroll-y
 *   │  Draggable Cards    │ Source fuer Drag→Parkplatz (eject).
 *   └────────────────────┘
 *   ┌─── 🅿 Parkplatz ────┐ min-h-32, dashed wenn leer
 *   │  Drop-Zone          │ Target fuer OnTour-Drop + Restore-Cards.
 *   └────────────────────┘
 *   ┌─── 🌐 Hof (20 km) ──┐ flex 1.5, scroll-y
 *   │  PLZ-Cluster Cards  │ Schritt 3 (unveraendert), drag-Source
 *   │                      │ fuer 3D-Drop (insert).
 *   └────────────────────┘
 *
 * Mobile-DnD-Hinweis (Schritt 3+4): HTML5 native drag funktioniert
 * auf Touch-Geraeten NICHT out-of-the-box. Bei iPad/iPhone (Carlos's
 * Mobile-Use-Case) benoetigt es einen Touch-DnD-Adapter (z.B.
 * mobile-drag-drop-polyfill oder react-dnd-multi-backend). Aktuell
 * nicht eingebaut — Backlog. Drag funktioniert auf Desktop normal.
 */
import NvLoadingPlanHofPanel from './NvLoadingPlanHofPanel';
import NvLoadingPlanOnTrailerList from './NvLoadingPlanOnTrailerList';
import NvLoadingPlanParkplatz from './NvLoadingPlanParkplatz';
import type { NvLoadingDetail } from './NvLoadingPlanPage';
import type { SandboxAction } from '../lib/nvLoadingPlanSandbox';

interface Props {
  tourId: string | null | undefined;
  /** patchedTour.stops — Sandbox-gefilterte Tour-Stops, fuer
   *  OnTrailer-List + Drop-Routing-Decision in Parkplatz. */
  patchedStops: NvLoadingDetail['stops'];
  /** Volle tour.stops (vor Sandbox-Filter) — fuer Parkplatz, der
   *  ejected-Sendungs-Metadaten daher zieht. */
  tourStops: NvLoadingDetail['stops'];
  ejectedShipmentIds: Set<string>;
  insertedShipmentIds: Set<string>;
  dispatch: (action: SandboxAction) => void;
}

export default function NvLoadingPlanRightPanel({
  tourId,
  patchedStops,
  tourStops,
  ejectedShipmentIds,
  insertedShipmentIds,
  dispatch,
}: Props) {
  return (
    <div className="h-full flex flex-col">
      {/* Top: Auf Tour (draggable Source) */}
      <div className="basis-[35%] min-h-0 border-b">
        <NvLoadingPlanOnTrailerList stops={patchedStops} />
      </div>
      {/* Middle: Parkplatz (Drop-Zone + Restore) */}
      <div className="basis-[20%] min-h-[8rem] border-b">
        <NvLoadingPlanParkplatz
          tourStops={tourStops}
          ejectedShipmentIds={ejectedShipmentIds}
          insertedShipmentIds={insertedShipmentIds}
          dispatch={dispatch}
        />
      </div>
      {/* Bottom: Hof (Schritt 3 unveraendert) */}
      <div className="basis-[45%] min-h-0">
        <NvLoadingPlanHofPanel
          tourId={tourId}
          insertedShipmentIds={insertedShipmentIds}
        />
      </div>
    </div>
  );
}

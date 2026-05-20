/**
 * W-3.2.C NvEligibleTree — extrahierte NV-Eligible-Shipments-Liste.
 *
 * Pure-Move-Komponente aus NvDispoPage Render-Block (Group-by-
 * tour_gebiet-code, Color-Stripe, ResponsiveTable per Group,
 * Multi-Select-DnD-Source).
 *
 * Konsumiert in W-3.2.C SCHRITT 5 von QueuePanel im 'nv'-Branch.
 * NvDispoPage konsumiert die Komponente noch NICHT — solange Page
 * existiert, behält sie ihre inline-Rendering (kein Page-Body-Touch
 * vor SCHRITT 6 Shells).
 *
 * DnD-Payload: vereinheitlicht 'application/json' mit
 *   { shipmentIds: string[], source: 'list' }
 * (Multi-Select-aware Ghost via DOM-Element).
 */
import ResponsiveTable from '../table/ResponsiveTable';
import { eligColumns } from './eligColumns';
import type { EligibleShipment } from '../../lib/nvTypes';

export interface NvEligibleTreeProps {
  shipments: EligibleShipment[];
  /** Map<groupKey, farbe-hex> aus tour_gebiete. */
  farbenMap: Map<string, string>;
  expandedGroup: string | null;
  onToggleGroup: (key: string) => void;
  selected: Set<string>;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  /** Detail-Button (Eye-Icon) öffnet Sendungs-Panel. */
  onOpenDetail: (id: string) => void;
  /** Group-Stale-Skeleton wenn eligible noch lädt. */
  loading?: boolean;
  /** Optional Override für storageKey-Prefix (Default 'nv-dispo'). */
  storageKeyPrefix?: string;
}

/**
 * Gruppiert Sendungen nach matched_tour_gebiet_code (oder "— ohne
 * Zuordnung —"). Sortiert Gruppen alphabetisch.
 */
export function groupEligibleShipments(
  list: EligibleShipment[],
): Array<[string, EligibleShipment[]]> {
  const map = new Map<string, EligibleShipment[]>();
  for (const s of list) {
    const key = s.matched_tour_gebiet_code ?? '— ohne Zuordnung —';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function NvEligibleTree({
  shipments,
  farbenMap,
  expandedGroup,
  onToggleGroup,
  selected,
  draggingId,
  setDraggingId,
  onSelect,
  onOpenDetail,
  loading = false,
  storageKeyPrefix = 'nv-dispo',
}: NvEligibleTreeProps) {
  const grouped = groupEligibleShipments(shipments);

  if (!loading && grouped.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Keine offenen Sendungen.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-y-auto">
      {grouped.map(([groupKey, items]) => {
        const collapsed = expandedGroup !== groupKey;
        const farbe = farbenMap.get(groupKey) ?? '#9ca3af';
        return (
          <div key={groupKey} className="border-b border-gray-200">
            <button
              type="button"
              onClick={() => onToggleGroup(groupKey)}
              className="w-full px-3 py-1 bg-gray-100 border-b text-xs font-mono text-gray-700 flex items-center gap-2 hover:bg-gray-200 border-l-4"
              style={{ borderLeftColor: farbe }}
            >
              <span className="inline-block w-3 text-center">
                {collapsed ? '▶' : '▼'}
              </span>
              <span>
                {groupKey} ({items.length})
              </span>
            </button>
            {!collapsed && (
              <ResponsiveTable<EligibleShipment>
                storageKey={`${storageKeyPrefix}-elig-${groupKey}`}
                columns={eligColumns(onOpenDetail)}
                data={items}
                rowKey={(s) => s.id}
                density="compact"
                stickyHeader={false}
                className="rounded-none border-0"
                rowProps={(s) => ({
                  draggable: true,
                  onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
                    const idsToDrag =
                      selected.has(s.id) && selected.size > 1
                        ? Array.from(selected)
                        : [s.id];
                    // Unified DnD-Payload: 'application/json'
                    // shipmentIds[] + source.
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({
                        shipmentIds: idsToDrag,
                        source: 'list',
                      }),
                    );
                    if (idsToDrag.length > 1) {
                      const ghost = document.createElement('div');
                      ghost.textContent = `${idsToDrag.length} Sendungen ziehen`;
                      ghost.style.cssText =
                        'position:absolute;top:-1000px;left:-1000px;padding:6px 10px;background:#1e40af;color:white;border-radius:6px;font-size:12px;font-weight:500;font-family:system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.3);';
                      document.body.appendChild(ghost);
                      e.dataTransfer.setDragImage(ghost, 10, 10);
                      setTimeout(() => {
                        document.body.removeChild(ghost);
                      }, 0);
                    }
                    setDraggingId(s.id);
                  },
                  onDragEnd: () => setDraggingId(null),
                  onClick: (e: React.MouseEvent<HTMLDivElement>) => {
                    onSelect(s.id, e.shiftKey);
                  },
                  className: `cursor-pointer ${
                    selected.has(s.id) ? 'bg-blue-50' : ''
                  } ${draggingId === s.id ? 'opacity-40' : ''}`,
                })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

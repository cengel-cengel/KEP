/**
 * W-3.2.C FilterBar — workspace-konsumierende Filter-Toolbar.
 *
 * Liest + schreibt useWorkspaceFilter() (search, sort, tourStatuses,
 * pickupMode, gebiet). Wird in QueuePanel (oben) gerendert. Dormant
 * bis SCHRITT 5 (WorkspacePage konsumiert die neuen Panels).
 *
 * Mode-aware:
 *   - pickupMode-Toggle nur bei mode='nv'
 *   - tourStatuses-Buttons nur bei mode='nv' (NV-spezifische Werte)
 *   - sort-Toggle für beide modes
 */
import { useEffect, useMemo, useState } from 'react';
import { Package, Truck } from 'lucide-react';
import {
  useWorkspace,
  useWorkspaceFilter,
} from '../../state/workspace';

const SEARCH_DEBOUNCE_MS = 250;

const NV_STATUS_OPTIONS = [
  { value: 'PLANNING', label: 'Geplant' },
  { value: 'IN_PROGRESS', label: 'In Fahrt' },
  { value: 'COMPLETED', label: 'Fertig' },
] as const;

const SORT_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'date', label: 'Datum' },
  { value: 'land', label: 'Land' },
] as const;

export interface FilterBarProps {
  /** Optional tour-gebiet-Liste (NV-only) für Gebiet-Dropdown. */
  tourGebiete?: Array<{ id: string; code: string }>;
}

export default function FilterBar({ tourGebiete }: FilterBarProps) {
  const { mode, datum, setDatum } = useWorkspace();
  const { filter, setFilter } = useWorkspaceFilter();

  // Search: lokaler Draft mit Debounce → setFilter({ search }).
  const [searchDraft, setSearchDraft] = useState(filter.search);
  useEffect(() => {
    if (searchDraft === filter.search) return;
    const t = window.setTimeout(() => {
      setFilter({ search: searchDraft });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchDraft, filter.search, setFilter]);

  // Falls workspace.filter.search von außen geändert (z.B. SavedView-
  // Restore), reflektiere im Draft.
  useEffect(() => {
    setSearchDraft(filter.search);
  }, [filter.search]);

  const toggleStatus = (st: string) => {
    const next = new Set(filter.tourStatuses);
    if (next.has(st)) next.delete(st);
    else next.add(st);
    // Mindestens 1 Status aktiv (mirror legacy-Verhalten).
    const arr = next.size === 0 ? ['PLANNING'] : Array.from(next);
    setFilter({ tourStatuses: arr });
  };

  const activeStatuses = useMemo(
    () => new Set(filter.tourStatuses),
    [filter.tourStatuses],
  );

  return (
    <div className="bg-white border-b px-4 py-3 flex flex-wrap items-center gap-3">
      {/* NV-only: Pickup/Delivery Mode-Toggle */}
      {mode === 'nv' && (
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            type="button"
            onClick={() => setFilter({ pickupMode: 'PICKUP' })}
            className={`px-3 py-1.5 text-sm flex items-center gap-1 ${
              filter.pickupMode === 'PICKUP'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Package size={14} />
            Abholung
          </button>
          <button
            type="button"
            onClick={() => setFilter({ pickupMode: 'DELIVERY' })}
            className={`px-3 py-1.5 text-sm flex items-center gap-1 border-l border-gray-300 ${
              filter.pickupMode === 'DELIVERY'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Truck size={14} />
            Zustellung
          </button>
        </div>
      )}

      <div>
        <label className="block text-[10px] uppercase text-gray-500 mb-0.5">
          Datum
        </label>
        <input
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </div>

      {mode === 'nv' && tourGebiete && tourGebiete.length > 0 && (
        <div>
          <label className="block text-[10px] uppercase text-gray-500 mb-0.5">
            Tour-Gebiet
          </label>
          <select
            value={filter.gebiet ?? ''}
            onChange={(e) =>
              setFilter({ gebiet: e.target.value || undefined })
            }
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">Alle</option>
            {tourGebiete.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex-1 min-w-[200px] max-w-md">
        <label className="block text-[10px] uppercase text-gray-500 mb-0.5">
          Suche
        </label>
        <input
          type="text"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Sendung-Nr / Kunde…"
          className="border rounded px-2 py-1 text-sm w-full"
        />
      </div>

      {mode === 'nv' && (
        <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs">
          {NV_STATUS_OPTIONS.map(({ value, label }, i) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleStatus(value)}
              className={`px-2.5 py-1.5 ${i > 0 ? 'border-l border-gray-300' : ''} ${
                activeStatuses.has(value)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs">
        {SORT_OPTIONS.map(({ value, label }, i) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter({ sort: value })}
            className={`px-2 py-1 ${i > 0 ? 'border-l border-gray-300' : ''} ${
              filter.sort === value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={`Sort: ${label}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

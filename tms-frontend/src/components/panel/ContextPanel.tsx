import { useEffect, useState } from 'react';
import { usePanel } from '../../state/panel';
import { registerHotkey } from '../../lib/hotkeys';
import ShipmentDetailsTab from './ShipmentDetailsTab';
import TourDetailsTab from './TourDetailsTab';
import HistoryTab from './HistoryTab';
import DocumentsTab from './DocumentsTab';

type TabKey = 'details' | 'history' | 'documents';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'history', label: 'Historie' },
  { key: 'documents', label: 'Dokumente' },
];

/**
 * W-1 ContextPanel — S-3 refactored:
 *   - Tab "Hinweise" entfernt (AcuteSection ist in Details-Tab embedded)
 *   - StickyHead (Title + Pin + Close + Quick-Actions) lebt jetzt
 *     IM DetailsTab (TourDetailsTab/ShipmentDetailsTab) — entity-
 *     spezifische Quick-Actions brauchen entity-Daten.
 *   - ContextPanel selbst hat nur noch Tab-Strip + Body.
 */
export default function ContextPanel() {
  const { entity, width, pinned, close, togglePin } = usePanel();
  const [tab, setTab] = useState<TabKey>('details');

  // W-2: Hotkeys via lib/hotkeys (skip-in-input + scope).
  useEffect(() => {
    if (!entity) return;
    const unsubs = [
      registerHotkey('escape', () => {
        if (!pinned) close();
      }),
      registerHotkey('p', () => togglePin()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [entity, pinned, close, togglePin]);

  if (!entity) return null;

  return (
    <aside
      className="fixed right-0 top-0 bottom-0 z-40 bg-white border-l border-gray-200 shadow-lg flex flex-col"
      style={{ width: `${width}px` }}
    >
      <div className="flex border-b bg-white text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-1.5 border-b-2 ${
              tab === t.key
                ? 'border-blue-600 text-blue-700 font-semibold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'details' && entity.type === 'shipment' && (
          <ShipmentDetailsTab shipmentId={entity.id} />
        )}
        {tab === 'details' && entity.type === 'tour' && (
          <TourDetailsTab tourId={entity.id} mode="fv" />
        )}
        {tab === 'details' && entity.type === 'nv-tour' && (
          <TourDetailsTab tourId={entity.id} mode="nv" />
        )}
        {tab === 'history' && <HistoryTab />}
        {tab === 'documents' && <DocumentsTab />}
      </div>
    </aside>
  );
}

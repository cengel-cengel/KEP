import { useEffect, useState } from 'react';
import { Pin, PinOff, X } from 'lucide-react';
import { usePanel } from '../../state/panel';
import { registerHotkey } from '../../lib/hotkeys';
import ShipmentDetailsTab from './ShipmentDetailsTab';
import TourDetailsTab from './TourDetailsTab';
import HistoryTab from './HistoryTab';
import DocumentsTab from './DocumentsTab';
import AiHintsTab from './AiHintsTab';

type TabKey = 'details' | 'history' | 'documents' | 'ai';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'history', label: 'Historie' },
  { key: 'documents', label: 'Dokumente' },
  { key: 'ai', label: 'Hinweise' },
];

/**
 * W-1 ContextPanel.
 * Persistenter right-side Panel für selected Entity.
 * Slide-in via CSS-transform, AppLayout pusht main-content
 * via padding-right.
 */
export default function ContextPanel() {
  const {
    entity,
    width,
    pinned,
    close,
    togglePin,
  } = usePanel();
  const [tab, setTab] = useState<TabKey>('details');

  // W-2: Hotkeys via lib/hotkeys (skip-in-input + scope).
  // Esc → close (außer pinned). p → toggle pin.
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

  const title =
    entity.type === 'shipment'
      ? 'Sendung'
      : entity.type === 'nv-tour'
        ? 'NV-Tour'
        : 'FV-Tour';

  return (
    <aside
      className="fixed right-0 top-0 bottom-0 z-40 bg-white border-l border-gray-200 shadow-lg flex flex-col"
      style={{ width: `${width}px` }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
        <div className="font-semibold text-sm text-gray-800 truncate">
          {title}
        </div>
        <span className="font-mono text-xs text-gray-500 truncate">
          {entity.id.slice(0, 8)}
        </span>
        <button
          onClick={togglePin}
          className="ml-auto text-gray-500 hover:text-gray-800"
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
        {tab === 'ai' && <AiHintsTab />}
      </div>
    </aside>
  );
}

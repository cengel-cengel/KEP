import { useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import type { BulkTourPickerTour } from './BulkTourPicker';

export default function QuickAddBar({
  shipmentNumber,
  touren,
  onPick,
  onCreateNew,
  onClose,
}: {
  shipmentNumber: string | null;
  touren: BulkTourPickerTour[];
  onPick: (tourId: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 py-2 flex items-center gap-3">
        <span className="text-sm">
          <span className="text-gray-500">Sendung</span>{' '}
          <span className="font-mono font-semibold text-gray-800">
            {shipmentNumber ?? '—'}
          </span>{' '}
          <span className="text-gray-500">→ wohin?</span>
        </span>
        <button
          onClick={onCreateNew}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
        >
          <Plus size={14} />
          Neue Tour
        </button>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-800"
          title="Schließen (Esc)"
        >
          <X size={18} />
        </button>
      </div>
      <div className="px-4 pb-2 flex items-center gap-2 overflow-x-auto">
        {touren.length === 0 && (
          <span className="text-xs text-gray-500 italic">
            Keine Tour vorhanden — Neue anlegen.
          </span>
        )}
        {touren.map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-blue-100 hover:border-blue-400 border border-gray-300 rounded text-xs"
            title={
              t.subunternehmer?.name
                ? `${t.subunternehmer.name} · ${t.stops.length} Stops`
                : `${t.stops.length} Stops`
            }
          >
            <span className="font-mono font-semibold text-gray-800">
              {t.nv_stamm_tour?.code ?? '—'}
            </span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-600">{t.stops.length} Stops</span>
          </button>
        ))}
      </div>
    </div>
  );
}

import { Plus, X } from 'lucide-react';

export interface BulkTourPickerTour {
  id: string;
  nv_stamm_tour?: { code: string } | null;
  subunternehmer?: { name: string } | null;
  stops: { id: string }[];
}

export default function BulkTourPicker({
  touren,
  onClose,
  onPicked,
  onCreateNew,
  title,
}: {
  touren: BulkTourPickerTour[];
  onClose: () => void;
  onPicked: (tourId: string) => void;
  onCreateNew?: () => void;
  title?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-800">
            {title ?? 'Tour auswählen'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        {onCreateNew && (
          <div className="px-3 py-2 border-b bg-gray-50">
            <button
              onClick={onCreateNew}
              className="w-full text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded px-3 py-2 inline-flex items-center justify-center gap-1"
            >
              <Plus size={14} />
              Neue Tour anlegen
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {touren.length === 0 && (
            <div className="p-3 text-sm text-gray-500">
              Keine Touren für dieses Datum.
            </div>
          )}
          {touren.map((t) => (
            <button
              key={t.id}
              onClick={() => onPicked(t.id)}
              className="w-full text-left px-3 py-2 border-b hover:bg-blue-50 text-sm"
            >
              <div className="font-medium">
                {t.nv_stamm_tour?.code ?? '—'}
              </div>
              <div className="text-xs text-gray-500">
                {t.subunternehmer?.name ?? ''} · {t.stops.length} Stops
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

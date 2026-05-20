import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../../../lib/api';

interface StopOption {
  id: string;
  position: number;
  shipment_number?: string | null;
}

export default function SplitTourDialog({
  tourId,
  stops,
  preselectedStopId,
  onClose,
}: {
  tourId: string;
  stops: StopOption[];
  preselectedStopId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [stopId, setStopId] = useState<string>(
    preselectedStopId ??
      stops.find((s) => s.position > 0)?.id ??
      stops[1]?.id ??
      '',
  );
  const mut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/nv-touren/${tourId}/split`, {
        from_stop_id: stopId,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', tourId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-[1100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="font-semibold text-sm">Tour splitten</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X size={16} />
          </button>
        </div>
        <div className="p-3 space-y-2 text-xs">
          <p className="text-gray-600">
            Stops ab Cut-Punkt (inkl.) wandern in eine NEUE Tour mit
            identischem Sub / Datum / Fahrzeug.
          </p>
          <label className="block">
            <span className="text-gray-600">Cut-Punkt</span>
            <select
              value={stopId}
              onChange={(e) => setStopId(e.target.value)}
              className="mt-1 w-full border rounded px-2 py-1 text-sm"
            >
              {stops
                .filter((s) => s.position > 0)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.position}. {s.shipment_number ?? '—'}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t px-3 py-2">
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!stopId || mut.isPending}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {mut.isPending ? 'Splitte…' : 'Splitten'}
          </button>
        </div>
      </div>
    </div>
  );
}

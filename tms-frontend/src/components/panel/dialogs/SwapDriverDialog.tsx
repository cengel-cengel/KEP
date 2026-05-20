import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../../../lib/api';

interface Sub {
  id: string;
  name: string;
  aktiv?: boolean | null;
}

export default function SwapDriverDialog({
  tourId,
  currentSubId,
  onClose,
}: {
  tourId: string;
  currentSubId?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [newSubId, setNewSubId] = useState<string>('');

  const subsQ = useQuery<Sub[]>({
    queryKey: ['nv-subunternehmer'],
    queryFn: async () =>
      (await api.get<Sub[]>('/nv-subunternehmer')).data,
    staleTime: 5 * 60_000,
  });
  const subs = (subsQ.data ?? []).filter(
    (s) => s.aktiv !== false && s.id !== currentSubId,
  );

  const mut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/nv-touren/${tourId}/apply-action`, {
        action_type: 'SWAP_DRIVER',
        new_subunternehmer_id: newSubId,
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
          <h3 className="font-semibold text-sm">Subunternehmer wechseln</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X size={16} />
          </button>
        </div>
        <div className="p-3 space-y-2 text-xs">
          <label className="block">
            <span className="text-gray-600">Neuer Sub</span>
            <select
              value={newSubId}
              onChange={(e) => setNewSubId(e.target.value)}
              className="mt-1 w-full border rounded px-2 py-1 text-sm"
            >
              <option value="">— wählen —</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
            disabled={!newSubId || mut.isPending}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {mut.isPending ? 'Wechsele…' : 'Wechseln'}
          </button>
        </div>
      </div>
    </div>
  );
}

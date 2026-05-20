import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { api } from '../../../lib/api';

interface NvTourOption {
  id: string;
  nv_stamm_tour?: { code?: string } | null;
  datum?: string;
}

interface BestMatch {
  tour_id: string;
  mode: 'nv' | 'fv';
  score: number;
  reason: string;
}

export default function MoveStopDialog({
  fromTourId,
  stopId,
  stopLabel,
  shipmentId,
  onClose,
}: {
  fromTourId: string;
  stopId: string;
  stopLabel?: string;
  /** T-3.3: wenn vorhanden, best-match-Vorschlag pre-fillen. */
  shipmentId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [targetId, setTargetId] = useState<string>('');

  const matchQ = useQuery<BestMatch[]>({
    queryKey: ['shipment-best-match', shipmentId],
    queryFn: async () =>
      (
        await api.get<BestMatch[]>('/tours/best-match', {
          params: { shipment_id: shipmentId },
        })
      ).data,
    enabled: !!shipmentId,
    staleTime: 30_000,
  });

  // Best-Match-Vorschlag: erster NV-Match der nicht source-Tour ist
  const suggested = (matchQ.data ?? []).find(
    (m) => m.mode === 'nv' && m.tour_id !== fromTourId,
  );
  useEffect(() => {
    if (suggested && !targetId) setTargetId(suggested.tour_id);
  }, [suggested, targetId]);

  const toursQ = useQuery<NvTourOption[]>({
    queryKey: ['nv-touren', 'all-for-move'],
    queryFn: async () =>
      (await api.get<NvTourOption[]>('/nv-touren')).data,
    staleTime: 30_000,
  });
  const targets = (toursQ.data ?? []).filter((t) => t.id !== fromTourId);

  const mut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(
        `/nv-touren/${fromTourId}/apply-action`,
        {
          action_type: 'MOVE_STOP_TO_TOUR',
          stop_id: stopId,
          target_tour_id: targetId,
        },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', fromTourId] });
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', targetId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-[1100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="font-semibold text-sm">Stop in andere Tour</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X size={16} />
          </button>
        </div>
        <div className="p-3 space-y-2 text-xs">
          {stopLabel && (
            <div className="text-gray-600">
              Stop: <span className="font-mono">{stopLabel}</span>
            </div>
          )}
          {suggested && (
            <div className="text-[10px] text-green-700 inline-flex items-center gap-1">
              <Sparkles size={10} />
              Empfehlung: Score {suggested.score} · {suggested.reason}
            </div>
          )}
          <label className="block">
            <span className="text-gray-600">Ziel-Tour</span>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 w-full border rounded px-2 py-1 text-sm"
            >
              <option value="">— wählen —</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nv_stamm_tour?.code ?? t.id.slice(0, 8)}
                  {t.datum ? ` · ${t.datum.slice(0, 10)}` : ''}
                  {suggested && t.id === suggested.tour_id ? ' ⭐' : ''}
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
            disabled={!targetId || mut.isPending}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {mut.isPending ? 'Verschiebe…' : 'Verschieben'}
          </button>
        </div>
      </div>
    </div>
  );
}

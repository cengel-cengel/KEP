/**
 * C-2 SplitShipmentDialog:
 *
 *   Fetches /shipments/:id and lists shipment_package_items.
 *   User picks ≥1 / ≤items-1 items to MOVE to a new shipment.
 *
 *   POST /nv-touren/:tourId/stops/:stopId/split
 *      body { splitItemIds: string[] }
 *
 *   On success: invalidate tour-detail + close.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Scissors } from 'lucide-react';
import { api } from '../../../lib/api';

interface PackageItem {
  id: string;
  line_index: number;
  package_type: string;
  quantity: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: string | number | null;
}

interface ShipmentDetail {
  id: string;
  shipment_number?: string | null;
  shipment_package_items?: PackageItem[];
}

export default function SplitShipmentDialog({
  tourId,
  stopId,
  shipmentId,
  onClose,
}: {
  tourId: string;
  stopId: string;
  shipmentId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const shipQ = useQuery<ShipmentDetail>({
    queryKey: ['shipments', 'detail', shipmentId],
    queryFn: async () =>
      (await api.get<ShipmentDetail>(`/shipments/${shipmentId}`)).data,
    staleTime: 30_000,
  });

  const items = shipQ.data?.shipment_package_items ?? [];
  const itemCount = items.length;
  const minMet = selected.size >= 1;
  const maxMet = selected.size < itemCount; // must leave ≥1 in original
  const canSubmit = itemCount >= 2 && minMet && maxMet;

  const mut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(
        `/nv-touren/${tourId}/stops/${stopId}/split`,
        { splitItemIds: Array.from(selected) },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', tourId] });
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
      qc.invalidateQueries({ queryKey: ['shipments', 'detail', shipmentId] });
      onClose();
    },
  });

  const toggle = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const summary = useMemo(() => {
    const moveKg = items
      .filter((i) => selected.has(i.id))
      .reduce((acc, i) => acc + Number(i.weight_kg ?? 0), 0);
    const moveCount = items
      .filter((i) => selected.has(i.id))
      .reduce((acc, i) => acc + Number(i.quantity ?? 1), 0);
    return { moveKg, moveCount };
  }, [items, selected]);

  return (
    <div className="fixed inset-0 z-[1100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="font-semibold text-sm inline-flex items-center gap-2">
            <Scissors size={14} />
            Sendung splitten
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3 text-xs space-y-2 overflow-y-auto">
          {shipQ.isLoading && <div className="text-gray-500">Lade Items…</div>}
          {!shipQ.isLoading && itemCount < 2 && (
            <div className="text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1.5">
              Diese Sendung hat nur {itemCount} Item — Splitten benötigt
              mindestens 2 Items.
            </div>
          )}
          {!shipQ.isLoading && itemCount >= 2 && (
            <>
              <div className="text-gray-600">
                Wähle Items die in eine NEUE Sendung wandern sollen
                (mindestens 1, maximal {itemCount - 1}).
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] uppercase text-gray-500 border-b">
                    <th className="w-6"></th>
                    <th className="text-left py-0.5">Line</th>
                    <th className="text-left py-0.5">Typ</th>
                    <th className="text-right py-0.5">Qty</th>
                    <th className="text-right py-0.5">L×B×H</th>
                    <th className="text-right py-0.5">kg</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const isSelected = selected.has(it.id);
                    return (
                      <tr
                        key={it.id}
                        onClick={() => toggle(it.id)}
                        className={`cursor-pointer ${
                          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(it.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="font-mono text-gray-600">
                          {it.line_index}
                        </td>
                        <td className="truncate">{it.package_type}</td>
                        <td className="text-right font-mono">{it.quantity}</td>
                        <td className="text-right font-mono text-[10px]">
                          {it.length_cm}×{it.width_cm}×{it.height_cm}
                        </td>
                        <td className="text-right font-mono">
                          {Math.round(Number(it.weight_kg ?? 0))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selected.size > 0 && (
                <div className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                  → Neue Sendung: {summary.moveCount} pkg ·{' '}
                  {Math.round(summary.moveKg)} kg
                </div>
              )}
              {selected.size === itemCount && itemCount > 0 && (
                <div className="text-[10px] text-red-700">
                  Mindestens 1 Item muss in Original-Sendung verbleiben.
                </div>
              )}
            </>
          )}
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
            disabled={!canSubmit || mut.isPending}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {mut.isPending ? 'Splitte…' : 'Splitten'}
          </button>
        </div>
      </div>
    </div>
  );
}

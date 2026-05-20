/**
 * C-2 + C-2.1 SplitShipmentDialog:
 *
 *   Fetches /shipments/:id and lists shipment_package_items.
 *   User picks Quantity pro Item (0 = item bleibt, > 0 = split).
 *
 *   NV: POST /nv-touren/:tourId/stops/:stopId/split
 *   FV: POST /tours/:tourId/shipments/:shipmentId/split
 *   body { itemSplits: [{ itemId, quantity }] }
 *
 *   On success: invalidate tour-detail + close.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Scissors, Plus, Minus } from 'lucide-react';
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
  mode = 'nv',
  onClose,
}: {
  tourId: string;
  /** Sprint C: NV-stop-id. Bei mode='fv' ignored. */
  stopId?: string;
  shipmentId: string;
  /** Bestimmt Endpoint-URL. Default nv (Sprint C). */
  mode?: 'nv' | 'fv';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  /** Map<itemId, splitQty> — 0 = item bleibt komplett im Original. */
  const [splits, setSplits] = useState<Map<string, number>>(new Map());

  const shipQ = useQuery<ShipmentDetail>({
    queryKey: ['shipments', 'detail', shipmentId],
    queryFn: async () =>
      (await api.get<ShipmentDetail>(`/shipments/${shipmentId}`)).data,
    staleTime: 30_000,
  });

  const items = shipQ.data?.shipment_package_items ?? [];
  const totalQty = items.reduce((acc, i) => acc + (i.quantity ?? 1), 0);
  const splitTotalQty = items.reduce(
    (acc, i) => acc + (splits.get(i.id) ?? 0),
    0,
  );
  const minMet = splitTotalQty >= 1;
  const maxMet = splitTotalQty < totalQty; // mind. 1 muss bleiben
  const canSubmit = totalQty >= 2 && minMet && maxMet;

  const mut = useMutation({
    mutationFn: async () => {
      const itemSplits = items
        .filter((i) => (splits.get(i.id) ?? 0) > 0)
        .map((i) => ({ itemId: i.id, quantity: splits.get(i.id) ?? 0 }));
      const url =
        mode === 'fv'
          ? `/tours/${tourId}/shipments/${shipmentId}/split`
          : `/nv-touren/${tourId}/stops/${stopId}/split`;
      const { data } = await api.post(url, { itemSplits });
      return data;
    },
    onSuccess: () => {
      if (mode === 'fv') {
        qc.invalidateQueries({ queryKey: ['fv-tour-detail', tourId] });
        qc.invalidateQueries({ queryKey: ['fv-touren'] });
      } else {
        qc.invalidateQueries({ queryKey: ['nv-tour-detail', tourId] });
        qc.invalidateQueries({ queryKey: ['nv-touren'] });
      }
      qc.invalidateQueries({ queryKey: ['shipments', 'detail', shipmentId] });
      onClose();
    },
  });

  const setQty = (itemId: string, qty: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, Math.floor(qty)));
    setSplits((cur) => {
      const next = new Map(cur);
      if (clamped === 0) next.delete(itemId);
      else next.set(itemId, clamped);
      return next;
    });
  };

  const summary = useMemo(() => {
    let moveKg = 0;
    for (const i of items) {
      const q = splits.get(i.id) ?? 0;
      if (q === 0) continue;
      const pro = q / (i.quantity || 1);
      moveKg += Number(i.weight_kg ?? 0) * pro;
    }
    return { moveKg, moveCount: splitTotalQty };
  }, [items, splits, splitTotalQty]);

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
          {!shipQ.isLoading && totalQty < 2 && (
            <div className="text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1.5">
              Diese Sendung hat nur {totalQty} Stück gesamt — Splitten
              benötigt mindestens 2.
            </div>
          )}
          {!shipQ.isLoading && totalQty >= 2 && (
            <>
              <div className="text-gray-600">
                Wähle pro Item eine Quantity die in eine NEUE Sendung
                wandern soll (Total: {splitTotalQty}/{totalQty - 1} max).
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] uppercase text-gray-500 border-b">
                    <th className="text-left py-0.5">Line</th>
                    <th className="text-left py-0.5">Typ</th>
                    <th className="text-right py-0.5">Qty</th>
                    <th className="text-right py-0.5">L×B×H</th>
                    <th className="text-right py-0.5">kg</th>
                    <th className="text-center py-0.5 w-24">Split-Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const splitQty = splits.get(it.id) ?? 0;
                    const isActive = splitQty > 0;
                    return (
                      <tr
                        key={it.id}
                        className={isActive ? 'bg-blue-50' : ''}
                      >
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
                        <td>
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                setQty(it.id, splitQty - 1, it.quantity)
                              }
                              disabled={splitQty === 0}
                              className="w-5 h-5 inline-flex items-center justify-center border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-30"
                              aria-label="Weniger"
                            >
                              <Minus size={10} />
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={it.quantity}
                              value={splitQty}
                              onChange={(e) =>
                                setQty(
                                  it.id,
                                  Number(e.target.value),
                                  it.quantity,
                                )
                              }
                              className="w-10 text-center text-xs font-mono border border-gray-300 rounded px-1 py-0.5"
                              aria-label={`Split-Qty für Item ${it.line_index}`}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setQty(it.id, splitQty + 1, it.quantity)
                              }
                              disabled={splitQty >= it.quantity}
                              className="w-5 h-5 inline-flex items-center justify-center border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-30"
                              aria-label="Mehr"
                            >
                              <Plus size={10} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {splitTotalQty > 0 && (
                <div className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                  → Neue Sendung: {summary.moveCount} pkg ·{' '}
                  {Math.round(summary.moveKg)} kg
                </div>
              )}
              {splitTotalQty >= totalQty && (
                <div className="text-[10px] text-red-700">
                  Mindestens 1 Stück muss in Original-Sendung verbleiben.
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

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../../lib/api';

export type CostComponent = {
  id: string;
  shipment_id: string;
  nv_tour_id: string | null;
  phase: string;
  stop_anteil_eur: string | number | null;
  zeit_anteil_eur: string | number | null;
  routing_anteil_eur: string | number | null;
  kapazitaet_anteil_eur: string | number | null;
  total_eur: string | number | null;
  faktoren: {
    stopAnteilFaktor?: number;
    zeitAnteilFaktor?: number;
    routingAnteilFaktor?: number;
    kapazitaetAnteilFaktor?: number;
  } | null;
  tour_total_kosten_eur: string | number | null;
  tour_gesamt_stops: number | null;
  tour_gesamt_minuten: number | null;
  computed_at: string;
};

function n(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

function fmt(v: string | number | null | undefined): string {
  return n(v).toFixed(2);
}

export default function CostDrillDownModal({
  shipmentId,
  shipmentNumber,
  customerName,
  tourId,
  component,
  onClose,
}: {
  shipmentId: string;
  shipmentNumber?: string;
  customerName?: string;
  tourId?: string;
  component?: CostComponent | null;
  onClose: () => void;
}) {
  const detailQ = useQuery<CostComponent[]>({
    queryKey: ['shipment-cost-comp', shipmentId],
    queryFn: async () =>
      (await api.get<CostComponent[]>(`/shipments/${shipmentId}/cost-components`))
        .data,
    enabled: !component && !!shipmentId,
  });

  const c = component ?? (detailQ.data ?? []).find(
    (x) => x.phase === 'VORLAUF' && (!tourId || x.nv_tour_id === tourId),
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold text-gray-800">
              Vorlauf-Kosten {shipmentNumber ?? ''}
            </h2>
            {customerName && (
              <p className="text-xs text-gray-500">{customerName}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {!c && (
            <p className="text-sm text-gray-500">
              Noch keine Cost-Components berechnet.
            </p>
          )}

          {c && (
            <>
              <div className="bg-gray-50 border rounded p-2 text-xs space-y-0.5">
                <div className="text-gray-500 uppercase text-[10px]">
                  Tour-Snapshot
                </div>
                <div>
                  Tour-Kosten: € {fmt(c.tour_total_kosten_eur)}
                </div>
                <div>
                  Stops: {c.tour_gesamt_stops ?? '—'} · Minuten:{' '}
                  {c.tour_gesamt_minuten ?? '—'}
                </div>
              </div>

              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="py-1.5">Stop-Anteil (35%)</td>
                    <td className="py-1.5 text-right font-mono">
                      € {fmt(c.stop_anteil_eur)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5">Zeit-Anteil (25%)</td>
                    <td className="py-1.5 text-right font-mono">
                      € {fmt(c.zeit_anteil_eur)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5">Routing-Anteil (20%)</td>
                    <td className="py-1.5 text-right font-mono">
                      € {fmt(c.routing_anteil_eur)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5">Kapazitäts-Anteil (20%)</td>
                    <td className="py-1.5 text-right font-mono">
                      € {fmt(c.kapazitaet_anteil_eur)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 font-semibold">Total</td>
                    <td className="py-2 text-right font-mono font-semibold text-emerald-700">
                      € {fmt(c.total_eur)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {c.faktoren && (
                <div className="border-t pt-2 text-xs text-gray-600 space-y-0.5">
                  <div className="text-[10px] uppercase text-gray-500">
                    Faktoren
                  </div>
                  <div>
                    Stop-Faktor:{' '}
                    {(c.faktoren.stopAnteilFaktor ?? 0).toFixed(4)}
                  </div>
                  <div>
                    Zeit-Faktor:{' '}
                    {(c.faktoren.zeitAnteilFaktor ?? 0).toFixed(4)}
                  </div>
                  <div>
                    Routing-Faktor:{' '}
                    {(c.faktoren.routingAnteilFaktor ?? 0).toFixed(4)}
                  </div>
                  <div>
                    Kapazitäts-Faktor:{' '}
                    {(c.faktoren.kapazitaetAnteilFaktor ?? 0).toFixed(4)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end border-t px-4 py-3">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

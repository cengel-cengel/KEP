import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import FvQuickAddBar, { type FvScenario } from '../components/fv/FvQuickAddBar';
import CreateFvTourModal, {
  type FvCreateTourPayload,
} from '../components/fv/CreateFvTourModal';
import FvTourCard from '../components/fv/FvTourCard';

interface FvAddress {
  id: string;
  name?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country_code?: string | null;
}

interface FvEligibleShipment {
  id: string;
  shipment_number?: string | null;
  ldm?: string | number | null;
  weight_kg?: string | number | null;
  loading_date?: string | null;
  transport_type?: string | null;
  customer?: { id: string; name: string } | null;
  loading_address?: FvAddress | null;
  delivery_address?: FvAddress | null;
  relation?: { id: string; code: string; name?: string | null } | null;
}

interface FvTourListItem {
  id: string;
  tour_number?: string | null;
  status: string;
  tour_date?: string | null;
  hub_start_address_id?: string | null;
  hub_end_address_id?: string | null;
  subcontractor_id?: string | null;
  subcontractors?: { id: string; name: string } | null;
  shipments?: { id: string }[];
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function fmtAddr(a?: FvAddress | null): string {
  if (!a) return '—';
  const parts = [a.zip, a.city].filter(Boolean).join(' ');
  return parts || a.name || '—';
}

export default function FvDispositionPage() {
  const qc = useQueryClient();
  const [datum, setDatum] = useState(todayIso());
  const [search, setSearch] = useState('');
  const [modalScenario, setModalScenario] = useState<FvScenario | null>(null);

  const eligibleQ = useQuery<FvEligibleShipment[]>({
    queryKey: ['fv-eligible', datum, search],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (datum) params.datum = datum;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get<FvEligibleShipment[]>(
        '/tours/eligible-shipments-fv',
        { params },
      );
      return data;
    },
    staleTime: 30_000,
  });

  const tourenQ = useQuery<FvTourListItem[]>({
    queryKey: ['fv-touren', datum],
    queryFn: async () => {
      const { data } = await api.get<FvTourListItem[]>('/tours', {
        params: { status: 'planned,dispatched', date: datum },
      });
      return data;
    },
    staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: async (payload: FvCreateTourPayload) => {
      const { data } = await api.post('/tours', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fv-touren'] });
      setModalScenario(null);
    },
  });

  const batchMut = useMutation({
    mutationFn: async (input: {
      tourId: string;
      adds?: string[];
      removes?: string[];
    }) => {
      const { data } = await api.post(`/tours/${input.tourId}/batch-stops`, {
        adds: input.adds ?? [],
        removes: input.removes ?? [],
      });
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['fv-touren'] });
      qc.invalidateQueries({ queryKey: ['fv-eligible'] });
      qc.invalidateQueries({ queryKey: ['fv-tour-detail', vars.tourId] });
    },
  });

  const handleDropShipment = (tourId: string, shipmentId: string) => {
    batchMut.mutate({ tourId, adds: [shipmentId] });
  };

  const handleRemoveStop = (tourId: string, shipmentId: string) => {
    batchMut.mutate({ tourId, removes: [shipmentId] });
  };

  const eligible = eligibleQ.data ?? [];
  const touren = tourenQ.data ?? [];

  const sortedTouren = useMemo(
    () =>
      [...touren].sort((a, b) =>
        (a.tour_number ?? '').localeCompare(b.tour_number ?? ''),
      ),
    [touren],
  );

  return (
    <div className="flex flex-col h-full">
      <FvQuickAddBar onCreate={(s) => setModalScenario(s)} />

      <div className="px-4 py-2 flex items-center gap-3 border-b bg-white">
        <div>
          <label className="block text-[10px] font-medium text-gray-500">
            Datum
          </label>
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex-1 max-w-xs">
          <label className="block text-[10px] font-medium text-gray-500">
            Suche
          </label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sendungs-Nr / Kunde"
              className="w-full border rounded pl-7 pr-2 py-1 text-sm"
            />
          </div>
        </div>
        <div className="text-xs text-gray-500 ml-auto">
          {eligible.length} Sendungen · {sortedTouren.length} Touren
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 overflow-hidden">
        <section className="flex flex-col bg-white border rounded-md overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50 font-medium text-sm text-gray-700">
            FV-Sendungen offen
          </div>
          <div className="flex-1 overflow-y-auto divide-y">
            {eligibleQ.isLoading && (
              <div className="p-3 text-xs text-gray-400">Lädt...</div>
            )}
            {!eligibleQ.isLoading && eligible.length === 0 && (
              <div className="p-3 text-xs text-gray-400 italic">
                Keine offenen FV-Sendungen.
              </div>
            )}
            {eligible.map((s) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    'application/x-fv-shipment-id',
                    s.id,
                  );
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className="px-3 py-2 text-xs hover:bg-blue-50 cursor-grab active:cursor-grabbing"
                title="Auf Tour ziehen"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-gray-800">
                    {s.shipment_number ?? '—'}
                  </span>
                  {s.relation?.code && (
                    <span className="text-[10px] px-1 py-0.5 bg-gray-100 rounded text-gray-600 font-mono">
                      {s.relation.code}
                    </span>
                  )}
                  <span className="ml-auto text-gray-500">
                    {s.ldm != null ? `${Number(s.ldm).toFixed(1)} ldm` : ''}
                  </span>
                </div>
                <div className="text-gray-600 truncate">
                  {s.customer?.name ?? '—'}
                </div>
                <div className="text-gray-500 truncate">
                  {fmtAddr(s.loading_address)} → {fmtAddr(s.delivery_address)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col overflow-hidden">
          <div className="px-1 py-1 font-medium text-sm text-gray-700">
            FV-Touren ({sortedTouren.length})
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {tourenQ.isLoading && (
              <div className="p-3 text-xs text-gray-400">Lädt...</div>
            )}
            {!tourenQ.isLoading && sortedTouren.length === 0 && (
              <div className="p-3 text-xs text-gray-400 italic">
                Keine Touren für dieses Datum. Quick-Add oben.
              </div>
            )}
            {sortedTouren.map((t) => (
              <FvTourCard
                key={t.id}
                tourId={t.id}
                tourNumber={t.tour_number}
                status={t.status}
                onDropShipment={handleDropShipment}
                onRemoveStop={handleRemoveStop}
              />
            ))}
          </div>
        </section>
      </div>

      {modalScenario && (
        <CreateFvTourModal
          scenario={modalScenario}
          initialDate={datum}
          onClose={() => setModalScenario(null)}
          onCreate={(payload) => createMut.mutate(payload)}
          saving={createMut.isPending}
        />
      )}
    </div>
  );
}

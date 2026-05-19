import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import FvQuickAddBar, { type FvScenario } from '../components/fv/FvQuickAddBar';
import CreateFvTourModal, {
  type FvCreateTourPayload,
} from '../components/fv/CreateFvTourModal';
import FvTourCard from '../components/fv/FvTourCard';
import FvShipmentTree from '../components/fv/FvShipmentTree';

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

export default function FvDispositionPage() {
  const qc = useQueryClient();
  const [datum, setDatum] = useState(todayIso());
  const [search, setSearch] = useState('');
  const [modalScenario, setModalScenario] = useState<FvScenario | null>(null);
  const [pendingBulk, setPendingBulk] = useState<{
    shipmentIds: string[];
    label: string;
  } | null>(null);
  // Verhindert doppelt-Trigger des batchMut (createMut.onSuccess + Re-Render).
  const bulkClaimedRef = useRef(false);

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
      const { data } = await api.post<{ id: string }>('/tours', payload);
      return data;
    },
    onSuccess: (tour) => {
      qc.invalidateQueries({ queryKey: ['fv-touren'] });
      if (
        pendingBulk &&
        pendingBulk.shipmentIds.length > 0 &&
        !bulkClaimedRef.current &&
        tour?.id
      ) {
        bulkClaimedRef.current = true;
        batchMut.mutate({ tourId: tour.id, adds: pendingBulk.shipmentIds });
      }
      setModalScenario(null);
      setPendingBulk(null);
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

  const handleBulkAdd = (shipmentIds: string[], label: string) => {
    setPendingBulk({ shipmentIds, label });
    bulkClaimedRef.current = false;
    setModalScenario('OHNE_LAGER');
  };

  return (
    <div className="flex flex-col h-full">
      <FvQuickAddBar
        onCreate={(s) => {
          setPendingBulk(null);
          bulkClaimedRef.current = false;
          setModalScenario(s);
        }}
      />

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
          <div className="flex-1 overflow-y-auto">
            {eligibleQ.isLoading && (
              <div className="p-3 text-xs text-gray-400">Lädt...</div>
            )}
            {!eligibleQ.isLoading && (
              <FvShipmentTree
                shipments={eligible}
                onBulkAdd={handleBulkAdd}
              />
            )}
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
          initialShipmentIds={pendingBulk?.shipmentIds}
          initialLabel={pendingBulk?.label}
          onClose={() => {
            setModalScenario(null);
            setPendingBulk(null);
          }}
          onCreate={(payload) => createMut.mutate(payload)}
          saving={createMut.isPending}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import DispositionMap from '../components/DispositionMap';
import { api } from '../lib/api';
import type { ShipmentMapItem } from '../types/shipment';
import type { Tour } from '../types/tour';

const TRANSPORT_TYPE_OPTIONS = [
  { value: '', label: 'Alle' },
  { value: 'DIREKT', label: 'Direktsendung' },
  { value: 'DIREKT_UMSCHLAG', label: 'Direkt+Umschlag' },
  { value: 'SAMMELGUT', label: 'Sammelgut' },
  { value: 'ABHOLUNG_UMSCHLAG', label: 'Abholung+Umschlag' },
  { value: 'BEILADER', label: 'Beilader' },
  { value: 'SONDER', label: 'Sonderfahrt' },
  { value: 'SELBST', label: 'Selbstanlieferung' },
] as const;

const STATUS_OPTIONS = [
  { value: '', label: 'Alle' },
  { value: 'new', label: 'Neu' },
  { value: 'dispatched', label: 'Disponiert' },
  { value: 'in_transit', label: 'Unterwegs' },
  { value: 'delivered', label: 'Zugestellt' },
] as const;

function buildShipmentParams(filters: { transportType: string; status: string }) {
  const params: Record<string, string> = {};
  if (filters.transportType) params.transportType = filters.transportType;
  if (filters.status) params.status = filters.status;
  return params;
}

export default function MapPage() {
  const navigate = useNavigate();
  const [filterTransportType, setFilterTransportType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ transportType: filterTransportType, status: filterStatus }),
    [filterTransportType, filterStatus],
  );

  const { data: shipments = [], isLoading, isError } = useQuery({
    queryKey: ['shipments', 'map', filters.transportType, filters.status],
    queryFn: async () => {
      const { data } = await api.get<ShipmentMapItem[]>('/shipments/map', {
        params: buildShipmentParams(filters),
      });
      return data;
    },
  });

  const { data: tours = [] } = useQuery({
    queryKey: ['tours'],
    queryFn: async () => {
      const { data } = await api.get<Tour[]>('/tours');
      return data;
    },
  });

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const data = e.data as { type?: string; shipmentId?: string | null; tourId?: string | null };
      if (data?.type === 'SELECT_SHIPMENT') {
        setSelectedId(data.shipmentId ?? null);
      }
      if (data?.type === 'SELECT_TOUR') {
        setSelectedTourId(data.tourId ?? null);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  function handleBack() {
    // Works if window opened via window.open
    window.close();
    // Fallback if not closable
    navigate('/disposition');
  }

  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden' }} className="bg-white flex flex-col">
      <div style={{ height: '60px' }} className="shrink-0 border-b border-gray-200 bg-white px-4 flex items-center justify-between gap-4">
        <div className="font-semibold text-gray-900">
          KED Global Logistics – Kartenansicht
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 whitespace-nowrap">Transportart:</span>
            <select
              value={filterTransportType}
              onChange={(e) => setFilterTransportType(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
            >
              {TRANSPORT_TYPE_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 whitespace-nowrap">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleBack}
            className="px-3 py-2 bg-white border border-gray-300 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Zurück zur Disposition
          </button>
        </div>
      </div>

      <div style={{ height: 'calc(100vh - 60px)', width: '100%' }} className="p-3">
        {isLoading ? (
          <div className="h-full flex items-center justify-center bg-gray-100 rounded-lg">
            <div className="animate-spin h-10 w-10 border-2 border-[#1e40af] border-t-transparent rounded-full" />
          </div>
        ) : isError ? (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700">
            Fehler beim Laden der Karte.
          </div>
        ) : (
          <DispositionMap
            shipments={shipments}
            tours={tours}
            selectedId={selectedId}
            selectedTourId={selectedTourId}
            onSelect={setSelectedId}
          />
        )}
      </div>
    </div>
  );
}


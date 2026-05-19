import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../../lib/api';
import type { FvScenario } from './FvQuickAddBar';

export interface FvCreateTourPayload {
  tourDate: string;
  tourNumber?: string;
  maxLdm?: number;
  comment?: string;
  hubStartAddressId?: string | null;
  hubEndAddressId?: string | null;
  subcontractorId?: string | null;
}

interface DefaultWarehouse {
  id: string;
  address_id: string;
  name?: string | null;
}

interface Subcontractor {
  id: string;
  name: string;
  aktiv?: boolean | null;
}

const SCENARIO_LABEL: Record<FvScenario, string> = {
  MIT_LAGER: 'Mit Lager (Hub-Start = Hub-End = Standard-Lager)',
  OHNE_LAGER: 'Ohne Lager (Direktverkehr)',
  BESCHAFFUNG_EXTERN: 'Beschaffung extern → Lager',
  NACHLAUF_EXTERN: 'Lager → Nachlauf extern',
};

export default function CreateFvTourModal({
  scenario,
  initialDate,
  initialShipmentIds,
  initialLabel,
  onClose,
  onCreate,
  saving,
}: {
  scenario: FvScenario;
  initialDate: string;
  /** Sendungen die NACH tour-create per batch-stops zugeordnet
   *  werden. Display-Hint im Modal. Parent triggert batchMut. */
  initialShipmentIds?: string[];
  /** Anzeige-Label (z.B. "🇩🇪 → 🇫🇷"). */
  initialLabel?: string;
  onClose: () => void;
  onCreate: (payload: FvCreateTourPayload) => void;
  saving: boolean;
}) {
  const [tourDate, setTourDate] = useState(initialDate);
  const [tourNumber, setTourNumber] = useState('');
  const [maxLdm, setMaxLdm] = useState<number | null>(13.6);
  const [comment, setComment] = useState('');
  const [subcontractorId, setSubcontractorId] = useState('');

  const whQ = useQuery<DefaultWarehouse | null>({
    queryKey: ['warehouses', 'default'],
    queryFn: async () => {
      const { data } = await api.get<DefaultWarehouse | null>(
        '/warehouses/default',
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });

  const subsQ = useQuery<Subcontractor[]>({
    queryKey: ['subcontractors'],
    queryFn: async () =>
      (await api.get<Subcontractor[]>('/subcontractors')).data,
    staleTime: 5 * 60_000,
  });
  const subs = (subsQ.data ?? []).filter((s) => s.aktiv !== false);

  const needsDefaultWh =
    scenario === 'MIT_LAGER' ||
    scenario === 'BESCHAFFUNG_EXTERN' ||
    scenario === 'NACHLAUF_EXTERN';
  const whAddressId = whQ.data?.address_id ?? null;
  const whMissing = needsDefaultWh && !whAddressId && !whQ.isLoading;

  useEffect(() => {
    if (whMissing) {
      // eslint-disable-next-line no-console
      console.warn(
        '[CreateFvTourModal] Kein Standard-Lager hinterlegt — Hub-Felder bleiben leer.',
      );
    }
  }, [whMissing]);

  const handleCreate = () => {
    if (!tourDate) return;
    let hubStart: string | null = null;
    let hubEnd: string | null = null;
    if (scenario === 'MIT_LAGER' && whAddressId) {
      hubStart = whAddressId;
      hubEnd = whAddressId;
    } else if (scenario === 'BESCHAFFUNG_EXTERN' && whAddressId) {
      hubEnd = whAddressId;
    } else if (scenario === 'NACHLAUF_EXTERN' && whAddressId) {
      hubStart = whAddressId;
    }
    onCreate({
      tourDate,
      tourNumber: tourNumber.trim() || undefined,
      maxLdm: maxLdm ?? undefined,
      comment: comment.trim() || undefined,
      hubStartAddressId: hubStart,
      hubEndAddressId: hubEnd,
      subcontractorId: subcontractorId || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-800">Neue FV-Tour</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-xs text-gray-500 bg-gray-50 border rounded px-2 py-1.5">
            Szenario: <strong>{SCENARIO_LABEL[scenario]}</strong>
          </div>
          {initialShipmentIds && initialShipmentIds.length > 0 && (
            <div className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
              {initialShipmentIds.length} Sendung
              {initialShipmentIds.length === 1 ? '' : 'en'}
              {initialLabel ? ` (${initialLabel})` : ''} werden nach
              Anlegen direkt zugeordnet.
            </div>
          )}
          {whMissing && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              Achtung: Kein Standard-Lager hinterlegt. Hub-Adressen
              bleiben leer.
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Datum *
            </label>
            <input
              type="date"
              value={tourDate}
              onChange={(e) => setTourDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tour-Nummer (optional)
            </label>
            <input
              type="text"
              value={tourNumber}
              onChange={(e) => setTourNumber(e.target.value)}
              placeholder="leer = autom. T-Timestamp"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Max LDM
            </label>
            <input
              type="number"
              min={0}
              step="0.1"
              value={maxLdm ?? ''}
              onChange={(e) =>
                setMaxLdm(e.target.value === '' ? null : Number(e.target.value))
              }
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Subunternehmer
            </label>
            <select
              value={subcontractorId}
              onChange={(e) => setSubcontractorId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">— keiner —</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Kommentar
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleCreate}
            disabled={!tourDate || saving}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Lege an...' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}

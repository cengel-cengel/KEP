import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, X } from 'lucide-react';
import { api } from '../../lib/api';
import SubcontractorPicker from '../dialogs/SubcontractorPicker';

export interface CreateTourStammTour {
  id: string;
  code: string;
  name: string;
  default_subunternehmer_id?: string | null;
}

export interface CreateTourPayload {
  stamm_tour_id: string;
  subunternehmer_id: string | null;
  angefahrene_km: number | null;
  stunden_geleistet: number | null;
  kosten?: {
    fahrer: number | null;
    fahrzeug: number;
    kraftstoff: number;
    dispo: number;
    sonstige: number;
  };
}

interface SubFull {
  id: string;
  name: string;
  tarif_typ: string;
  tarif_tagespauschale_eur: string | number | null;
  tarif_pro_stop_eur: string | number | null;
  tarif_pro_km_eur: string | number | null;
  tarif_grundgebuehr_eur: string | number | null;
  tarif_pro_stunde_eur: string | number | null;
  aktiv?: boolean;
}

const TOUR_KOSTEN_DEFAULTS = {
  fahrzeug: 90,
  kraftstoff: 70,
  dispo: 30,
  sonstige: 10,
};

function computeFahrer(
  sub: SubFull | null | undefined,
  stops: number,
  km: number | null,
  stunden: number | null,
): number | null {
  if (!sub) return null;
  const num = (v: string | number | null) =>
    v === null || v === undefined ? 0 : Number(v);
  if (sub.tarif_typ === 'TAGESPAUSCHALE') {
    return num(sub.tarif_tagespauschale_eur) || null;
  }
  if (sub.tarif_typ === 'PRO_STOP') {
    return (num(sub.tarif_pro_stop_eur) || 0) * Math.max(1, stops);
  }
  if (sub.tarif_typ === 'KM_BASIERT') {
    if (km == null) return null;
    return num(sub.tarif_grundgebuehr_eur) + num(sub.tarif_pro_km_eur) * km;
  }
  if (sub.tarif_typ === 'STUNDEN_BASIERT') {
    if (stunden == null) return null;
    return num(sub.tarif_pro_stunde_eur) * stunden;
  }
  return null;
}

export default function CreateTourModal({
  stammTouren,
  onClose,
  onCreate,
  saving,
}: {
  stammTouren: CreateTourStammTour[];
  onClose: () => void;
  onCreate: (payload: CreateTourPayload) => void;
  saving: boolean;
}) {
  const [stammTourId, setStammTourId] = useState('');
  const [subId, setSubId] = useState<string>('');
  const [km, setKm] = useState<number | null>(null);
  const [stunden, setStunden] = useState<number | null>(null);
  const [subPickerOpen, setSubPickerOpen] = useState(false);

  const subsQ = useQuery<SubFull[]>({
    queryKey: ['nv-subunternehmer', 'all-active'],
    queryFn: async () =>
      (await api.get<SubFull[]>('/nv-subunternehmer')).data.filter(
        (s) => s.aktiv !== false,
      ),
  });
  const subs = subsQ.data ?? [];
  const selectedSub = subs.find((s) => s.id === subId) ?? null;

  const stamm = stammTouren.find((s) => s.id === stammTourId) ?? null;
  useEffect(() => {
    if (!subId && stamm?.default_subunternehmer_id) {
      setSubId(stamm.default_subunternehmer_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stammTourId, stamm?.default_subunternehmer_id]);

  const handleCreate = () => {
    if (!stammTourId) return;
    const fahrer = computeFahrer(selectedSub, 0, km, stunden);
    const hasTarif =
      selectedSub && selectedSub.tarif_typ !== 'SPOT' && fahrer !== null;
    onCreate({
      stamm_tour_id: stammTourId,
      subunternehmer_id: subId || null,
      angefahrene_km: km,
      stunden_geleistet: stunden,
      kosten: hasTarif
        ? {
            fahrer,
            fahrzeug: TOUR_KOSTEN_DEFAULTS.fahrzeug,
            kraftstoff: TOUR_KOSTEN_DEFAULTS.kraftstoff,
            dispo: TOUR_KOSTEN_DEFAULTS.dispo,
            sonstige: TOUR_KOSTEN_DEFAULTS.sonstige,
          }
        : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-800">Neue NV-Tour</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Stamm-Tour *
            </label>
            <select
              value={stammTourId}
              onChange={(e) => setStammTourId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">— bitte wählen —</option>
              {stammTouren.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} – {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Subunternehmer
            </label>
            <div className="flex gap-2 items-center">
              <select
                value={subId}
                onChange={(e) => setSubId(e.target.value)}
                className="flex-1 border rounded px-3 py-2 text-sm"
              >
                <option value="">— keiner —</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.tarif_typ})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSubPickerOpen(true)}
                className="text-xs px-2 py-2 border border-gray-300 rounded hover:bg-gray-50 inline-flex items-center gap-1"
                title="Subs nach Umkreis filtern"
              >
                <MapPin size={12} />
                Umkreis…
              </button>
            </div>
          </div>
          {subPickerOpen && (
            <SubcontractorPicker
              mode="nv"
              currentSubId={null}
              onPick={(id) => {
                setSubId(id);
                setSubPickerOpen(false);
              }}
              onClose={() => setSubPickerOpen(false)}
            />
          )}
          {selectedSub?.tarif_typ === 'KM_BASIERT' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Angefahrene KM
              </label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={km ?? ''}
                onChange={(e) =>
                  setKm(e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          )}
          {selectedSub?.tarif_typ === 'STUNDEN_BASIERT' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Geleistete Stunden
              </label>
              <input
                type="number"
                min={0}
                step="0.25"
                value={stunden ?? ''}
                onChange={(e) =>
                  setStunden(
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          )}
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
            disabled={!stammTourId || saving}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Lege an...' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}

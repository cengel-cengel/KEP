import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../lib/api';

type Subunternehmer = {
  id: string;
  name: string;
  tarif_typ: string;
  tarif_pro_stop_eur: string | number | null;
  tarif_tagespauschale_eur: string | number | null;
};
type Tour = {
  id: string;
  datum: string;
  status: string;
  fahrer_kosten_eur: string | number | null;
  fahrzeug_kosten_eur: string | number | null;
  kraftstoff_kosten_eur: string | number | null;
  dispo_kosten_eur: string | number | null;
  sonstige_kosten_eur: string | number | null;
  total_kosten_eur: string | number | null;
  notizen: string | null;
  subunternehmer_id: string | null;
  nv_stamm_tour?: { code: string } | null;
  subunternehmer?: { id: string; name: string } | null;
  stops?: { id: string }[];
};

const DEFAULTS = {
  fahrzeug: 90,
  kraftstoff: 70,
  dispo: 30,
  sonstige: 10,
};

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function NvTourKostenModal({
  tour,
  onClose,
}: {
  tour: Tour;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const stopCount = tour.stops?.length ?? 0;

  const [fahrer, setFahrer] = useState<number | null>(
    toNum(tour.fahrer_kosten_eur),
  );
  const [fahrzeug, setFahrzeug] = useState<number | null>(
    toNum(tour.fahrzeug_kosten_eur) ?? DEFAULTS.fahrzeug,
  );
  const [kraftstoff, setKraftstoff] = useState<number | null>(
    toNum(tour.kraftstoff_kosten_eur) ?? DEFAULTS.kraftstoff,
  );
  const [dispo, setDispo] = useState<number | null>(
    toNum(tour.dispo_kosten_eur) ?? DEFAULTS.dispo,
  );
  const [sonstige, setSonstige] = useState<number | null>(
    toNum(tour.sonstige_kosten_eur) ?? DEFAULTS.sonstige,
  );
  const [notizen, setNotizen] = useState(tour.notizen ?? '');

  const subQ = useQuery<Subunternehmer | null>({
    queryKey: ['nv-subunternehmer', tour.subunternehmer_id],
    queryFn: async () => {
      if (!tour.subunternehmer_id) return null;
      return (
        await api.get<Subunternehmer>(
          `/nv-subunternehmer/${tour.subunternehmer_id}`,
        )
      ).data;
    },
    enabled: !!tour.subunternehmer_id,
  });

  const total = useMemo(
    () =>
      (fahrer ?? 0) +
      (fahrzeug ?? 0) +
      (kraftstoff ?? 0) +
      (dispo ?? 0) +
      (sonstige ?? 0),
    [fahrer, fahrzeug, kraftstoff, dispo, sonstige],
  );

  const saveMut = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/nv-touren/${tour.id}`, {
          fahrer_kosten_eur: fahrer,
          fahrzeug_kosten_eur: fahrzeug,
          kraftstoff_kosten_eur: kraftstoff,
          dispo_kosten_eur: dispo,
          sonstige_kosten_eur: sonstige,
          notizen,
        })
      ).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['nv-touren'] });
      onClose();
    },
  });

  const sub = subQ.data;
  const canApplyTarif =
    !!sub &&
    (sub.tarif_typ === 'TAGESPAUSCHALE' || sub.tarif_typ === 'PRO_STOP');

  const applyTarif = () => {
    if (!sub) return;
    if (sub.tarif_typ === 'TAGESPAUSCHALE') {
      const v = toNum(sub.tarif_tagespauschale_eur);
      if (v !== null) setFahrer(v);
    } else if (sub.tarif_typ === 'PRO_STOP') {
      const proStop = toNum(sub.tarif_pro_stop_eur);
      if (proStop !== null) setFahrer(proStop * Math.max(1, stopCount));
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold text-gray-800">Tour-Kosten</h2>
            <p className="text-xs text-gray-500">
              {tour.nv_stamm_tour?.code ?? '—'} · {tour.datum.slice(0, 10)} ·{' '}
              {stopCount} Stops
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-gray-50 border rounded p-2 text-sm">
            <div className="text-xs text-gray-500 uppercase">
              Subunternehmer
            </div>
            <div className="font-medium">
              {sub ? sub.name : tour.subunternehmer?.name ?? '— keiner —'}
            </div>
            {sub && (
              <div className="text-xs text-gray-600 mt-1">
                Tarif: {sub.tarif_typ}
                {sub.tarif_typ === 'TAGESPAUSCHALE' &&
                  sub.tarif_tagespauschale_eur != null &&
                  ` · ${Number(sub.tarif_tagespauschale_eur).toFixed(2)} €/Tag`}
                {sub.tarif_typ === 'PRO_STOP' &&
                  sub.tarif_pro_stop_eur != null &&
                  ` · ${Number(sub.tarif_pro_stop_eur).toFixed(2)} €/Stop`}
              </div>
            )}
            <button
              type="button"
              onClick={applyTarif}
              disabled={!canApplyTarif}
              className="mt-2 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
            >
              Tarif übernehmen
            </button>
          </div>

          <KostenInput
            label="Fahrerkosten"
            value={fahrer}
            onChange={setFahrer}
          />
          <KostenInput
            label="Fahrzeugkosten"
            value={fahrzeug}
            onChange={setFahrzeug}
          />
          <KostenInput
            label="Kraftstoff/Energie"
            value={kraftstoff}
            onChange={setKraftstoff}
          />
          <KostenInput
            label="Disposition"
            value={dispo}
            onChange={setDispo}
          />
          <KostenInput
            label="Sonstige"
            value={sonstige}
            onChange={setSonstige}
          />

          <div className="border-t pt-2 flex items-center justify-between text-sm">
            <span className="font-medium">Gesamt</span>
            <span className="font-mono font-semibold">
              {total.toFixed(2)} €
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notizen
            </label>
            <textarea
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
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
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saveMut.isPending ? 'Speichere...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

function KostenInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm flex-1">{label}</label>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }
        className="w-32 border rounded px-2 py-1 text-sm text-right font-mono"
      />
      <span className="text-sm text-gray-500">€</span>
    </div>
  );
}

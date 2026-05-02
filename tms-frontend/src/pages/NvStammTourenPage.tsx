import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';

type TourGebiet = { id: string; code: string; name: string };
type Subunternehmer = { id: string; name: string };
type StammTour = {
  id: string;
  code: string;
  name: string;
  nv_tour_gebiet_id: string;
  default_subunternehmer_id: string | null;
  wochentage: string[];
  start_zeit: string | null;
  fahrzeug_typ: string | null;
  aktiv: boolean;
  nv_tour_gebiet?: TourGebiet;
  default_subunternehmer?: Subunternehmer | null;
};

const WOCHENTAGE = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'] as const;
const FAHRZEUG_TYPEN = ['TRANSPORTER', '7_5T', '12T', '18T', '40T'];

function emptyForm(): Partial<StammTour> {
  return {
    code: '',
    name: '',
    nv_tour_gebiet_id: '',
    default_subunternehmer_id: null,
    wochentage: ['MO', 'DI', 'MI', 'DO', 'FR'],
    start_zeit: '07:00',
    fahrzeug_typ: '7_5T',
    aktiv: true,
  };
}

export default function NvStammTourenPage() {
  const qc = useQueryClient();
  const [filterTour, setFilterTour] = useState<string>('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const tourQ = useQuery<TourGebiet[]>({
    queryKey: ['nv-tour-gebiete'],
    queryFn: async () => (await api.get<TourGebiet[]>('/nv-tour-gebiete')).data,
  });
  const subQ = useQuery<Subunternehmer[]>({
    queryKey: ['nv-subunternehmer'],
    queryFn: async () =>
      (await api.get<Subunternehmer[]>('/nv-subunternehmer')).data,
  });
  const stammQ = useQuery<StammTour[]>({
    queryKey: ['nv-stamm-touren', filterTour],
    queryFn: async () => {
      const params = filterTour ? { nv_tour_gebiet_id: filterTour } : {};
      return (await api.get<StammTour[]>('/nv-stamm-touren', { params })).data;
    },
  });

  const filtered = useMemo(() => {
    const list = stammQ.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (t) =>
        t.code.toLowerCase().includes(s) ||
        t.name.toLowerCase().includes(s) ||
        (t.nv_tour_gebiet?.code ?? '').toLowerCase().includes(s),
    );
  }, [stammQ.data, search]);

  const editing = useMemo(
    () => stammQ.data?.find((s) => s.id === editingId) ?? null,
    [stammQ.data, editingId],
  );

  const createMut = useMutation({
    mutationFn: async (payload: Partial<StammTour>) =>
      (await api.post('/nv-stamm-touren', payload)).data,
    onSuccess: async () =>
      qc.invalidateQueries({ queryKey: ['nv-stamm-touren'] }),
  });
  const updateMut = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<StammTour> }) =>
      (await api.patch(`/nv-stamm-touren/${input.id}`, input.patch)).data,
    onSuccess: async () =>
      qc.invalidateQueries({ queryKey: ['nv-stamm-touren'] }),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/nv-stamm-touren/${id}`)).data,
    onSuccess: async () =>
      qc.invalidateQueries({ queryKey: ['nv-stamm-touren'] }),
  });

  const toggleAktiv = (s: StammTour) =>
    updateMut.mutate({ id: s.id, patch: { aktiv: !s.aktiv } });

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">NV-Stamm-Touren</h1>
          <p className="text-sm text-gray-500 mt-1">
            {stammQ.data?.length ?? 0} Stamm-Touren
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={filterTour}
            onChange={(e) => setFilterTour(e.target.value)}
            className="border border-gray-300 rounded px-2 py-2 text-sm"
          >
            <option value="">Alle Tour-Gebiete</option>
            {(tourQ.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.code}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche Code/Name/Gebiet..."
            className="border border-gray-300 rounded px-3 py-2 text-sm w-56"
          />
          <button
            onClick={() => setCreating(true)}
            className="bg-blue-600 text-white text-sm rounded px-3 py-2 flex items-center gap-1 hover:bg-blue-700"
          >
            <Plus size={16} />
            Neu
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Code
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Name
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Tour-Gebiet
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Wochentage
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Start
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Subunternehmer
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Status
              </th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {stammQ.isLoading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  Lade...
                </td>
              </tr>
            )}
            {!stammQ.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  Keine Stamm-Touren.
                </td>
              </tr>
            )}
            {filtered.map((t) => (
              <tr key={t.id} className="border-b border-gray-100">
                <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {t.nv_tour_gebiet?.code ?? '—'}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {t.wochentage.join(', ')}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {t.start_zeit ?? '—'}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {t.default_subunternehmer?.name ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      t.aktiv
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {t.aktiv ? 'aktiv' : 'inaktiv'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => toggleAktiv(t)}
                    className="text-gray-500 hover:text-gray-700 mr-2"
                    title={t.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                  >
                    <Power size={16} />
                  </button>
                  <button
                    onClick={() => setEditingId(t.id)}
                    className="text-blue-600 hover:text-blue-800 mr-2"
                    title="Bearbeiten"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Stamm-Tour "${t.code}" löschen?`))
                        deleteMut.mutate(t.id);
                    }}
                    className="text-red-600 hover:text-red-800"
                    title="Löschen"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <StammTourModal
          initial={editing ?? emptyForm()}
          tourGebiete={tourQ.data ?? []}
          subunternehmer={subQ.data ?? []}
          onClose={() => {
            setEditingId(null);
            setCreating(false);
          }}
          onSave={async (patch) => {
            if (editing) {
              await updateMut.mutateAsync({ id: editing.id, patch });
              setEditingId(null);
            } else {
              await createMut.mutateAsync(patch);
              setCreating(false);
            }
          }}
          saving={createMut.isPending || updateMut.isPending}
          isCreate={creating}
        />
      )}
    </div>
  );
}

function StammTourModal({
  initial,
  tourGebiete,
  subunternehmer,
  onClose,
  onSave,
  saving,
  isCreate,
}: {
  initial: Partial<StammTour>;
  tourGebiete: TourGebiet[];
  subunternehmer: Subunternehmer[];
  onClose: () => void;
  onSave: (patch: Partial<StammTour>) => void;
  saving: boolean;
  isCreate: boolean;
}) {
  const [form, setForm] = useState<Partial<StammTour>>(initial);

  const update = <K extends keyof StammTour>(
    k: K,
    v: StammTour[K] | null,
  ) => setForm((f) => ({ ...f, [k]: v }));

  const toggleTag = (tag: string) => {
    const cur = new Set(form.wochentage ?? []);
    if (cur.has(tag)) cur.delete(tag);
    else cur.add(tag);
    setForm((f) => ({
      ...f,
      wochentage: [...cur].sort((a, b) =>
        WOCHENTAGE.indexOf(a as any) - WOCHENTAGE.indexOf(b as any),
      ),
    }));
  };

  const handleSave = () => {
    if (!form.code?.trim()) return alert('Code ist Pflichtfeld');
    if (!form.name?.trim()) return alert('Name ist Pflichtfeld');
    if (!form.nv_tour_gebiet_id) return alert('Tour-Gebiet ist Pflichtfeld');
    if (!form.wochentage || form.wochentage.length === 0)
      return alert('Mindestens 1 Wochentag waehlen');

    onSave({
      code: form.code,
      name: form.name,
      nv_tour_gebiet_id: form.nv_tour_gebiet_id,
      default_subunternehmer_id: form.default_subunternehmer_id ?? null,
      wochentage: form.wochentage,
      start_zeit: form.start_zeit ?? null,
      fahrzeug_typ: form.fahrzeug_typ ?? null,
      aktiv: form.aktiv ?? true,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-800">
            {isCreate ? 'Neue Stamm-Tour' : 'Stamm-Tour bearbeiten'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Code *
            </label>
            <input
              type="text"
              value={form.code ?? ''}
              onChange={(e) => update('code', e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={form.name ?? ''}
              onChange={(e) => update('name', e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tour-Gebiet *
            </label>
            <select
              value={form.nv_tour_gebiet_id ?? ''}
              onChange={(e) => update('nv_tour_gebiet_id', e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">— bitte wählen —</option>
              {tourGebiete.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} – {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Default-Subunternehmer
            </label>
            <select
              value={form.default_subunternehmer_id ?? ''}
              onChange={(e) =>
                update('default_subunternehmer_id', e.target.value || null)
              }
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">— Keiner —</option>
              {subunternehmer.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Wochentage *
            </label>
            <div className="flex flex-wrap gap-1">
              {WOCHENTAGE.map((w) => {
                const active = (form.wochentage ?? []).includes(w);
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => toggleTag(w)}
                    className={`px-2 py-1 text-xs rounded border ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Start-Zeit (HH:MM)
            </label>
            <input
              type="time"
              value={form.start_zeit ?? ''}
              onChange={(e) => update('start_zeit', e.target.value || null)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Fahrzeug-Typ
            </label>
            <select
              value={form.fahrzeug_typ ?? ''}
              onChange={(e) => update('fahrzeug_typ', e.target.value || null)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">— Keines —</option>
              {FAHRZEUG_TYPEN.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.aktiv ?? true}
              onChange={(e) => update('aktiv', e.target.checked)}
            />
            <span className="text-sm">Aktiv</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Speichere...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';

type TourGebiet = { id: string; code: string; name: string };
type Subunternehmer = {
  id: string;
  name: string;
  nv_tour_gebiet_id: string | null;
  business_partner_id: string | null;
  tarif_typ: string;
  tarif_pro_stop_eur: string | number | null;
  tarif_tagespauschale_eur: string | number | null;
  fahrzeug_typ: string | null;
  notiz: string | null;
  aktiv: boolean;
  nv_tour_gebiet?: TourGebiet | null;
  business_partner?: {
    id: string;
    partner_number: string;
    name: string;
  } | null;
};

const TARIF_TYPEN = [
  { value: 'TAGESPAUSCHALE', label: 'Tagespauschale' },
  { value: 'PRO_STOP', label: 'Pro Stop' },
  { value: 'SPOT', label: 'Spot' },
];
const FAHRZEUG_TYPEN = ['TRANSPORTER', '7_5T', '12T', '18T', '40T'];

function emptyForm(): Partial<Subunternehmer> {
  return {
    name: '',
    nv_tour_gebiet_id: null,
    tarif_typ: 'TAGESPAUSCHALE',
    tarif_tagespauschale_eur: 280,
    fahrzeug_typ: '7_5T',
    aktiv: true,
  };
}

export default function NvSubunternehmerPage() {
  const qc = useQueryClient();
  const [filterTour, setFilterTour] = useState<string>('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const subQ = useQuery<Subunternehmer[]>({
    queryKey: ['nv-subunternehmer', filterTour],
    queryFn: async () => {
      const params = filterTour ? { nv_tour_gebiet_id: filterTour } : {};
      return (await api.get<Subunternehmer[]>('/nv-subunternehmer', { params }))
        .data;
    },
  });
  const tourQ = useQuery<TourGebiet[]>({
    queryKey: ['nv-tour-gebiete'],
    queryFn: async () => (await api.get<TourGebiet[]>('/nv-tour-gebiete')).data,
  });

  const filtered = useMemo(() => {
    const list = subQ.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (sub) =>
        sub.name.toLowerCase().includes(s) ||
        (sub.nv_tour_gebiet?.code ?? '').toLowerCase().includes(s),
    );
  }, [subQ.data, search]);

  const editing = useMemo(
    () => subQ.data?.find((s) => s.id === editingId) ?? null,
    [subQ.data, editingId],
  );

  const createMut = useMutation({
    mutationFn: async (payload: Partial<Subunternehmer>) =>
      (await api.post('/nv-subunternehmer', payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['nv-subunternehmer'] });
    },
  });
  const updateMut = useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<Subunternehmer>;
    }) => (await api.patch(`/nv-subunternehmer/${input.id}`, input.patch)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['nv-subunternehmer'] });
    },
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/nv-subunternehmer/${id}`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['nv-subunternehmer'] });
    },
  });
  const bulkAktivMut = useMutation({
    mutationFn: async (input: { ids: string[]; aktiv: boolean }) =>
      (await api.patch('/nv-subunternehmer/bulk-aktiv', input)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['nv-subunternehmer'] });
      setSelected(new Set());
    },
  });

  const toggleAktiv = (s: Subunternehmer) =>
    updateMut.mutate({ id: s.id, patch: { aktiv: !s.aktiv } });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">NV-Subunternehmer</h1>
          <p className="text-sm text-gray-500 mt-1">
            {subQ.data?.length ?? 0} Subunternehmer
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
            placeholder="Suche Name/Code..."
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

      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-3 flex items-center gap-2 text-sm">
          <span>{selected.size} ausgewählt:</span>
          <button
            onClick={() =>
              bulkAktivMut.mutate({ ids: [...selected], aktiv: true })
            }
            className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Aktivieren
          </button>
          <button
            onClick={() =>
              bulkAktivMut.mutate({ ids: [...selected], aktiv: false })
            }
            className="px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Deaktivieren
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-gray-500 hover:text-gray-700"
          >
            Auswahl leeren
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Name
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Tour-Gebiet
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Tarif
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Fahrzeug
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Status
              </th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {subQ.isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  Lade...
                </td>
              </tr>
            )}
            {!subQ.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  Keine Subunternehmer.
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-gray-100">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleSelect(s.id)}
                  />
                </td>
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {s.nv_tour_gebiet?.code ?? '—'}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {s.tarif_typ === 'TAGESPAUSCHALE' &&
                    s.tarif_tagespauschale_eur != null &&
                    `${Number(s.tarif_tagespauschale_eur).toFixed(2)} €/Tag`}
                  {s.tarif_typ === 'PRO_STOP' &&
                    s.tarif_pro_stop_eur != null &&
                    `${Number(s.tarif_pro_stop_eur).toFixed(2)} €/Stop`}
                  {s.tarif_typ === 'SPOT' && 'Spot'}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {s.fahrzeug_typ ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      s.aktiv
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {s.aktiv ? 'aktiv' : 'inaktiv'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => toggleAktiv(s)}
                    className="text-gray-500 hover:text-gray-700 mr-2"
                    title={s.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                  >
                    <Power size={16} />
                  </button>
                  <button
                    onClick={() => setEditingId(s.id)}
                    className="text-blue-600 hover:text-blue-800 mr-2"
                    title="Bearbeiten"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Subunternehmer "${s.name}" löschen?`))
                        deleteMut.mutate(s.id);
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
        <SubModal
          initial={editing ?? emptyForm()}
          tourGebiete={tourQ.data ?? []}
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

function SubModal({
  initial,
  tourGebiete,
  onClose,
  onSave,
  saving,
  isCreate,
}: {
  initial: Partial<Subunternehmer>;
  tourGebiete: TourGebiet[];
  onClose: () => void;
  onSave: (patch: Partial<Subunternehmer>) => void;
  saving: boolean;
  isCreate: boolean;
}) {
  const [form, setForm] = useState<Partial<Subunternehmer>>({
    ...initial,
    tarif_pro_stop_eur:
      initial.tarif_pro_stop_eur != null
        ? Number(initial.tarif_pro_stop_eur)
        : null,
    tarif_tagespauschale_eur:
      initial.tarif_tagespauschale_eur != null
        ? Number(initial.tarif_tagespauschale_eur)
        : null,
  });

  const update = <K extends keyof Subunternehmer>(
    k: K,
    v: Subunternehmer[K] | null,
  ) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name?.trim()) {
      alert('Name ist Pflichtfeld');
      return;
    }
    onSave({
      name: form.name,
      nv_tour_gebiet_id: form.nv_tour_gebiet_id ?? null,
      tarif_typ: form.tarif_typ ?? 'TAGESPAUSCHALE',
      tarif_pro_stop_eur:
        form.tarif_pro_stop_eur != null
          ? Number(form.tarif_pro_stop_eur)
          : null,
      tarif_tagespauschale_eur:
        form.tarif_tagespauschale_eur != null
          ? Number(form.tarif_tagespauschale_eur)
          : null,
      fahrzeug_typ: form.fahrzeug_typ ?? null,
      notiz: form.notiz ?? null,
      aktiv: form.aktiv ?? true,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-800">
            {isCreate ? 'Neuer Subunternehmer' : 'Subunternehmer bearbeiten'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
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
              Tour-Gebiet
            </label>
            <select
              value={form.nv_tour_gebiet_id ?? ''}
              onChange={(e) =>
                update('nv_tour_gebiet_id', e.target.value || null)
              }
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">— Keines —</option>
              {tourGebiete.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} – {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tarif-Typ
            </label>
            <select
              value={form.tarif_typ ?? 'TAGESPAUSCHALE'}
              onChange={(e) => update('tarif_typ', e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {TARIF_TYPEN.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {form.tarif_typ === 'TAGESPAUSCHALE' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Tagespauschale (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.tarif_tagespauschale_eur ?? ''}
                onChange={(e) =>
                  update(
                    'tarif_tagespauschale_eur',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          )}
          {form.tarif_typ === 'PRO_STOP' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Pro Stop (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.tarif_pro_stop_eur ?? ''}
                onChange={(e) =>
                  update(
                    'tarif_pro_stop_eur',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          )}
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notiz
            </label>
            <textarea
              value={form.notiz ?? ''}
              onChange={(e) => update('notiz', e.target.value)}
              rows={2}
              className="w-full border rounded px-3 py-2 text-sm"
            />
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

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Power,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import ResponsiveTable from '../components/table/ResponsiveTable';
import type { Column } from '../components/table/ResponsiveTable';

const ROUTING_KLASSEN = [
  'STAMMROUTE',
  'KLEINER_SCHLENKER',
  'MITTLERER_UMWEG',
  'SEPARATER_TOURAST',
] as const;

type Customer = { id: string; customer_number: string; name: string };
type StammKunde = {
  id: string;
  nv_stamm_tour_id: string;
  customer_id: string;
  standard_position: number;
  standard_servicezeit_min: number | null;
  routing_klasse: string | null;
  notizen: string | null;
  aktiv: boolean;
  customer?: Customer;
};

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

function buildStammColumns(args: {
  onOpenDetail: (id: string) => void;
  onToggleAktiv: (t: StammTour) => void;
  onEdit: (id: string) => void;
  onDelete: (t: StammTour) => void;
}): Column<StammTour>[] {
  const { onOpenDetail, onToggleAktiv, onEdit, onDelete } = args;
  return [
    {
      key: 'code',
      header: 'Code',
      width: 120,
      render: (t) => <span className="font-mono text-xs">{t.code}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      minWidth: 160,
      render: (t) => (
        <span className="truncate" title={t.name}>
          {t.name}
        </span>
      ),
    },
    {
      key: 'gebiet',
      header: 'Tour-Gebiet',
      width: 130,
      render: (t) => (
        <span className="font-mono text-xs">
          {t.nv_tour_gebiet?.code ?? '—'}
        </span>
      ),
    },
    {
      key: 'wochentage',
      header: 'Wochentage',
      width: 170,
      render: (t) => (
        <span className="text-xs text-gray-600 truncate">
          {t.wochentage.join(', ')}
        </span>
      ),
    },
    {
      key: 'start',
      header: 'Start',
      width: 80,
      render: (t) => (
        <span className="text-xs text-gray-600">{t.start_zeit ?? '—'}</span>
      ),
    },
    {
      key: 'sub',
      header: 'Subunternehmer',
      width: 150,
      render: (t) => (
        <span
          className="text-xs text-gray-600 truncate"
          title={t.default_subunternehmer?.name ?? ''}
        >
          {t.default_subunternehmer?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 90,
      align: 'center',
      render: (t) => (
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            t.aktiv
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          {t.aktiv ? 'aktiv' : 'inaktiv'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 130,
      resizable: false,
      align: 'right',
      render: (t) => (
        <span
          className="inline-flex gap-1.5 whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onOpenDetail(t.id)}
            className="text-gray-500 hover:text-gray-700"
            title="Stamm-Kunden"
          >
            <Users size={16} />
          </button>
          <button
            onClick={() => onToggleAktiv(t)}
            className="text-gray-500 hover:text-gray-700"
            title={t.aktiv ? 'Deaktivieren' : 'Aktivieren'}
          >
            <Power size={16} />
          </button>
          <button
            onClick={() => onEdit(t.id)}
            className="text-blue-600 hover:text-blue-800"
            title="Bearbeiten"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => onDelete(t)}
            className="text-red-600 hover:text-red-800"
            title="Löschen"
          >
            <Trash2 size={16} />
          </button>
        </span>
      ),
    },
  ];
}

export default function NvStammTourenPage() {
  const qc = useQueryClient();
  const [filterTour, setFilterTour] = useState<string>('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

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

  const columns = useMemo(
    () =>
      buildStammColumns({
        onOpenDetail: (id) => setDetailId(id),
        onToggleAktiv: toggleAktiv,
        onEdit: (id) => setEditingId(id),
        onDelete: (t) => {
          if (confirm(`Stamm-Tour "${t.code}" löschen?`))
            deleteMut.mutate(t.id);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-gray-50">
      <div className="bg-white border-b px-4 sm:px-6 py-3 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">NV-Stamm-Touren</h1>
          <p className="text-sm text-gray-500 mt-0.5">
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

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <ResponsiveTable<StammTour>
          storageKey="nv-stamm-touren-list"
          columns={columns}
          data={filtered}
          rowKey={(t) => t.id}
          loading={stammQ.isLoading}
          empty="Keine Stamm-Touren."
          onRowClick={(t) => setDetailId(t.id)}
          rowProps={(t) => ({
            className: detailId === t.id ? 'bg-blue-50' : '',
          })}
        />
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

      {detailId && (
        <StammKundenDrawer
          tour={stammQ.data?.find((t) => t.id === detailId) ?? null}
          onClose={() => setDetailId(null)}
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

function StammKundenDrawer({
  tour,
  onClose,
}: {
  tour: StammTour | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const tourId = tour?.id ?? '';
  const [showPicker, setShowPicker] = useState(false);

  const kundenQ = useQuery<StammKunde[]>({
    queryKey: ['nv-stamm-touren', tourId, 'kunden'],
    queryFn: async () =>
      (await api.get<StammKunde[]>(`/nv-stamm-touren/${tourId}/kunden`)).data,
    enabled: !!tourId,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['nv-stamm-touren', tourId, 'kunden'] });

  const updateMut = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<StammKunde> }) =>
      (await api.patch(`/nv-stamm-kunden/${input.id}`, input.patch)).data,
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/nv-stamm-kunden/${id}`)).data,
    onSuccess: invalidate,
  });
  const reorderMut = useMutation({
    mutationFn: async (
      items: { id: string; standard_position: number }[],
    ) => (await api.post('/nv-stamm-kunden/reorder', { items })).data,
    onSuccess: invalidate,
  });

  const moveItem = (idx: number, dir: -1 | 1) => {
    const list = kundenQ.data ?? [];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const a = list[idx];
    const b = list[target];
    reorderMut.mutate([
      { id: a.id, standard_position: b.standard_position },
      { id: b.id, standard_position: a.standard_position },
    ]);
  };

  if (!tour) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 h-full w-full sm:w-[520px] lg:w-[600px] bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold text-gray-800">{tour.name}</h2>
            <p className="text-xs text-gray-500 font-mono">{tour.code}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
          <span className="text-sm font-medium text-gray-700">
            Stamm-Kunden ({kundenQ.data?.length ?? 0})
          </span>
          <button
            onClick={() => setShowPicker(true)}
            className="bg-blue-600 text-white text-xs rounded px-2 py-1 flex items-center gap-1 hover:bg-blue-700"
          >
            <Plus size={14} />
            Kunde hinzufügen
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {kundenQ.isLoading && (
            <div className="p-4 text-sm text-gray-500">Lade...</div>
          )}
          {!kundenQ.isLoading && (kundenQ.data?.length ?? 0) === 0 && (
            <div className="p-4 text-sm text-gray-500">
              Keine Stamm-Kunden zugeordnet.
            </div>
          )}
          <ul className="divide-y divide-gray-100">
            {(kundenQ.data ?? []).map((k, idx) => (
              <li key={k.id} className="p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500 w-6 text-right">
                    {k.standard_position}
                  </span>
                  <span className="font-medium flex-1">
                    {k.customer?.name ?? '—'}
                  </span>
                  <button
                    onClick={() => moveItem(idx, -1)}
                    disabled={idx === 0 || reorderMut.isPending}
                    className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
                    title="Nach oben"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    onClick={() => moveItem(idx, 1)}
                    disabled={
                      idx === (kundenQ.data?.length ?? 0) - 1 ||
                      reorderMut.isPending
                    }
                    className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
                    title="Nach unten"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Kunde "${k.customer?.name}" aus Stamm-Tour entfernen?`,
                        )
                      )
                        deleteMut.mutate(k.id);
                    }}
                    className="text-red-600 hover:text-red-800"
                    title="Entfernen"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 pl-8">
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase tracking-wide">
                      Servicezeit (Min)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={k.standard_servicezeit_min ?? ''}
                      onChange={(e) =>
                        updateMut.mutate({
                          id: k.id,
                          patch: {
                            standard_servicezeit_min:
                              e.target.value === ''
                                ? null
                                : Number(e.target.value),
                          },
                        })
                      }
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase tracking-wide">
                      Routing-Klasse
                    </label>
                    <select
                      value={k.routing_klasse ?? ''}
                      onChange={(e) =>
                        updateMut.mutate({
                          id: k.id,
                          patch: {
                            routing_klasse: e.target.value || null,
                          },
                        })
                      }
                      className="w-full border rounded px-2 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {ROUTING_KLASSEN.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {showPicker && (
        <CustomerPicker
          existingIds={(kundenQ.data ?? []).map((k) => k.customer_id)}
          tourId={tour.id}
          onClose={() => setShowPicker(false)}
          onPicked={() => {
            setShowPicker(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function CustomerPicker({
  existingIds,
  tourId,
  onClose,
  onPicked,
}: {
  existingIds: string[];
  tourId: string;
  onClose: () => void;
  onPicked: () => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const customersQ = useQuery<Customer[]>({
    queryKey: ['customers', 'picker', debounced],
    queryFn: async () => {
      const params = debounced ? { search: debounced } : {};
      return (await api.get<Customer[]>('/customers', { params })).data;
    },
  });

  const addMut = useMutation({
    mutationFn: async (customer_id: string) =>
      (
        await api.post('/nv-stamm-kunden', {
          nv_stamm_tour_id: tourId,
          customer_id,
        })
      ).data,
    onSuccess: onPicked,
  });

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-gray-800">Kunde auswählen</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-3 border-b">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche Kundenname/Nummer..."
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {customersQ.isLoading && (
            <div className="p-3 text-sm text-gray-500">Lade...</div>
          )}
          {(customersQ.data ?? [])
            .filter((c) => !existingIds.includes(c.id))
            .slice(0, 100)
            .map((c) => (
              <button
                key={c.id}
                onClick={() => addMut.mutate(c.id)}
                disabled={addMut.isPending}
                className="w-full text-left px-3 py-2 border-b hover:bg-blue-50 text-sm disabled:opacity-50"
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-gray-500 font-mono">
                  {c.customer_number}
                </div>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

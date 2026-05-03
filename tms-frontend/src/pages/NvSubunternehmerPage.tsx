import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import ResponsiveTable from '../components/table/ResponsiveTable';
import type { Column } from '../components/table/ResponsiveTable';

type BusinessPartner = {
  id: string;
  partner_number: string;
  name: string;
  partner_type: string;
};
type TourGebiet = { id: string; code: string; name: string };
type Subunternehmer = {
  id: string;
  name: string;
  nv_tour_gebiet_id: string | null;
  business_partner_id: string;
  tarif_typ: string;
  tarif_pro_stop_eur: string | number | null;
  tarif_tagespauschale_eur: string | number | null;
  tarif_pro_km_eur: string | number | null;
  tarif_grundgebuehr_eur: string | number | null;
  tarif_pro_stunde_eur: string | number | null;
  fahrzeug_typ: string | null;
  max_paletten: number | null;
  max_gewicht_kg: number | null;
  max_volumen_m3: string | number | null;
  max_ldm: string | number | null;
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
  { value: 'KM_BASIERT', label: 'KM-basiert' },
  { value: 'STUNDEN_BASIERT', label: 'Stunden-basiert' },
  { value: 'SPOT', label: 'Spot' },
];
const FAHRZEUG_TYPEN = ['TRANSPORTER', '7_5T', '12T', '18T', '40T'];

const FAHRZEUG_KAPAZITAET: Record<
  string,
  {
    max_paletten: number;
    max_gewicht_kg: number;
    max_volumen_m3: number;
    max_ldm: number;
  }
> = {
  '3_5T': { max_paletten: 12, max_gewicht_kg: 1500, max_volumen_m3: 15, max_ldm: 6 },
  TRANSPORTER: { max_paletten: 12, max_gewicht_kg: 1500, max_volumen_m3: 15, max_ldm: 6 },
  '7_5T': { max_paletten: 16, max_gewicht_kg: 3000, max_volumen_m3: 30, max_ldm: 8 },
  '12T': { max_paletten: 24, max_gewicht_kg: 8000, max_volumen_m3: 40, max_ldm: 12 },
  '18T': { max_paletten: 33, max_gewicht_kg: 11000, max_volumen_m3: 60, max_ldm: 13.6 },
  '40T': { max_paletten: 33, max_gewicht_kg: 24000, max_volumen_m3: 90, max_ldm: 13.6 },
};

function emptyForm(): Partial<Subunternehmer> {
  return {
    nv_tour_gebiet_id: null,
    tarif_typ: 'TAGESPAUSCHALE',
    tarif_tagespauschale_eur: 280,
    fahrzeug_typ: '7_5T',
    aktiv: true,
  };
}

function tarifWertText(s: Subunternehmer): string {
  if (s.tarif_typ === 'TAGESPAUSCHALE' && s.tarif_tagespauschale_eur != null)
    return `${Number(s.tarif_tagespauschale_eur).toFixed(2)} €/Tag`;
  if (s.tarif_typ === 'PRO_STOP' && s.tarif_pro_stop_eur != null)
    return `${Number(s.tarif_pro_stop_eur).toFixed(2)} €/Stop`;
  if (s.tarif_typ === 'KM_BASIERT' && s.tarif_pro_km_eur != null) {
    const grund =
      s.tarif_grundgebuehr_eur != null
        ? ` + ${Number(s.tarif_grundgebuehr_eur).toFixed(2)} GB`
        : '';
    return `${Number(s.tarif_pro_km_eur).toFixed(2)} €/km${grund}`;
  }
  if (s.tarif_typ === 'STUNDEN_BASIERT' && s.tarif_pro_stunde_eur != null)
    return `${Number(s.tarif_pro_stunde_eur).toFixed(2)} €/h`;
  if (s.tarif_typ === 'SPOT') return 'Spot';
  return '—';
}

function buildSubColumns(args: {
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAktiv: (s: Subunternehmer) => void;
  onEdit: (id: string) => void;
  onDelete: (s: Subunternehmer) => void;
}): Column<Subunternehmer>[] {
  const { selected, onToggleSelect, onToggleAktiv, onEdit, onDelete } = args;
  return [
    {
      key: 'select',
      header: '',
      width: 32,
      minWidth: 32,
      resizable: false,
      render: (s) => (
        <input
          type="checkbox"
          checked={selected.has(s.id)}
          onChange={() => onToggleSelect(s.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      key: 'name',
      header: 'Name',
      minWidth: 180,
      render: (s) => (
        <span className="truncate" title={s.business_partner?.name ?? s.name}>
          {s.business_partner?.name ?? s.name}
          {s.business_partner?.partner_number && (
            <span className="text-xs text-gray-500 ml-2 font-mono">
              {s.business_partner.partner_number}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'gebiet',
      header: 'Tour-Gebiet',
      width: 140,
      render: (s) => (
        <span className="font-mono text-xs text-gray-600">
          {s.nv_tour_gebiet?.code ?? '—'}
        </span>
      ),
    },
    {
      key: 'tarif_typ',
      header: 'Tarif-Typ',
      width: 140,
      render: (s) => (
        <span className="text-xs text-gray-700">{s.tarif_typ}</span>
      ),
    },
    {
      key: 'tarif_wert',
      header: 'Tarif',
      width: 160,
      render: (s) => (
        <span className="text-xs text-gray-600">{tarifWertText(s)}</span>
      ),
    },
    {
      key: 'fahrzeug',
      header: 'Fahrzeug',
      width: 100,
      render: (s) => (
        <span className="text-xs text-gray-600">{s.fahrzeug_typ ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 80,
      align: 'center',
      render: (s) => (
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            s.aktiv
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          {s.aktiv ? 'aktiv' : 'inaktiv'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 110,
      resizable: false,
      align: 'right',
      render: (s) => (
        <span
          className="inline-flex gap-1.5 whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onToggleAktiv(s)}
            className="text-gray-500 hover:text-gray-700"
            title={s.aktiv ? 'Deaktivieren' : 'Aktivieren'}
          >
            <Power size={16} />
          </button>
          <button
            onClick={() => onEdit(s.id)}
            className="text-blue-600 hover:text-blue-800"
            title="Bearbeiten"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => onDelete(s)}
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

  const columns = useMemo(
    () =>
      buildSubColumns({
        selected,
        onToggleSelect: toggleSelect,
        onToggleAktiv: toggleAktiv,
        onEdit: (id) => setEditingId(id),
        onDelete: (s) => {
          if (
            confirm(`Subunternehmer "${s.business_partner?.name ?? s.name}" löschen?`)
          )
            deleteMut.mutate(s.id);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-gray-50">
      <div className="bg-white border-b px-4 sm:px-6 py-3 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">NV-Subunternehmer</h1>
          <p className="text-sm text-gray-500 mt-0.5">
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
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2 text-sm">
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

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <ResponsiveTable<Subunternehmer>
          storageKey="nv-subunternehmer-list"
          columns={columns}
          data={filtered}
          rowKey={(s) => s.id}
          loading={subQ.isLoading}
          empty="Keine Subunternehmer."
        />
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
    tarif_pro_km_eur:
      initial.tarif_pro_km_eur != null
        ? Number(initial.tarif_pro_km_eur)
        : null,
    tarif_grundgebuehr_eur:
      initial.tarif_grundgebuehr_eur != null
        ? Number(initial.tarif_grundgebuehr_eur)
        : null,
    tarif_pro_stunde_eur:
      initial.tarif_pro_stunde_eur != null
        ? Number(initial.tarif_pro_stunde_eur)
        : null,
    max_paletten:
      initial.max_paletten != null ? Number(initial.max_paletten) : null,
    max_gewicht_kg:
      initial.max_gewicht_kg != null ? Number(initial.max_gewicht_kg) : null,
    max_volumen_m3:
      initial.max_volumen_m3 != null ? Number(initial.max_volumen_m3) : null,
    max_ldm: initial.max_ldm != null ? Number(initial.max_ldm) : null,
  });

  // Pre-Fill Kapazitaet bei first-open wenn alle 4 null +
  // fahrzeug_typ in Map.
  useEffect(() => {
    const allNull =
      initial.max_paletten == null &&
      initial.max_gewicht_kg == null &&
      initial.max_volumen_m3 == null &&
      initial.max_ldm == null;
    const ft = initial.fahrzeug_typ ?? '';
    const def = FAHRZEUG_KAPAZITAET[ft];
    if (allNull && def) {
      setForm((f) => ({
        ...f,
        max_paletten: def.max_paletten,
        max_gewicht_kg: def.max_gewicht_kg,
        max_volumen_m3: def.max_volumen_m3,
        max_ldm: def.max_ldm,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = <K extends keyof Subunternehmer>(
    k: K,
    v: Subunternehmer[K] | null,
  ) => setForm((f) => ({ ...f, [k]: v }));

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedBp, setPickedBp] = useState<BusinessPartner | null>(
    initial.business_partner
      ? {
          id: initial.business_partner.id,
          partner_number: initial.business_partner.partner_number,
          name: initial.business_partner.name,
          partner_type: 'SUBCONTRACTOR',
        }
      : null,
  );

  const handleSave = () => {
    if (!form.business_partner_id) {
      alert('Subunternehmer (Stammdaten) ist Pflichtfeld');
      return;
    }
    onSave({
      business_partner_id: form.business_partner_id,
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
      tarif_pro_km_eur:
        form.tarif_pro_km_eur != null
          ? Number(form.tarif_pro_km_eur)
          : null,
      tarif_grundgebuehr_eur:
        form.tarif_grundgebuehr_eur != null
          ? Number(form.tarif_grundgebuehr_eur)
          : null,
      tarif_pro_stunde_eur:
        form.tarif_pro_stunde_eur != null
          ? Number(form.tarif_pro_stunde_eur)
          : null,
      fahrzeug_typ: form.fahrzeug_typ ?? null,
      max_paletten: form.max_paletten ?? null,
      max_gewicht_kg: form.max_gewicht_kg ?? null,
      max_volumen_m3:
        form.max_volumen_m3 != null ? Number(form.max_volumen_m3) : null,
      max_ldm: form.max_ldm != null ? Number(form.max_ldm) : null,
      notiz: form.notiz ?? null,
      aktiv: form.aktiv ?? true,
    });
  };

  const applyKapazitaetDefaults = () => {
    const ft = form.fahrzeug_typ ?? '';
    const def = FAHRZEUG_KAPAZITAET[ft];
    if (!def) return;
    setForm((f) => ({
      ...f,
      max_paletten: def.max_paletten,
      max_gewicht_kg: def.max_gewicht_kg,
      max_volumen_m3: def.max_volumen_m3,
      max_ldm: def.max_ldm,
    }));
  };
  const canApplyKapazitaet = !!FAHRZEUG_KAPAZITAET[form.fahrzeug_typ ?? ''];

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
              Subunternehmer (Stammdaten) *
            </label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full border rounded px-3 py-2 text-sm text-left bg-white hover:bg-gray-50"
            >
              {pickedBp ? (
                <span>
                  <span className="font-medium">{pickedBp.name}</span>
                  <span className="text-xs text-gray-500 ml-2 font-mono">
                    {pickedBp.partner_number}
                  </span>
                </span>
              ) : (
                <span className="text-gray-400">— bitte wählen —</span>
              )}
            </button>
            <a
              href="/masterdata"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
            >
              <ExternalLink size={12} />
              Neuen Subunternehmer in Stammdaten anlegen
            </a>
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
          {form.tarif_typ === 'KM_BASIERT' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Pro KM (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.tarif_pro_km_eur ?? ''}
                  onChange={(e) =>
                    update(
                      'tarif_pro_km_eur',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Grundgebühr (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.tarif_grundgebuehr_eur ?? ''}
                  onChange={(e) =>
                    update(
                      'tarif_grundgebuehr_eur',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
          {form.tarif_typ === 'STUNDEN_BASIERT' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Pro Stunde (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.tarif_pro_stunde_eur ?? ''}
                onChange={(e) =>
                  update(
                    'tarif_pro_stunde_eur',
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

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-700 uppercase">
                Fahrzeug-Kapazität
              </span>
              <button
                type="button"
                onClick={applyKapazitaetDefaults}
                disabled={!canApplyKapazitaet}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
                title="Setzt Kapazitäts-Felder auf Defaults aus Fahrzeug-Typ"
              >
                Standard übernehmen
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500">
                  Max Paletten
                </label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={form.max_paletten ?? ''}
                  onChange={(e) =>
                    update(
                      'max_paletten',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500">
                  Max Gewicht (kg)
                </label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={form.max_gewicht_kg ?? ''}
                  onChange={(e) =>
                    update(
                      'max_gewicht_kg',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500">
                  Max Volumen (m³)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.max_volumen_m3 ?? ''}
                  onChange={(e) =>
                    update(
                      'max_volumen_m3',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500">
                  Max LDM
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.max_ldm ?? ''}
                  onChange={(e) =>
                    update(
                      'max_ldm',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
            </div>
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

      {pickerOpen && (
        <SubcontractorPickerModal
          onClose={() => setPickerOpen(false)}
          onPicked={(bp) => {
            setPickedBp(bp);
            update('business_partner_id', bp.id);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SubcontractorPickerModal({
  onClose,
  onPicked,
}: {
  onClose: () => void;
  onPicked: (bp: BusinessPartner) => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const partnersQ = useQuery<BusinessPartner[]>({
    queryKey: ['masterdata', 'partners', 'SUBCONTRACTOR', debounced],
    queryFn: async () =>
      (
        await api.get<BusinessPartner[]>('/masterdata/partners', {
          params: { type: 'SUBCONTRACTOR', search: debounced || undefined },
        })
      ).data,
  });

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-gray-800">Subunternehmer auswählen</h3>
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
            placeholder="Suche Name/Partner-Nr..."
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {partnersQ.isLoading && (
            <div className="p-3 text-sm text-gray-500">Lade...</div>
          )}
          {!partnersQ.isLoading && (partnersQ.data?.length ?? 0) === 0 && (
            <div className="p-3 text-sm text-gray-500">
              Keine Subunternehmer gefunden.
            </div>
          )}
          {(partnersQ.data ?? []).slice(0, 100).map((bp) => (
            <button
              key={bp.id}
              onClick={() => onPicked(bp)}
              className="w-full text-left px-3 py-2 border-b hover:bg-blue-50 text-sm"
            >
              <div className="font-medium">{bp.name}</div>
              <div className="text-xs text-gray-500 font-mono">
                {bp.partner_number}
              </div>
            </button>
          ))}
        </div>
        <div className="border-t px-3 py-2 bg-gray-50">
          <a
            href="/masterdata"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <ExternalLink size={12} />
            Neuen Subunternehmer in Stammdaten anlegen
          </a>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Power, X } from 'lucide-react';
import { api } from '../lib/api';
import ResponsiveTable from '../components/table/ResponsiveTable';
import type { Column } from '../components/table/ResponsiveTable';

type Relation = { id: string; code: string; name: string };
type NvTourGebiet = {
  id: string;
  nv_gebiet_id: string;
  code: string;
  name: string;
  plz_pattern: string[] | null;
  relation_id: string | null;
  farbe: string | null;
  aktiv: boolean;
  nv_gebiet?: { id: string; code: string; name: string };
  relation?: Relation | null;
};
type NvGebiet = {
  id: string;
  code: string;
  name: string;
  plz_ranges: string[] | null;
  gebiet_typ: string;
  aktiv: boolean;
  _count?: { tour_gebiete: number };
};

function buildGebietColumns(args: {
  onToggleAktiv: (t: NvTourGebiet) => void;
  onEdit: (id: string) => void;
}): Column<NvTourGebiet>[] {
  const { onToggleAktiv, onEdit } = args;
  return [
    {
      key: 'farbe',
      header: '',
      width: 50,
      resizable: false,
      render: (t) => (
        <span
          className="inline-block w-5 h-5 rounded border border-gray-300"
          style={{ background: t.farbe ?? '#ccc' }}
        />
      ),
    },
    {
      key: 'code',
      header: 'Code',
      width: 130,
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
      key: 'plz',
      header: 'PLZ',
      width: 220,
      render: (t) => {
        const plz = t.plz_pattern ?? [];
        return (
          <span className="text-xs text-gray-600 truncate">
            {plz.length} PLZ
            {plz.length > 0 && (
              <span className="text-gray-400 ml-1">
                ({plz.slice(0, 3).join(', ')}
                {plz.length > 3 ? '...' : ''})
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'relation',
      header: 'Relation',
      width: 110,
      render: (t) => (
        <span className="font-mono text-xs text-gray-600">
          {t.relation?.code ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 80,
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
      width: 90,
      resizable: false,
      align: 'right',
      render: (t) => (
        <span
          className="inline-flex gap-1.5 whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
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
        </span>
      ),
    },
  ];
}

export default function NvGebietePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const gebieteQ = useQuery<NvGebiet[]>({
    queryKey: ['nv-gebiete'],
    queryFn: async () => (await api.get<NvGebiet[]>('/nv-gebiete')).data,
  });
  const tourQ = useQuery<NvTourGebiet[]>({
    queryKey: ['nv-tour-gebiete'],
    queryFn: async () => (await api.get<NvTourGebiet[]>('/nv-tour-gebiete')).data,
  });

  const editing = useMemo(
    () => tourQ.data?.find((t) => t.id === editingId) ?? null,
    [tourQ.data, editingId],
  );

  const filtered = useMemo(() => {
    const list = tourQ.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (t) =>
        t.code.toLowerCase().includes(s) ||
        t.name.toLowerCase().includes(s) ||
        (t.plz_pattern ?? []).some((p) => String(p).startsWith(s)),
    );
  }, [tourQ.data, search]);

  const updateMut = useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<{
        name: string;
        farbe: string;
        aktiv: boolean;
        plz_pattern: string[];
      }>;
    }) => (await api.patch(`/nv-tour-gebiete/${input.id}`, input.patch)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['nv-tour-gebiete'] });
      await qc.invalidateQueries({ queryKey: ['nv-gebiete'] });
    },
  });

  const toggleAktiv = (t: NvTourGebiet) =>
    updateMut.mutate({ id: t.id, patch: { aktiv: !t.aktiv } });

  const columns = useMemo(
    () =>
      buildGebietColumns({
        onToggleAktiv: toggleAktiv,
        onEdit: (id) => setEditingId(id),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-gray-50">
      <div className="bg-white border-b px-4 sm:px-6 py-3 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">NV-Gebiete</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {gebieteQ.data?.length ?? 0} NV-Gebiet
            {(gebieteQ.data?.length ?? 0) === 1 ? '' : 'e'} ·{' '}
            {tourQ.data?.length ?? 0} Tour-Gebiete
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche Code, Name oder PLZ..."
          className="border border-gray-300 rounded px-3 py-2 text-sm w-64"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {gebieteQ.data && gebieteQ.data.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {gebieteQ.data.map((g) => (
              <div key={g.id} className="flex items-center gap-4 text-sm">
                <span className="font-semibold text-gray-800">{g.name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  {g.gebiet_typ}
                </span>
                <span className="text-gray-500">
                  {g._count?.tour_gebiete ?? 0} Tour-Gebiete ·{' '}
                  {g.plz_ranges?.length ?? 0} PLZ
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    g.aktiv
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {g.aktiv ? 'aktiv' : 'inaktiv'}
                </span>
              </div>
            ))}
          </div>
        )}

        <ResponsiveTable<NvTourGebiet>
          storageKey="nv-gebiete-list"
          columns={columns}
          data={filtered}
          rowKey={(t) => t.id}
          loading={tourQ.isLoading}
          empty="Keine Tour-Gebiete gefunden."
        />
      </div>

      {editing && (
        <EditModal
          tour={editing}
          onClose={() => setEditingId(null)}
          onSave={async (patch) => {
            await updateMut.mutateAsync({ id: editing.id, patch });
            setEditingId(null);
          }}
          saving={updateMut.isPending}
        />
      )}
    </div>
  );
}

function EditModal({
  tour,
  onClose,
  onSave,
  saving,
}: {
  tour: NvTourGebiet;
  onClose: () => void;
  onSave: (patch: {
    name?: string;
    farbe?: string;
    aktiv?: boolean;
    plz_pattern?: string[];
  }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(tour.name);
  const [farbe, setFarbe] = useState(tour.farbe ?? '#1e40af');
  const [aktiv, setAktiv] = useState(tour.aktiv);
  const [plzText, setPlzText] = useState(
    (tour.plz_pattern ?? []).join(', '),
  );

  const handleSave = () => {
    const plzList = plzText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const patch: Parameters<typeof onSave>[0] = {};
    if (name !== tour.name) patch.name = name;
    if (farbe !== tour.farbe) patch.farbe = farbe;
    if (aktiv !== tour.aktiv) patch.aktiv = aktiv;
    const orig = (tour.plz_pattern ?? []).join(',');
    if (plzList.join(',') !== orig) patch.plz_pattern = plzList;
    onSave(patch);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-800">
            Tour-Gebiet bearbeiten
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Code (read-only)
            </label>
            <input
              type="text"
              value={tour.code}
              disabled
              className="w-full border rounded px-3 py-2 text-sm bg-gray-50 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Farbe
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={farbe}
                onChange={(e) => setFarbe(e.target.value)}
                className="h-9 w-16 border rounded cursor-pointer"
              />
              <input
                type="text"
                value={farbe}
                onChange={(e) => setFarbe(e.target.value)}
                className="flex-1 border rounded px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              PLZ-Liste (Komma-/Leerzeichen-getrennt)
            </label>
            <textarea
              value={plzText}
              onChange={(e) => setPlzText(e.target.value)}
              rows={4}
              className="w-full border rounded px-3 py-2 text-sm font-mono"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={aktiv}
              onChange={(e) => setAktiv(e.target.checked)}
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

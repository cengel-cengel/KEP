import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import ResponsiveTable from '../components/table/ResponsiveTable';
import type { Column } from '../components/table/ResponsiveTable';

type Warehouse = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string;
  lat: string | number | null;
  lng: string | number | null;
  is_default: boolean;
  is_umschlag: boolean;
  active: boolean;
};

function emptyForm(): Partial<Warehouse> {
  return {
    name: '',
    country: 'DE',
    is_default: false,
    is_umschlag: false,
    active: true,
  };
}

function buildColumns(args: {
  onToggleAktiv: (w: Warehouse) => void;
  onEdit: (id: string) => void;
  onDelete: (w: Warehouse) => void;
}): Column<Warehouse>[] {
  const { onToggleAktiv, onEdit, onDelete } = args;
  return [
    {
      key: 'name',
      header: 'Name',
      minWidth: 180,
      render: (w) => (
        <span className="font-medium">
          {w.name}
          {w.is_default && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
              Standard
            </span>
          )}
          {w.is_umschlag && (
            <span
              className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
              title="Umschlag-Lager (CHARTER_UMSCHLAG-Flow Hub-Start)"
            >
              Umschlag
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'address',
      header: 'Adresse',
      minWidth: 220,
      render: (w) => (
        <span className="text-xs text-gray-600 truncate">
          {[w.street, w.zip ? `${w.zip} ${w.city ?? ''}` : w.city, w.country]
            .filter(Boolean)
            .join(', ')}
        </span>
      ),
    },
    {
      key: 'coords',
      header: 'Koordinaten',
      width: 160,
      render: (w) => (
        <span className="text-xs font-mono text-gray-600">
          {w.lat != null && w.lng != null
            ? `${Number(w.lat).toFixed(4)}, ${Number(w.lng).toFixed(4)}`
            : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 80,
      align: 'center',
      render: (w) => (
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            w.active
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          {w.active ? 'aktiv' : 'inaktiv'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 110,
      resizable: false,
      align: 'right',
      render: (w) => (
        <span className="inline-flex gap-1.5">
          <button
            onClick={() => onToggleAktiv(w)}
            className="text-gray-500 hover:text-gray-700"
            title={w.active ? 'Deaktivieren' : 'Aktivieren'}
          >
            <Power size={16} />
          </button>
          <button
            onClick={() => onEdit(w.id)}
            className="text-blue-600 hover:text-blue-800"
            title="Bearbeiten"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => onDelete(w)}
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

export default function WarehousesPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data,
  });

  const editing = useMemo(
    () => q.data?.find((w) => w.id === editingId) ?? null,
    [q.data, editingId],
  );

  const createMut = useMutation({
    mutationFn: async (payload: Partial<Warehouse>) =>
      (await api.post('/warehouses', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  });
  const updateMut = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Warehouse> }) =>
      (await api.patch(`/warehouses/${input.id}`, input.patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/warehouses/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  });

  const toggleAktiv = (w: Warehouse) =>
    updateMut.mutate({ id: w.id, patch: { active: !w.active } });

  const columns = useMemo(
    () =>
      buildColumns({
        onToggleAktiv: toggleAktiv,
        onEdit: (id) => setEditingId(id),
        onDelete: (w) => {
          if (confirm(`Lager "${w.name}" löschen?`)) deleteMut.mutate(w.id);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-gray-50">
      <div className="bg-white border-b px-4 sm:px-6 py-3 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Lager</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {q.data?.length ?? 0} Lager · Geocoding via Nominatim
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-blue-600 text-white text-sm rounded px-3 py-2 flex items-center gap-1 hover:bg-blue-700"
        >
          <Plus size={16} />
          Neu
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <ResponsiveTable<Warehouse>
          storageKey="warehouses-list"
          columns={columns}
          data={q.data ?? []}
          rowKey={(w) => w.id}
          loading={q.isLoading}
          empty="Keine Lager."
        />
      </div>

      {(editing || creating) && (
        <WarehouseModal
          initial={editing ?? emptyForm()}
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

function WarehouseModal({
  initial,
  onClose,
  onSave,
  saving,
  isCreate,
}: {
  initial: Partial<Warehouse>;
  onClose: () => void;
  onSave: (patch: Partial<Warehouse>) => void;
  saving: boolean;
  isCreate: boolean;
}) {
  const [form, setForm] = useState<Partial<Warehouse>>({
    ...initial,
    lat: initial.lat != null ? Number(initial.lat) : null,
    lng: initial.lng != null ? Number(initial.lng) : null,
  });
  const update = <K extends keyof Warehouse>(
    k: K,
    v: Warehouse[K] | null,
  ) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name?.trim()) {
      alert('Name ist Pflichtfeld');
      return;
    }
    onSave({
      name: form.name,
      street: form.street ?? null,
      zip: form.zip ?? null,
      city: form.city ?? null,
      country: form.country ?? 'DE',
      lat: form.lat != null ? Number(form.lat) : null,
      lng: form.lng != null ? Number(form.lng) : null,
      is_default: form.is_default ?? false,
      is_umschlag: form.is_umschlag ?? false,
      active: form.active ?? true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-800">
            {isCreate ? 'Neues Lager' : 'Lager bearbeiten'}
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
              Straße
            </label>
            <input
              type="text"
              value={form.street ?? ''}
              onChange={(e) => update('street', e.target.value || null)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                PLZ
              </label>
              <input
                type="text"
                value={form.zip ?? ''}
                onChange={(e) => update('zip', e.target.value || null)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Stadt
              </label>
              <input
                type="text"
                value={form.city ?? ''}
                onChange={(e) => update('city', e.target.value || null)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Land (ISO-2)
            </label>
            <input
              type="text"
              maxLength={2}
              value={form.country ?? 'DE'}
              onChange={(e) =>
                update('country', e.target.value.toUpperCase())
              }
              className="w-full border rounded px-3 py-2 text-sm font-mono uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Lat (optional)
              </label>
              <input
                type="number"
                step="0.0000001"
                value={form.lat ?? ''}
                onChange={(e) =>
                  update(
                    'lat',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-full border rounded px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Lng (optional)
              </label>
              <input
                type="number"
                step="0.0000001"
                value={form.lng ?? ''}
                onChange={(e) =>
                  update(
                    'lng',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-full border rounded px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-500">
            Lat/Lng leer lassen → automatisches Geocoding via Nominatim.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default ?? false}
              onChange={(e) => update('is_default', e.target.checked)}
            />
            <span>Standard-Lager</span>
          </label>
          <label
            className="flex items-center gap-2 text-sm"
            title="Charter-Umschlag-Flow: FV-Hauptlauf-Touren starten ab diesem Lager."
          >
            <input
              type="checkbox"
              checked={form.is_umschlag ?? false}
              onChange={(e) => update('is_umschlag', e.target.checked)}
            />
            <span>Umschlag-Lager</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(e) => update('active', e.target.checked)}
            />
            <span>Aktiv</span>
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

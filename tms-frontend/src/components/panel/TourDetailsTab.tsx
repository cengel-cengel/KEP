import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Warehouse } from 'lucide-react';
import { api } from '../../lib/api';
import InlineEdit from './InlineEdit';
import { nvStatusLabel, type NvTourMutableStatus } from '../../lib/nvTourStatus';

interface TourDetail {
  id: string;
  tour_number?: string | null;
  status?: string | null;
  geplante_km?: string | number | null;
  notes?: string | null;
  subcontractors?: { id: string; name: string } | null;
  hub_start_address?: {
    name?: string | null;
    zip?: string | null;
    city?: string | null;
  } | null;
  hub_end_address?: {
    name?: string | null;
    zip?: string | null;
    city?: string | null;
  } | null;
  shipments?: Array<{
    id: string;
    shipment_number?: string | null;
    tour_position?: number | null;
  }>;
}

interface NvTourDetail {
  id: string;
  datum: string;
  status: string;
  fahrzeug_typ?: string | null;
  notizen?: string | null;
  nv_stamm_tour?: { code: string; name: string } | null;
  subunternehmer?: { id: string; name: string } | null;
  stops?: Array<{
    id: string;
    position: number;
    stop_type?: string;
    shipment?: { id: string; shipment_number?: string | null };
  }>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1 text-xs">
      <div className="text-gray-500">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function addrShort(
  a?: { zip?: string | null; city?: string | null; name?: string | null } | null,
): string {
  if (!a) return '—';
  const parts = [a.zip, a.city].filter(Boolean).join(' ');
  return parts || a.name || '—';
}

export default function TourDetailsTab({
  tourId,
  mode,
}: {
  tourId: string;
  mode: 'fv' | 'nv';
}) {
  if (mode === 'nv') return <NvTourBody tourId={tourId} />;
  return <FvTourBody tourId={tourId} />;
}

function FvTourBody({ tourId }: { tourId: string }) {
  const qc = useQueryClient();
  const tourQ = useQuery<TourDetail>({
    queryKey: ['fv-tour-detail', tourId],
    queryFn: async () => (await api.get<TourDetail>(`/tours/${tourId}`)).data,
    staleTime: 30_000,
  });

  const patchMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/tours/${tourId}`, body);
      return data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['fv-tour-detail', tourId] });
      qc.invalidateQueries({ queryKey: ['fv-touren'] });
    },
  });

  const t = tourQ.data;
  if (tourQ.isLoading) return <div className="p-3 text-xs text-gray-400">Lädt…</div>;
  if (!t) return <div className="p-3 text-xs text-gray-400">Tour nicht gefunden.</div>;

  return (
    <div className="p-3 space-y-3">
      <section>
        <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
          FV-Tour
        </h3>
        <Row label="Nummer">
          <span className="font-mono">{t.tour_number ?? '—'}</span>
        </Row>
        <Row label="Status">
          <span className="text-gray-700">{t.status ?? '—'}</span>
        </Row>
        <Row label="Geplant km">
          <span>{t.geplante_km != null ? `${Number(t.geplante_km).toFixed(1)} km` : '—'}</span>
        </Row>
        <Row label="Sub">
          <span>{t.subcontractors?.name ?? '—'}</span>
        </Row>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
          Hub-Adressen
        </h3>
        <Row label="Start">
          <span className="inline-flex items-center gap-1">
            <Warehouse size={11} className="text-gray-500" />
            {addrShort(t.hub_start_address)}
          </span>
        </Row>
        <Row label="Ende">
          <span className="inline-flex items-center gap-1">
            <Warehouse size={11} className="text-gray-500" />
            {addrShort(t.hub_end_address)}
          </span>
        </Row>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
          Notizen
        </h3>
        <Row label="Notiz">
          <InlineEdit
            value={t.notes}
            onSave={(v) => patchMut.mutateAsync({ comment: v || null })}
            type="textarea"
            placeholder="Klick zum Editieren…"
            label="Tour-Notiz"
          />
        </Row>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
          Stops ({t.shipments?.length ?? 0})
        </h3>
        {(t.shipments ?? []).map((s, i) => (
          <div key={s.id} className="text-xs flex items-center gap-2 py-0.5">
            <span className="text-gray-400 font-mono w-5 text-right">
              {(s.tour_position ?? i + 1)}.
            </span>
            <span className="font-mono">{s.shipment_number ?? '—'}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function NvTourBody({ tourId }: { tourId: string }) {
  const qc = useQueryClient();
  const tourQ = useQuery<NvTourDetail>({
    queryKey: ['nv-tour-detail', tourId],
    queryFn: async () =>
      (await api.get<NvTourDetail>(`/nv-touren/${tourId}`)).data,
    staleTime: 30_000,
  });

  const patchMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/nv-touren/${tourId}`, body);
      return data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', tourId] });
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
    },
  });

  const t = tourQ.data;
  if (tourQ.isLoading) return <div className="p-3 text-xs text-gray-400">Lädt…</div>;
  if (!t) return <div className="p-3 text-xs text-gray-400">Tour nicht gefunden.</div>;

  const statusOptions: { value: NvTourMutableStatus; label: string }[] = [
    { value: 'PLANNING', label: 'Geplant' },
    { value: 'IN_PROGRESS', label: 'In Fahrt' },
    { value: 'COMPLETED', label: 'Abgeschlossen' },
    { value: 'CANCELLED', label: 'Storniert' },
  ];

  return (
    <div className="p-3 space-y-3">
      <section>
        <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
          NV-Tour
        </h3>
        <Row label="Code">
          <span className="font-mono">{t.nv_stamm_tour?.code ?? '—'}</span>
        </Row>
        <Row label="Datum">
          <span>{t.datum?.slice(0, 10) ?? '—'}</span>
        </Row>
        <Row label="Status">
          <span className="text-gray-700">
            {nvStatusLabel(t.status, undefined)}
          </span>
        </Row>
        <Row label="Sub">
          <span>{t.subunternehmer?.name ?? '—'}</span>
        </Row>
        <Row label="Fahrzeug">
          <InlineEdit
            value={t.fahrzeug_typ}
            onSave={(v) => patchMut.mutateAsync({ fahrzeug_typ: v || null })}
            type="text"
            label="Fahrzeug-Typ"
          />
        </Row>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
          Status-Wechsel
        </h3>
        <Row label="→ Status">
          <InlineEdit
            value={t.status}
            options={statusOptions}
            onSave={(v) => patchMut.mutateAsync({ status: v })}
            type="select"
            label="Tour-Status"
          />
        </Row>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
          Notizen
        </h3>
        <Row label="Notiz">
          <InlineEdit
            value={t.notizen}
            onSave={(v) => patchMut.mutateAsync({ notizen: v || null })}
            type="textarea"
            placeholder="Klick zum Editieren…"
            label="Tour-Notiz"
          />
        </Row>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
          Stops ({t.stops?.length ?? 0})
        </h3>
        {(t.stops ?? []).map((s) => (
          <div key={s.id} className="text-xs flex items-center gap-2 py-0.5">
            <span className="text-gray-400 font-mono w-5 text-right">
              {s.position}.
            </span>
            <span className="font-mono">{s.shipment?.shipment_number ?? '—'}</span>
            <span className="text-[10px] text-gray-500">{s.stop_type ?? ''}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

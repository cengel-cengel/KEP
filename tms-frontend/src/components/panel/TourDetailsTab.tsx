import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, ExternalLink, Warehouse } from 'lucide-react';
import { api } from '../../lib/api';
import InlineEdit from './InlineEdit';
import { nvStatusLabel, type NvTourMutableStatus } from '../../lib/nvTourStatus';
import TourTimeline from '../timeline/TourTimeline';
import { usePanel } from '../../state/panel';
import StickyHead, { type QuickAction } from './StickyHead';
import AcuteSection, {
  sortAcuteItems,
  type AcuteItem,
} from './AcuteSection';
import CollapsibleSection from './CollapsibleSection';
import { getTourSeverity, type SeverityLevel } from '../../lib/severity';
import SplitTourDialog from './dialogs/SplitTourDialog';
import SwapDriverDialog from './dialogs/SwapDriverDialog';
import MoveStopDialog from './dialogs/MoveStopDialog';

interface TourDetail {
  id: string;
  tour_number?: string | null;
  status?: string | null;
  geplante_km?: string | number | null;
  notes?: string | null;
  subcontractors?: { id: string; name: string } | null;
  overload?: {
    isOverloaded?: boolean;
    ldm?: number;
    weight?: number;
  } | null;
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
    planned_arrival_fv?: string | null;
    planned_departure_fv?: string | null;
    risk_severity_fv?: string | null;
    loading_time_from?: string | null;
    loading_time_to?: string | null;
    delivery_time_from?: string | null;
    delivery_time_to?: string | null;
  }>;
}

interface NvTourConflict {
  type: string;
  severity: 'warning' | 'critical';
  msg: string;
  suggested_actions: Array<{
    type:
      | 'SHIFT_STOP_LATER'
      | 'SPLIT_TOUR_AT_STOP'
      | 'SWAP_DRIVER'
      | 'MOVE_STOP_TO_TOUR';
    stop_id?: string;
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
  subunternehmer_id?: string | null;
  geplante_km?: string | number | null;
  overload?: {
    isOverloaded?: boolean;
    ldm?: number;
    weight?: number;
  } | null;
  risk?: {
    max_score: number;
    critical_count: number;
    warning_count: number;
  } | null;
  conflicts?: NvTourConflict[];
  stops?: Array<{
    id: string;
    position: number;
    stop_type?: string;
    servicezeit_min?: number | null;
    planned_arrival?: string | null;
    planned_departure?: string | null;
    risk_score?: number | null;
    risk_severity?: string | null;
    shipment?: {
      id: string;
      shipment_number?: string | null;
      loading_time_from?: string | null;
      loading_time_to?: string | null;
      delivery_time_from?: string | null;
      delivery_time_to?: string | null;
    };
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

// ─── FV-TOUR-BODY ─────────────────────────────────────────────────────

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

  const severity = useMemo<SeverityLevel>(() => {
    if (!tourQ.data) return null;
    const stops = tourQ.data.shipments ?? [];
    const critical = stops.filter((s) => s.risk_severity_fv === 'critical').length;
    const warning = stops.filter((s) => s.risk_severity_fv === 'warning').length;
    return getTourSeverity({
      overload: tourQ.data.overload ?? null,
      risk: { critical_count: critical, warning_count: warning, max_score: null },
    });
  }, [tourQ.data]);

  // P0-10: useMemo MUSS vor early-returns aufgerufen werden
  // (Hooks-Order-Rule). Handle null-t intern.
  const fvAcuteItems = useMemo<AcuteItem[]>(() => {
    const t = tourQ.data;
    if (!t) return [];
    const items: AcuteItem[] = [];
    if (t.overload?.isOverloaded) {
      items.push({
        id: 'overload',
        severity: 'L1',
        icon: 'shield',
        label: 'Tour überladen',
        hint: `LDM ${((t.overload.ldm ?? 0) * 100).toFixed(0)}% / Gewicht ${((t.overload.weight ?? 0) * 100).toFixed(0)}%`,
      });
    }
    for (const s of t.shipments ?? []) {
      const sev = s.risk_severity_fv;
      if (sev !== 'critical' && sev !== 'warning') continue;
      items.push({
        id: `s-${s.id}`,
        severity: sev === 'critical' ? 'L1' : 'L2',
        icon: 'alert',
        label: s.shipment_number ?? s.id.slice(0, 6),
        hint:
          sev === 'critical'
            ? 'Stop außerhalb Zeitfenster (kritisch)'
            : 'Knapper Puffer',
      });
    }
    return sortAcuteItems(items);
  }, [tourQ.data]);

  const openMap = () => {
    const sp = new URLSearchParams({ tour: tourId });
    window.open(
      `/fv-disposition/map-popup?${sp.toString()}`,
      `fv-dispo-map-popup-${tourId}`,
      'width=1200,height=900,noopener=no',
    );
  };
  const openLoading = () =>
    window.open(
      `/loading/${tourId}`,
      `fv-loading-plan-${tourId}`,
      'width=1200,height=900,noopener=no',
    );

  const t = tourQ.data;
  if (tourQ.isLoading) return <div className="p-3 text-xs text-gray-400">Lädt…</div>;
  if (!t) return <div className="p-3 text-xs text-gray-400">Tour nicht gefunden.</div>;

  const km = t.geplante_km != null ? `${Number(t.geplante_km).toFixed(0)} km` : null;
  const sub = t.subcontractors?.name;
  const subLabel = [t.status, km, sub].filter(Boolean).join(' · ');

  const quickActions: QuickAction[] = [
    { label: 'Karte', icon: <ExternalLink size={11} />, onClick: openMap },
    {
      label: 'Beladeplan',
      icon: <Box size={11} />,
      onClick: openLoading,
    },
  ];

  const titleStr = t.tour_number ?? '—';

  return (
    <>
      <StickyHead
        title={titleStr}
        subLabel={subLabel || undefined}
        severity={severity}
        quickActions={quickActions}
      />
      <div className="p-3 space-y-3">
        <AcuteSection items={fvAcuteItems} />

        <CollapsibleSection
          title="Timeline"
          defaultOpen={fvAcuteItems.length > 0}
          storageKey="fv-tour.timeline"
        >
          <FvTourTimelineSection shipments={t.shipments ?? []} />
        </CollapsibleSection>

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

        <CollapsibleSection
          title="Hub-Adressen"
          storageKey="fv-tour.hubs"
        >
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
        </CollapsibleSection>

        <section>
          <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
            Notiz
          </h3>
          <InlineEdit
            value={t.notes}
            onSave={(v) => patchMut.mutateAsync({ comment: v || null })}
            type="textarea"
            placeholder="Klick zum Editieren…"
            label="Tour-Notiz"
          />
        </section>
      </div>
    </>
  );
}

function FvTourTimelineSection({
  shipments,
}: {
  shipments: NonNullable<TourDetail['shipments']>;
}) {
  const panel = usePanel();
  if (shipments.length === 0) {
    return (
      <div className="text-[11px] text-gray-400 italic">
        Keine Stops auf Tour.
      </div>
    );
  }
  const anyScheduled = shipments.some((s) => s.planned_arrival_fv);
  if (!anyScheduled) {
    return (
      <div className="text-[11px] text-gray-400 italic">
        Schedule wird berechnet…
      </div>
    );
  }
  const tlStops = shipments.map((s, i) => ({
    id: s.id,
    position: s.tour_position ?? i + 1,
    stop_type: 'DELIVERY',
    shipment_number: s.shipment_number ?? undefined,
    planned_arrival: s.planned_arrival_fv ?? null,
    planned_departure: s.planned_departure_fv ?? null,
    loading_time_from: s.loading_time_from ?? null,
    loading_time_to: s.loading_time_to ?? null,
    delivery_time_from: s.delivery_time_from ?? null,
    delivery_time_to: s.delivery_time_to ?? null,
    risk_severity: s.risk_severity_fv,
  }));
  return (
    <TourTimeline
      stops={tlStops}
      onStopClick={(stopId) => {
        const found = shipments.find((s) => s.id === stopId);
        if (found?.id) panel.selectShipment(found.id);
      }}
    />
  );
}

// ─── NV-TOUR-BODY ─────────────────────────────────────────────────────

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

  // S-1+T-3.2 action-Dialogs für conflicts.
  const [splitOpen, setSplitOpen] = useState<{ stopId?: string } | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState<{
    stopId: string;
    label: string;
    shipmentId?: string;
  } | null>(null);
  const shiftMut = useMutation({
    mutationFn: async (stopId: string) => {
      await api.post(`/nv-touren/${tourId}/apply-action`, {
        action_type: 'SHIFT_STOP_LATER',
        stop_id: stopId,
        shift_minutes: 15,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', tourId] });
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
    },
  });

  const t = tourQ.data;

  const severity = useMemo<SeverityLevel>(
    () =>
      t
        ? getTourSeverity({
            overload: t.overload ?? null,
            risk: t.risk ?? null,
            conflicts: t.conflicts ?? null,
          })
        : null,
    [t],
  );

  const acuteItems = useMemo<AcuteItem[]>(() => {
    if (!t) return [];
    const items: AcuteItem[] = [];
    // Conflicts
    (t.conflicts ?? []).forEach((c, idx) => {
      const primary = c.suggested_actions[0];
      const onClick = (() => {
        if (!primary) return undefined;
        if (primary.type === 'SHIFT_STOP_LATER' && primary.stop_id) {
          const sid = primary.stop_id;
          return () => shiftMut.mutate(sid);
        }
        if (primary.type === 'SPLIT_TOUR_AT_STOP') {
          return () => setSplitOpen({ stopId: primary.stop_id });
        }
        if (primary.type === 'SWAP_DRIVER') {
          return () => setSwapOpen(true);
        }
        if (primary.type === 'MOVE_STOP_TO_TOUR' && primary.stop_id) {
          const sid = primary.stop_id;
          const found = t.stops?.find((s) => s.id === sid);
          return () =>
            setMoveOpen({
              stopId: sid,
              label: found?.shipment?.shipment_number ?? sid.slice(0, 6),
              shipmentId: (found?.shipment as any)?.id,
            });
        }
        return undefined;
      })();
      const primaryLabel =
        primary?.type === 'SHIFT_STOP_LATER'
          ? '+15min'
          : primary?.type === 'SPLIT_TOUR_AT_STOP'
            ? 'Splitten'
            : primary?.type === 'SWAP_DRIVER'
              ? 'Sub wechseln'
              : primary?.type === 'MOVE_STOP_TO_TOUR'
                ? 'Verschieben'
                : null;
      items.push({
        id: `c-${idx}`,
        severity: c.severity === 'critical' ? 'L1' : 'L2',
        icon: 'shield',
        label: c.msg,
        primaryAction:
          primaryLabel && onClick
            ? { label: primaryLabel, onClick, disabled: shiftMut.isPending }
            : undefined,
      });
    });
    // Risk-Stops
    for (const s of t.stops ?? []) {
      if (s.risk_severity !== 'critical' && s.risk_severity !== 'warning') {
        continue;
      }
      items.push({
        id: `r-${s.id}`,
        severity: s.risk_severity === 'critical' ? 'L1' : 'L2',
        icon: 'alert',
        label: s.shipment?.shipment_number ?? `Stop ${s.position}`,
        hint:
          s.risk_severity === 'critical'
            ? 'Stop außerhalb Zeitfenster'
            : 'Knapper Puffer',
        primaryAction: {
          label: '+15min',
          onClick: () => shiftMut.mutate(s.id),
          disabled: shiftMut.isPending,
        },
      });
    }
    return sortAcuteItems(items);
  }, [t, shiftMut]);

  const openLoading = () =>
    window.open(
      `/nv-loading/${tourId}`,
      `tms-loading-plan-${tourId}`,
      'width=1200,height=900,noopener=no',
    );

  if (tourQ.isLoading) return <div className="p-3 text-xs text-gray-400">Lädt…</div>;
  if (!t) return <div className="p-3 text-xs text-gray-400">Tour nicht gefunden.</div>;

  const statusOptions: { value: NvTourMutableStatus; label: string }[] = [
    { value: 'PLANNING', label: 'Geplant' },
    { value: 'IN_PROGRESS', label: 'In Fahrt' },
    { value: 'COMPLETED', label: 'Abgeschlossen' },
    { value: 'CANCELLED', label: 'Storniert' },
  ];

  const titleStr = t.nv_stamm_tour?.code ?? '—';
  const subLabel = [
    t.datum?.slice(0, 10),
    nvStatusLabel(t.status, undefined),
    t.subunternehmer?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  const quickActions: QuickAction[] = [
    {
      label: 'Beladeplan',
      icon: <Box size={11} />,
      onClick: openLoading,
    },
  ];

  return (
    <>
      <StickyHead
        title={titleStr}
        subLabel={subLabel || undefined}
        severity={severity}
        quickActions={quickActions}
      />
      <div className="p-3 space-y-3">
        <AcuteSection items={acuteItems} />

        <CollapsibleSection
          title="Timeline"
          defaultOpen={
            (t.risk?.warning_count ?? 0) > 0 || (t.risk?.critical_count ?? 0) > 0
          }
          storageKey="nv-tour.timeline"
        >
          <NvTourTimelineSection stops={t.stops ?? []} />
        </CollapsibleSection>

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

        <CollapsibleSection
          title="Status-Wechsel"
          storageKey="nv-tour.status"
        >
          <Row label="→ Status">
            <InlineEdit
              value={t.status}
              options={statusOptions}
              onSave={(v) => patchMut.mutateAsync({ status: v })}
              type="select"
              label="Tour-Status"
            />
          </Row>
        </CollapsibleSection>

        <CollapsibleSection
          title="Stammdaten"
          storageKey="nv-tour.stamm"
        >
          <Row label="Fahrzeug">
            <InlineEdit
              value={t.fahrzeug_typ}
              onSave={(v) => patchMut.mutateAsync({ fahrzeug_typ: v || null })}
              type="text"
              label="Fahrzeug-Typ"
            />
          </Row>
          <Row label="KM">
            <span className="font-mono text-gray-700">
              {t.geplante_km != null ? `${Number(t.geplante_km).toFixed(0)}` : '—'}
            </span>
          </Row>
        </CollapsibleSection>

        <section>
          <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
            Notiz
          </h3>
          <InlineEdit
            value={t.notizen}
            onSave={(v) => patchMut.mutateAsync({ notizen: v || null })}
            type="textarea"
            placeholder="Klick zum Editieren…"
            label="Tour-Notiz"
          />
        </section>
      </div>

      {splitOpen && (
        <SplitTourDialog
          tourId={t.id}
          stops={(t.stops ?? []).map((s) => ({
            id: s.id,
            position: s.position,
            shipment_number: s.shipment?.shipment_number ?? null,
          }))}
          preselectedStopId={splitOpen.stopId}
          onClose={() => setSplitOpen(null)}
        />
      )}
      {swapOpen && (
        <SwapDriverDialog
          tourId={t.id}
          currentSubId={t.subunternehmer?.id ?? t.subunternehmer_id ?? null}
          onClose={() => setSwapOpen(false)}
        />
      )}
      {moveOpen && (
        <MoveStopDialog
          fromTourId={t.id}
          stopId={moveOpen.stopId}
          stopLabel={moveOpen.label}
          shipmentId={moveOpen.shipmentId}
          onClose={() => setMoveOpen(null)}
        />
      )}
    </>
  );
}

function NvTourTimelineSection({
  stops,
}: {
  stops: NonNullable<NvTourDetail['stops']>;
}) {
  const panel = usePanel();
  const tlStops = stops.map((s) => ({
    id: s.id,
    position: s.position,
    stop_type: s.stop_type,
    shipment_number: s.shipment?.shipment_number ?? undefined,
    servicezeit_min: s.servicezeit_min,
    planned_arrival: s.planned_arrival ?? null,
    planned_departure: s.planned_departure ?? null,
    loading_time_from: s.shipment?.loading_time_from ?? null,
    loading_time_to: s.shipment?.loading_time_to ?? null,
    delivery_time_from: s.shipment?.delivery_time_from ?? null,
    delivery_time_to: s.shipment?.delivery_time_to ?? null,
    risk_severity: s.risk_severity,
  }));
  return (
    <TourTimeline
      stops={tlStops}
      onStopClick={(stopId) => {
        const found = stops.find((s) => s.id === stopId);
        if (found?.shipment?.id) panel.selectShipment(found.shipment.id);
      }}
    />
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  ExternalLink,
  Warehouse,
  Trash2,
  ArrowRightLeft,
  Scissors,
  Circle,
  StickyNote,
} from 'lucide-react';
import ContextMenu from '../loadingplan/ContextMenu';
import { useLongPress } from '../../hooks/useLongPress';
import StopStatusBadge, {
  STOP_STATUS_UI_OPTIONS,
  stopStatusMeta,
} from '../nv/StopStatusBadge';
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
import { useWorkspace } from '../../state/workspace';
import { Sparkles } from 'lucide-react';
import TourAggregateStrip, {
  type TourAggregates,
} from './TourAggregateStrip';
import { isoToWochentag, wochentagLabel } from '../../lib/wochentage';
import { registerHotkey } from '../../lib/hotkeys';
import { toCSV, downloadCSV } from '../../lib/csv';
import SplitTourDialog from './dialogs/SplitTourDialog';
import SwapDriverDialog from './dialogs/SwapDriverDialog';
import MoveStopDialog from './dialogs/MoveStopDialog';
import SplitShipmentDialog from './dialogs/SplitShipmentDialog';

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
  total_kosten_eur?: string | number | null;
  shipments?: Array<{
    id: string;
    shipment_number?: string | null;
    tour_position?: number | null;
    weight_kg?: string | number | null;
    customers?: { id: string; name: string } | null;
    addresses_shipments_loading_address_idToaddresses?: {
      zip?: string | null;
      city?: string | null;
    } | null;
    addresses_shipments_delivery_address_idToaddresses?: {
      zip?: string | null;
      city?: string | null;
    } | null;
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
  nv_stamm_tour?: {
    code: string;
    name: string;
    wochentage?: string[];
  } | null;
  subunternehmer?: { id: string; name: string } | null;
  subunternehmer_id?: string | null;
  geplante_km?: string | number | null;
  total_kosten_eur?: string | number | null;
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
    status?: string | null;
    notizen?: string | null;
    servicezeit_min?: number | null;
    planned_arrival?: string | null;
    planned_departure?: string | null;
    risk_score?: number | null;
    risk_severity?: string | null;
    shipment?: {
      id: string;
      shipment_number?: string | null;
      weight_kg?: string | number | null;
      customers?: { id: string; name: string } | null;
      loading_time_from?: string | null;
      loading_time_to?: string | null;
      delivery_time_from?: string | null;
      delivery_time_to?: string | null;
      addresses_shipments_loading_address_idToaddresses?: {
        zip?: string | null;
        city?: string | null;
      } | null;
      addresses_shipments_delivery_address_idToaddresses?: {
        zip?: string | null;
        city?: string | null;
      } | null;
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
  const panel = usePanel();
  const tourQ = useQuery<TourDetail>({
    queryKey: ['fv-tour-detail', tourId],
    queryFn: async () => (await api.get<TourDetail>(`/tours/${tourId}`)).data,
    staleTime: 30_000,
  });

  // B'-2: 2 Sub-Tabs (Stops compact, Tabelle detail).
  const [fvSubTab, setFvSubTab] = useState<'stops' | 'tabelle'>('stops');
  useEffect(() => {
    const unsubs = [
      registerHotkey('1', () => setFvSubTab('stops'), { scope: 'panel' }),
      registerHotkey('2', () => setFvSubTab('tabelle'), { scope: 'panel' }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // C-2.1 FV: SplitShipmentDialog state.
  const [fvSplitOpen, setFvSplitOpen] = useState<string | null>(null);

  // B'-2: FV-Aggregates (Sendg./kg/km/€).
  const fvAggregates = useMemo<TourAggregates>(() => {
    const data = tourQ.data;
    if (!data) {
      return { shipmentCount: 0, weightKgSum: 0, kmTotal: null, euroTotal: null };
    }
    let weight = 0;
    for (const s of data.shipments ?? []) {
      if (s.weight_kg != null) {
        const w = Number(s.weight_kg);
        if (Number.isFinite(w)) weight += w;
      }
    }
    return {
      shipmentCount: (data.shipments ?? []).length,
      weightKgSum: weight,
      kmTotal: data.geplante_km != null ? Number(data.geplante_km) : null,
      euroTotal:
        data.total_kosten_eur != null ? Number(data.total_kosten_eur) : null,
    };
  }, [tourQ.data]);

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
      <TourAggregateStrip aggregates={fvAggregates} />
      <div className="p-3 space-y-3">
        <AcuteSection items={fvAcuteItems} />

        <CollapsibleSection
          title="Timeline"
          defaultOpen={fvAcuteItems.length > 0}
          storageKey="fv-tour.timeline"
        >
          <FvTourTimelineSection shipments={t.shipments ?? []} />
        </CollapsibleSection>

        <FvShipmentsSubTabs
          shipments={t.shipments ?? []}
          subTab={fvSubTab}
          setSubTab={setFvSubTab}
          onShipmentClick={(id) => panel.selectShipment(id)}
          onSplitShipment={(id) => setFvSplitOpen(id)}
        />

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
      {fvSplitOpen && (
        <SplitShipmentDialog
          tourId={tourId}
          shipmentId={fvSplitOpen}
          mode="fv"
          onClose={() => setFvSplitOpen(null)}
        />
      )}
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
  const panel = usePanel();
  // A' Sprint: selectedStopId aus workspace.tsx (bidirektionale
  // Hervorhebung mit MapPanel-Marker).
  const { selectedStopId, setSelectedStopId } = useWorkspace();
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

  // B' Sprint: Sub-Tab-State (Stopps / Stoppliste / Sendungsliste).
  // Session-only, kein localStorage (UI-Convenience, kein User-Setting).
  const [subTab, setSubTab] = useState<
    'stopps' | 'stoppliste' | 'sendungsliste'
  >('stopps');

  // B' Sprint: Hotkeys 1/2/3 für Sub-Tab-Wechsel.
  // scope='panel' (W-2 Convention), skip-in-Inputs default true.
  useEffect(() => {
    const unsubs = [
      registerHotkey('1', () => setSubTab('stopps'), { scope: 'panel' }),
      registerHotkey('2', () => setSubTab('stoppliste'), { scope: 'panel' }),
      registerHotkey('3', () => setSubTab('sendungsliste'), { scope: 'panel' }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // B' Sprint: Aggregates für Strip (Sendung-count, kg, km, €).
  const aggregates = useMemo<TourAggregates>(() => {
    const data = tourQ.data;
    if (!data) {
      return { shipmentCount: 0, weightKgSum: 0, kmTotal: null, euroTotal: null };
    }
    const shipmentIds = new Set<string>();
    let weight = 0;
    for (const s of data.stops ?? []) {
      const sh = s.shipment;
      if (sh?.id) shipmentIds.add(sh.id);
      if (sh?.weight_kg != null) {
        const w = Number(sh.weight_kg);
        if (Number.isFinite(w)) weight += w;
      }
    }
    return {
      shipmentCount: shipmentIds.size,
      weightKgSum: weight,
      kmTotal: data.geplante_km != null ? Number(data.geplante_km) : null,
      euroTotal:
        data.total_kosten_eur != null ? Number(data.total_kosten_eur) : null,
    };
  }, [tourQ.data]);

  // A' Sprint: missing-Geocode-Count berechnen für conditional Sparkles-Btn.
  // tour.stops.shipment.addresses_*.lat/lng — addresses sind in
  // TOUR_INCLUDE eingeschlossen (s. nv-touren.service.ts:101+112).
  const missingGeocodeCount = useMemo(() => {
    if (!tourQ.data) return 0;
    const seen = new Set<string>();
    let n = 0;
    for (const s of tourQ.data.stops ?? []) {
      const sh: any = s.shipment;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh?.addresses_shipments_delivery_address_idToaddresses
          : sh?.addresses_shipments_loading_address_idToaddresses;
      if (!addr?.id) continue;
      if (seen.has(addr.id)) continue;
      seen.add(addr.id);
      if (addr.lat == null || addr.lng == null) n++;
    }
    return n;
  }, [tourQ.data]);

  // A' Sprint: Geocode-Stops Mutation.
  const geocodeMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        total: number;
        candidates: number;
        geocoded: number;
        failed: number;
        skipped: number;
      }>(`/nv-touren/${tourId}/geocode-stops`);
      return data;
    },
    onSuccess: () => {
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
  // C-2: SplitShipmentDialog state.
  const [splitShipmentOpen, setSplitShipmentOpen] = useState<{
    stopId: string;
    shipmentId: string;
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

  // Sprint C: Stop-Mutationen für ContextMenu (Remove/PATCH).
  const removeStopMut = useMutation({
    mutationFn: async (stopId: string) => {
      await api.delete(`/nv-touren/${tourId}/stops/${stopId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', tourId] });
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
    },
  });
  const patchStopMut = useMutation({
    mutationFn: async ({
      stopId,
      body,
    }: {
      stopId: string;
      body: { status?: string; notizen?: string | null };
    }) => {
      await api.patch(`/nv-touren/${tourId}/stops/${stopId}`, body);
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

  // B' Sprint: Aggregate-Strip date-label (Wochentag · ISO-Datum).
  const datumWochentag = t.datum ? isoToWochentag(t.datum) : null;
  const dateLabel = datumWochentag
    ? `${wochentagLabel(datumWochentag)} · ${t.datum.slice(0, 10)}`
    : t.datum?.slice(0, 10);

  return (
    <>
      <StickyHead
        title={titleStr}
        subLabel={subLabel || undefined}
        severity={severity}
        quickActions={quickActions}
      />
      <TourAggregateStrip
        aggregates={aggregates}
        stammSchedule={t.nv_stamm_tour?.wochentage ?? null}
        dateLabel={dateLabel}
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

        <NvStopsSubTabs
          stops={t.stops ?? []}
          selectedStopId={selectedStopId}
          setSelectedStopId={setSelectedStopId}
          panel={panel}
          subTab={subTab}
          setSubTab={setSubTab}
          missingGeocodeCount={missingGeocodeCount}
          onGeocode={() => geocodeMut.mutate()}
          geocodeMutData={geocodeMut.data}
          geocodePending={geocodeMut.isPending}
          tourDatum={t.datum}
          tourTitle={titleStr}
          onRemoveStop={(stopId) => {
            if (confirm('Stop von Tour entfernen?')) {
              removeStopMut.mutate(stopId);
            }
          }}
          onMoveStop={(stop) =>
            setMoveOpen({
              stopId: stop.id,
              label: stop.shipment?.shipment_number ?? stop.id.slice(0, 6),
              shipmentId: stop.shipment?.id,
            })
          }
          onSetStopStatus={(stopId, status) =>
            patchStopMut.mutate({ stopId, body: { status } })
          }
          onSetStopNotiz={(stopId, notizen) =>
            patchStopMut.mutate({ stopId, body: { notizen } })
          }
          onSplitShipment={(payload) => setSplitShipmentOpen(payload)}
        />

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
          requireAdr={
            t.conflicts?.some((c) => c.type === 'HAZMAT_DRIVER') ?? false
          }
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
      {splitShipmentOpen && (
        <SplitShipmentDialog
          tourId={t.id}
          stopId={splitShipmentOpen.stopId}
          shipmentId={splitShipmentOpen.shipmentId}
          onClose={() => setSplitShipmentOpen(null)}
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

// ─── B' SPRINT: NV-STOPS-SUB-TABS ────────────────────────────────────

interface NvStopsSubTabsProps {
  stops: NonNullable<NvTourDetail['stops']>;
  selectedStopId: string | null;
  setSelectedStopId: (id: string | null) => void;
  panel: ReturnType<typeof usePanel>;
  subTab: 'stopps' | 'stoppliste' | 'sendungsliste';
  setSubTab: (t: 'stopps' | 'stoppliste' | 'sendungsliste') => void;
  missingGeocodeCount: number;
  onGeocode: () => void;
  geocodeMutData?: {
    geocoded: number;
    failed: number;
    skipped: number;
  } | null;
  geocodePending: boolean;
  tourDatum: string;
  tourTitle: string;
  /** Sprint C: ContextMenu-Action für Stop-Remove (mit confirm). */
  onRemoveStop: (stopId: string) => void;
  /** Sprint C: ContextMenu-Action "in andere Tour" → MoveStopDialog. */
  onMoveStop: (
    stop: NonNullable<NvTourDetail['stops']>[number],
  ) => void;
  /** Sprint C: Status-Submenu PATCH stop.status. */
  onSetStopStatus: (stopId: string, status: string) => void;
  /** Sprint C: Notiz-Popover PATCH stop.notizen. */
  onSetStopNotiz: (stopId: string, notizen: string | null) => void;
  /** C-2: Sendung-Splitten → SplitShipmentDialog öffnen. */
  onSplitShipment: (payload: { stopId: string; shipmentId: string }) => void;
}

function NvStopsSubTabs({
  stops,
  selectedStopId,
  setSelectedStopId,
  panel,
  subTab,
  setSubTab,
  missingGeocodeCount,
  onGeocode,
  geocodeMutData,
  geocodePending,
  tourDatum,
  tourTitle,
  onRemoveStop,
  onMoveStop,
  onSetStopStatus,
  onSetStopNotiz,
  onSplitShipment,
}: NvStopsSubTabsProps) {
  // C' Sprint: gemeinsamer Search-State für Stoppliste + Sendungsliste
  // (decision 4B). Stopps-Tab nutzt Search nicht.
  const [search, setSearch] = useState('');
  const showSearch = subTab === 'stoppliste' || subTab === 'sendungsliste';
  return (
    <section>
      <div className="flex items-center gap-1 mb-2 text-xs">
        <SubTabBtn n="1" active={subTab === 'stopps'} onClick={() => setSubTab('stopps')}>
          Stopps
        </SubTabBtn>
        <SubTabBtn n="2" active={subTab === 'stoppliste'} onClick={() => setSubTab('stoppliste')}>
          Stoppliste
        </SubTabBtn>
        <SubTabBtn n="3" active={subTab === 'sendungsliste'} onClick={() => setSubTab('sendungsliste')}>
          Sendungsliste
        </SubTabBtn>
        {missingGeocodeCount > 0 && (
          <button
            type="button"
            onClick={onGeocode}
            disabled={geocodePending}
            className="ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-300 rounded hover:bg-blue-100 disabled:opacity-50"
            title={`${missingGeocodeCount} Adressen ohne Koordinaten`}
          >
            <Sparkles size={10} />
            {geocodePending ? 'Geocodieren…' : `${missingGeocodeCount} geo`}
          </button>
        )}
      </div>
      {geocodeMutData && (
        <div className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 mb-1">
          {geocodeMutData.geocoded} geocoded · {geocodeMutData.failed} fehl ·{' '}
          {geocodeMutData.skipped} bereits
        </div>
      )}
      {showSearch && (
        <div className="flex items-center gap-1 mb-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen…"
            className="flex-1 text-[11px] px-2 py-0.5 border border-gray-300 rounded"
          />
          {subTab === 'stoppliste' && (
            <button
              type="button"
              onClick={() => downloadStoppListeCsv(stops, tourTitle, tourDatum)}
              className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200"
              title="CSV-Export (DE-Locale)"
            >
              CSV
            </button>
          )}
        </div>
      )}

      {subTab === 'stopps' && (
        <NvStopsView
          stops={stops}
          selectedStopId={selectedStopId}
          setSelectedStopId={setSelectedStopId}
          tourDatum={tourDatum}
          onRemoveStop={onRemoveStop}
          onMoveStop={onMoveStop}
          onSetStopStatus={onSetStopStatus}
          onSetStopNotiz={onSetStopNotiz}
          onSplitShipment={onSplitShipment}
        />
      )}
      {subTab === 'stoppliste' && (
        <NvStoppListeView
          stops={stops}
          selectedStopId={selectedStopId}
          setSelectedStopId={setSelectedStopId}
          search={search}
        />
      )}
      {subTab === 'sendungsliste' && (
        <NvSendungslisteView
          stops={stops}
          onShipmentClick={(id) => panel.selectShipment(id)}
          search={search}
        />
      )}
    </section>
  );
}

function SubTabBtn({
  n,
  active,
  onClick,
  children,
}: {
  n: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
      title={`Hotkey: ${n}`}
    >
      <span className="font-mono text-[9px] opacity-70">{n}</span>
      {children}
    </button>
  );
}

function NvStopsView({
  stops,
  selectedStopId,
  setSelectedStopId,
  tourDatum,
  onRemoveStop,
  onMoveStop,
  onSetStopStatus,
  onSetStopNotiz,
  onSplitShipment,
}: {
  stops: NonNullable<NvTourDetail['stops']>;
  selectedStopId: string | null;
  setSelectedStopId: (id: string | null) => void;
  tourDatum: string;
  onRemoveStop: (stopId: string) => void;
  onMoveStop: (stop: NonNullable<NvTourDetail['stops']>[number]) => void;
  onSetStopStatus: (stopId: string, status: string) => void;
  onSetStopNotiz: (stopId: string, notizen: string | null) => void;
  onSplitShipment: (payload: { stopId: string; shipmentId: string }) => void;
}) {
  const wt = isoToWochentag(tourDatum);
  const groupLabel = wt
    ? `${wochentagLabel(wt)} · ${tourDatum.slice(0, 10)}`
    : tourDatum.slice(0, 10);
  const [menu, setMenu] = useState<{
    stop: NonNullable<NvTourDetail['stops']>[number];
    x: number;
    y: number;
  } | null>(null);
  const [submenu, setSubmenu] = useState<'status' | null>(null);
  const [notizEditor, setNotizEditor] = useState<{
    stopId: string;
    initial: string;
  } | null>(null);
  return (
    <div>
      <div className="text-[10px] font-mono uppercase text-gray-500 mb-1 border-b border-gray-200 pb-0.5">
        {groupLabel} · {stops.length}
      </div>
      {stops.map((s) => (
        <StopRow
          key={s.id}
          stop={s}
          isSelected={selectedStopId === s.id}
          onToggleSelect={() =>
            setSelectedStopId(selectedStopId === s.id ? null : s.id)
          }
          onOpenMenu={(x, y) => {
            setMenu({ stop: s, x, y });
            setSubmenu(null);
          }}
        />
      ))}
      {menu && submenu === null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Stop entfernen',
              icon: <Trash2 size={12} />,
              danger: true,
              onClick: () => onRemoveStop(menu.stop.id),
            },
            {
              label: 'In andere Tour…',
              icon: <ArrowRightLeft size={12} />,
              onClick: () => onMoveStop(menu.stop),
            },
            {
              label: 'Sendung splitten',
              icon: <Scissors size={12} />,
              disabled: !menu.stop.shipment?.id,
              onClick: () => {
                const sid = menu.stop.shipment?.id;
                if (sid)
                  onSplitShipment({ stopId: menu.stop.id, shipmentId: sid });
              },
            },
            {
              label: 'Status setzen ▶',
              icon: <Circle size={12} />,
              onClick: () => setSubmenu('status'),
            },
            {
              label: menu.stop.notizen
                ? 'Notiz bearbeiten'
                : 'Notiz hinzufügen',
              icon: <StickyNote size={12} />,
              onClick: () =>
                setNotizEditor({
                  stopId: menu.stop.id,
                  initial: menu.stop.notizen ?? '',
                }),
            },
          ]}
        />
      )}
      {menu && submenu === 'status' && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={STOP_STATUS_UI_OPTIONS.map((opt) => {
            const meta = stopStatusMeta(opt);
            return {
              label: meta.label,
              icon: (
                <span
                  className={`inline-block w-2 h-2 rounded-full ${meta.dotClass}`}
                  aria-hidden
                />
              ),
              onClick: () => onSetStopStatus(menu.stop.id, opt),
            };
          })}
        />
      )}
      {notizEditor && (
        <NotizEditor
          initial={notizEditor.initial}
          onSave={(text) => {
            onSetStopNotiz(notizEditor.stopId, text || null);
            setNotizEditor(null);
            setMenu(null);
          }}
          onCancel={() => setNotizEditor(null)}
        />
      )}
    </div>
  );
}

function StopRow({
  stop,
  isSelected,
  onToggleSelect,
  onOpenMenu,
}: {
  stop: NonNullable<NvTourDetail['stops']>[number];
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpenMenu: (x: number, y: number) => void;
}) {
  const lp = useLongPress((x, y) => onOpenMenu(x, y));
  return (
    <button
      type="button"
      onClick={onToggleSelect}
      {...lp}
      className={`w-full text-left text-xs flex items-center gap-2 py-0.5 px-1 rounded ${
        isSelected
          ? 'bg-amber-50 border-l-2 border-amber-500'
          : 'hover:bg-gray-50 border-l-2 border-transparent'
      }`}
    >
      <span className="text-gray-400 font-mono w-5 text-right">
        {stop.position}.
      </span>
      <StopStatusBadge status={stop.status} compact />
      <span className="font-mono">
        {stop.shipment?.shipment_number ?? '—'}
      </span>
      <span className="text-[10px] text-gray-500">
        {stop.stop_type ?? ''}
      </span>
      {stop.notizen && (
        <StickyNote
          size={11}
          className="text-amber-600 ml-auto"
          aria-label={`Notiz: ${stop.notizen}`}
        />
      )}
    </button>
  );
}

function NotizEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/40 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-3 py-2">
          <h3 className="font-semibold text-sm">Stop-Notiz</h3>
        </div>
        <div className="p-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onSave(text);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
            placeholder="Notiz eingeben… (Cmd+S speichern, Esc abbrechen)"
            className="w-full border rounded px-2 py-1 text-xs h-24 resize-y"
          />
        </div>
        <div className="flex justify-end gap-2 border-t px-3 py-2">
          <button
            onClick={onCancel}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            onClick={() => onSave(text)}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

type StoppSortKey = 'pos' | 'sendung' | 'ort' | 'zeit' | 'kg';
type SendungsSortKey = 'sendung' | 'kunde' | 'kg';
type SortDir = 'asc' | 'desc';

function toggleSort<T extends string>(
  prev: { key: T; dir: SortDir },
  next: T,
): { key: T; dir: SortDir } {
  if (prev.key === next) return { key: next, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
  return { key: next, dir: 'asc' };
}

function sortArrow(active: boolean, dir: SortDir): string {
  if (!active) return '';
  return dir === 'asc' ? ' ↑' : ' ↓';
}

interface StoppRow {
  id: string;
  position: number;
  sendung: string;
  ort: string;
  zeit: string;
  zeitSort: number;
  kg: number | null;
}

export function buildStoppRows(
  stops: NonNullable<NvTourDetail['stops']>,
): StoppRow[] {
  return stops.map((s) => {
    const sh = s.shipment;
    const addr =
      s.stop_type === 'DELIVERY'
        ? sh?.addresses_shipments_delivery_address_idToaddresses
        : sh?.addresses_shipments_loading_address_idToaddresses;
    const ort = addr
      ? `${addr.zip ?? ''} ${addr.city ?? ''}`.trim() || '—'
      : '—';
    const zeitDate = s.planned_arrival ? new Date(s.planned_arrival) : null;
    const zeit = zeitDate
      ? zeitDate.toLocaleTimeString('de', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
    return {
      id: s.id,
      position: s.position,
      sendung: sh?.shipment_number ?? '—',
      ort,
      zeit,
      zeitSort: zeitDate ? zeitDate.getTime() : Number.POSITIVE_INFINITY,
      kg: sh?.weight_kg != null ? Number(sh.weight_kg) : null,
    };
  });
}

export function sortStoppRows(
  rows: StoppRow[],
  key: StoppSortKey,
  dir: SortDir,
): StoppRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  const cmp = (a: StoppRow, b: StoppRow): number => {
    switch (key) {
      case 'pos':
        return (a.position - b.position) * sign;
      case 'sendung':
        return a.sendung.localeCompare(b.sendung) * sign;
      case 'ort':
        return a.ort.localeCompare(b.ort) * sign;
      case 'zeit':
        return (a.zeitSort - b.zeitSort) * sign;
      case 'kg':
        return ((a.kg ?? -Infinity) - (b.kg ?? -Infinity)) * sign;
    }
  };
  return [...rows].sort(cmp);
}

export function filterStoppRows(rows: StoppRow[], search: string): StoppRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.sendung.toLowerCase().includes(q) ||
      r.ort.toLowerCase().includes(q),
  );
}

export function downloadStoppListeCsv(
  stops: NonNullable<NvTourDetail['stops']>,
  tourTitle: string,
  tourDatum: string,
): void {
  const rows = buildStoppRows(stops);
  const csv = toCSV([
    ['#', 'Sendung', 'Ort', 'Zeit', 'kg'],
    ...rows.map((r) => [r.position, r.sendung, r.ort, r.zeit, r.kg]),
  ]);
  const safeTitle = tourTitle.replace(/[^A-Za-z0-9_-]/g, '_') || 'tour';
  const safeDate = tourDatum?.slice(0, 10) ?? '';
  downloadCSV(`stoppliste-${safeTitle}-${safeDate}.csv`, csv);
}

function NvStoppListeView({
  stops,
  selectedStopId,
  setSelectedStopId,
  search,
}: {
  stops: NonNullable<NvTourDetail['stops']>;
  selectedStopId: string | null;
  setSelectedStopId: (id: string | null) => void;
  search: string;
}) {
  const [sort, setSort] = useState<{ key: StoppSortKey; dir: SortDir }>({
    key: 'pos',
    dir: 'asc',
  });
  const rows = useMemo(() => {
    const base = buildStoppRows(stops);
    const filtered = filterStoppRows(base, search);
    return sortStoppRows(filtered, sort.key, sort.dir);
  }, [stops, search, sort]);
  const onSort = (k: StoppSortKey) => setSort((prev) => toggleSort(prev, k));
  const arrow = (k: StoppSortKey) => sortArrow(sort.key === k, sort.dir);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase text-gray-500 border-b select-none">
          <th
            className="text-left py-0.5 w-6 cursor-pointer hover:text-gray-700"
            onClick={() => onSort('pos')}
          >
            #{arrow('pos')}
          </th>
          <th
            className="text-left py-0.5 cursor-pointer hover:text-gray-700"
            onClick={() => onSort('sendung')}
          >
            Sendung{arrow('sendung')}
          </th>
          <th
            className="text-left py-0.5 cursor-pointer hover:text-gray-700"
            onClick={() => onSort('ort')}
          >
            Ort{arrow('ort')}
          </th>
          <th
            className="text-left py-0.5 w-12 cursor-pointer hover:text-gray-700"
            onClick={() => onSort('zeit')}
          >
            Zeit{arrow('zeit')}
          </th>
          <th
            className="text-right py-0.5 w-10 cursor-pointer hover:text-gray-700"
            onClick={() => onSort('kg')}
          >
            kg{arrow('kg')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const isSelected = selectedStopId === r.id;
          return (
            <tr
              key={r.id}
              onClick={() => setSelectedStopId(isSelected ? null : r.id)}
              className={`cursor-pointer ${
                isSelected ? 'bg-amber-50' : 'hover:bg-gray-50'
              }`}
            >
              <td className="font-mono text-gray-500">{r.position}</td>
              <td className="font-mono truncate">{r.sendung}</td>
              <td className="truncate text-gray-700">{r.ort}</td>
              <td className="text-gray-600 font-mono text-[10px]">{r.zeit}</td>
              <td className="text-right font-mono">
                {r.kg != null ? Math.round(r.kg) : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface SendungRow {
  id: string;
  number: string;
  customer: string;
  weight: number;
}

export function buildSendungRows(
  stops: NonNullable<NvTourDetail['stops']>,
): SendungRow[] {
  const map = new Map<string, SendungRow>();
  for (const s of stops) {
    const sh = s.shipment;
    if (!sh?.id) continue;
    if (map.has(sh.id)) continue;
    map.set(sh.id, {
      id: sh.id,
      number: sh.shipment_number ?? '—',
      customer: sh.customers?.name ?? '—',
      weight: sh.weight_kg != null ? Number(sh.weight_kg) : 0,
    });
  }
  return [...map.values()];
}

export function sortSendungRows(
  rows: SendungRow[],
  key: SendungsSortKey,
  dir: SortDir,
): SendungRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  const cmp = (a: SendungRow, b: SendungRow): number => {
    switch (key) {
      case 'sendung':
        return a.number.localeCompare(b.number) * sign;
      case 'kunde':
        return a.customer.localeCompare(b.customer) * sign;
      case 'kg':
        return (a.weight - b.weight) * sign;
    }
  };
  return [...rows].sort(cmp);
}

export function filterSendungRows(
  rows: SendungRow[],
  search: string,
): SendungRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.number.toLowerCase().includes(q) ||
      r.customer.toLowerCase().includes(q),
  );
}

function NvSendungslisteView({
  stops,
  onShipmentClick,
  search,
}: {
  stops: NonNullable<NvTourDetail['stops']>;
  onShipmentClick: (id: string) => void;
  search: string;
}) {
  const [sort, setSort] = useState<{ key: SendungsSortKey; dir: SortDir }>({
    key: 'sendung',
    dir: 'asc',
  });
  const rows = useMemo(() => {
    const base = buildSendungRows(stops);
    const filtered = filterSendungRows(base, search);
    return sortSendungRows(filtered, sort.key, sort.dir);
  }, [stops, search, sort]);
  const onSort = (k: SendungsSortKey) => setSort((prev) => toggleSort(prev, k));
  const arrow = (k: SendungsSortKey) => sortArrow(sort.key === k, sort.dir);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase text-gray-500 border-b select-none">
          <th
            className="text-left py-0.5 cursor-pointer hover:text-gray-700"
            onClick={() => onSort('sendung')}
          >
            Sendung{arrow('sendung')}
          </th>
          <th
            className="text-left py-0.5 cursor-pointer hover:text-gray-700"
            onClick={() => onSort('kunde')}
          >
            Kunde{arrow('kunde')}
          </th>
          <th
            className="text-right py-0.5 w-12 cursor-pointer hover:text-gray-700"
            onClick={() => onSort('kg')}
          >
            kg{arrow('kg')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            onClick={() => onShipmentClick(r.id)}
            className="cursor-pointer hover:bg-blue-50"
          >
            <td className="font-mono truncate">{r.number}</td>
            <td className="truncate text-gray-700">{r.customer}</td>
            <td className="text-right font-mono">
              {r.weight ? Math.round(r.weight) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── B'-2: FV SHIPMENTS SUB-TABS (2 Tabs: Stops, Tabelle) ──────

type FvShipmentItem = NonNullable<TourDetail['shipments']>[number];

function FvShipmentsSubTabs({
  shipments,
  subTab,
  setSubTab,
  onShipmentClick,
  onSplitShipment,
}: {
  shipments: NonNullable<TourDetail['shipments']>;
  subTab: 'stops' | 'tabelle';
  setSubTab: (t: 'stops' | 'tabelle') => void;
  onShipmentClick: (id: string) => void;
  onSplitShipment: (shipmentId: string) => void;
}) {
  return (
    <section>
      <div className="flex items-center gap-1 mb-2 text-xs">
        <SubTabBtn n="1" active={subTab === 'stops'} onClick={() => setSubTab('stops')}>
          Stops
        </SubTabBtn>
        <SubTabBtn n="2" active={subTab === 'tabelle'} onClick={() => setSubTab('tabelle')}>
          Tabelle
        </SubTabBtn>
      </div>
      {subTab === 'stops' && (
        <FvStopsListView shipments={shipments} onShipmentClick={onShipmentClick} />
      )}
      {subTab === 'tabelle' && (
        <FvShipmentsTableView
          shipments={shipments}
          onShipmentClick={onShipmentClick}
          onSplitShipment={onSplitShipment}
        />
      )}
    </section>
  );
}

function FvStopsListView({
  shipments,
  onShipmentClick,
}: {
  shipments: NonNullable<TourDetail['shipments']>;
  onShipmentClick: (id: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase text-gray-500 mb-1 border-b border-gray-200 pb-0.5">
        Stops · {shipments.length}
      </div>
      {shipments.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onShipmentClick(s.id)}
          className="w-full text-left text-xs flex items-center gap-2 py-0.5 px-1 rounded hover:bg-gray-50"
        >
          <span className="text-gray-400 font-mono w-5 text-right">
            {(s.tour_position ?? i + 1)}.
          </span>
          <span className="font-mono">{s.shipment_number ?? '—'}</span>
          <span className="truncate text-gray-600 ml-2">
            {s.customers?.name ?? ''}
          </span>
        </button>
      ))}
    </div>
  );
}

function fvShipmentOrt(s: FvShipmentItem): string {
  const addr =
    s.addresses_shipments_delivery_address_idToaddresses ??
    s.addresses_shipments_loading_address_idToaddresses;
  if (!addr) return '—';
  return `${addr.zip ?? ''} ${addr.city ?? ''}`.trim() || '—';
}

function fvShipmentZeit(s: FvShipmentItem): string {
  if (!s.planned_arrival_fv) return '—';
  return new Date(s.planned_arrival_fv).toLocaleTimeString('de', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function FvShipmentsTableView({
  shipments,
  onShipmentClick,
  onSplitShipment,
}: {
  shipments: NonNullable<TourDetail['shipments']>;
  onShipmentClick: (id: string) => void;
  onSplitShipment: (shipmentId: string) => void;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase text-gray-500 border-b">
          <th className="text-left py-0.5 w-6">#</th>
          <th className="text-left py-0.5">Sendung</th>
          <th className="text-left py-0.5">Kunde</th>
          <th className="text-left py-0.5">Ort</th>
          <th className="text-left py-0.5 w-12">Zeit</th>
          <th className="text-right py-0.5 w-10">kg</th>
          <th className="text-center py-0.5 w-6"></th>
        </tr>
      </thead>
      <tbody>
        {shipments.map((s, i) => (
          <tr
            key={s.id}
            onClick={() => onShipmentClick(s.id)}
            className="cursor-pointer hover:bg-blue-50"
          >
            <td className="font-mono text-gray-500">{s.tour_position ?? i + 1}</td>
            <td className="font-mono truncate">{s.shipment_number ?? '—'}</td>
            <td className="truncate text-gray-700">{s.customers?.name ?? '—'}</td>
            <td className="truncate text-gray-700">{fvShipmentOrt(s)}</td>
            <td className="text-gray-600 font-mono text-[10px]">{fvShipmentZeit(s)}</td>
            <td className="text-right font-mono">
              {s.weight_kg != null ? Math.round(Number(s.weight_kg)) : '—'}
            </td>
            <td>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSplitShipment(s.id);
                }}
                className="inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded"
                aria-label="Sendung splitten"
                title="Sendung splitten"
              >
                <Scissors size={11} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

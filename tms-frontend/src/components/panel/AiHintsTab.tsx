import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Lightbulb,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePanel } from '../../state/panel';
import { severityColorClass, type SeverityLevel } from '../../lib/severity';
import SplitTourDialog from './dialogs/SplitTourDialog';
import SwapDriverDialog from './dialogs/SwapDriverDialog';
import MoveStopDialog from './dialogs/MoveStopDialog';

/**
 * T-3.2 AiHintsTab — Risk-Stops + Konflikte + Action-Buttons.
 *
 * Actions:
 *   SHIFT_STOP_LATER     — inline +15min (kein Dialog)
 *   SPLIT_TOUR_AT_STOP   → SplitTourDialog
 *   SWAP_DRIVER          → SwapDriverDialog
 *   MOVE_STOP_TO_TOUR    → MoveStopDialog
 */

interface NvStopRisk {
  id: string;
  position: number;
  stop_type?: string;
  risk_severity?: string | null;
  risk_score?: number | null;
  planned_arrival?: string | null;
  shipment?: {
    shipment_number?: string | null;
    loading_time_from?: string | null;
    loading_time_to?: string | null;
    delivery_time_from?: string | null;
    delivery_time_to?: string | null;
  };
}

interface NvTourConflict {
  type: 'TIME_OVERLAP' | 'WORKLOAD_EXCEEDED' | 'OVERLOAD_RISK';
  severity: 'warning' | 'critical';
  msg: string;
  affected_stop_ids?: string[];
  suggested_actions: Array<{
    type:
      | 'SHIFT_STOP_LATER'
      | 'SPLIT_TOUR_AT_STOP'
      | 'SWAP_DRIVER'
      | 'MOVE_STOP_TO_TOUR';
    stop_id?: string;
  }>;
}

interface NvTourRiskDetail {
  id: string;
  subunternehmer_id?: string | null;
  subunternehmer?: { id: string; name: string } | null;
  risk?: {
    max_score: number;
    critical_count: number;
    warning_count: number;
  } | null;
  conflicts?: NvTourConflict[];
  stops?: NvStopRisk[];
}

function hintForStop(s: NvStopRisk): string | null {
  const sev = s.risk_severity;
  const isDelivery = s.stop_type === 'DELIVERY';
  if (sev === 'critical') {
    if (isDelivery) {
      return 'Tour zu spät beim Empfänger — Tour-Split prüfen oder Stops umsortieren.';
    }
    return 'Abholfenster überschritten — Reihenfolge anpassen oder mit Kunden abstimmen.';
  }
  if (sev === 'warning') {
    return 'Knapper Puffer — vorherigen Stop ggf. verkürzen oder Servicezeit prüfen.';
  }
  return null;
}

export default function AiHintsTab() {
  const { entity } = usePanel();
  const qc = useQueryClient();
  const isNvTour = entity?.type === 'nv-tour';

  const [splitOpen, setSplitOpen] = useState<{ stopId?: string } | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState<{
    stopId: string;
    label: string;
    shipmentId?: string;
  } | null>(null);
  // S-1: Details-Sections (Conflicts/Risk-Stops) default eingeklappt.
  const [detailsOpen, setDetailsOpen] = useState(false);

  const tourQ = useQuery<NvTourRiskDetail | null>({
    queryKey: ['nv-tour-detail', entity?.id],
    queryFn: async () => {
      if (!entity?.id) return null;
      const { data } = await api.get<NvTourRiskDetail>(
        `/nv-touren/${entity.id}`,
      );
      return data;
    },
    enabled: !!isNvTour && !!entity?.id,
    staleTime: 30_000,
  });

  const shiftMut = useMutation({
    mutationFn: async (stopId: string) => {
      if (!entity?.id) return;
      await api.post(`/nv-touren/${entity.id}/apply-action`, {
        action_type: 'SHIFT_STOP_LATER',
        stop_id: stopId,
        shift_minutes: 15,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', entity?.id] });
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
    },
  });

  if (!entity) {
    return <div className="p-3 text-xs text-gray-400 italic">Keine Auswahl.</div>;
  }
  if (!isNvTour) {
    return (
      <div className="p-3 text-xs text-gray-400 italic">
        Hinweise nur für NV-Touren verfügbar.
      </div>
    );
  }
  if (tourQ.isLoading) {
    return <div className="p-3 text-xs text-gray-400">Lädt…</div>;
  }
  const t = tourQ.data;
  if (!t) {
    return <div className="p-3 text-xs text-gray-400">Tour nicht gefunden.</div>;
  }

  const riskStops = (t.stops ?? []).filter(
    (s) => s.risk_severity === 'critical' || s.risk_severity === 'warning',
  );
  const conflicts = t.conflicts ?? [];

  const empty =
    riskStops.length === 0 && conflicts.length === 0;

  // S-1: WAS-IST-AKUT ranked merge.
  // Rank-Map: critical=4 > warning=2; conflict-Kind +1 (etwas höher
  // gewichtet als gleichschwere Stop-Risks weil struktureller Tour-
  // Konflikt typischerweise mehr Stops gleichzeitig blockiert).
  type AcuteItem =
    | {
        kind: 'conflict';
        rank: number;
        severity: 'warning' | 'critical';
        sevLevel: SeverityLevel;
        item: NvTourConflict;
        idx: number;
      }
    | {
        kind: 'risk';
        rank: number;
        severity: 'warning' | 'critical';
        sevLevel: SeverityLevel;
        item: NvStopRisk;
      };
  const ranked = useMemo<AcuteItem[]>(() => {
    const items: AcuteItem[] = [];
    conflicts.forEach((c, idx) => {
      const baseRank = c.severity === 'critical' ? 5 : 3;
      items.push({
        kind: 'conflict',
        rank: baseRank,
        severity: c.severity,
        sevLevel: c.severity === 'critical' ? 'L1' : 'L2',
        item: c,
        idx,
      });
    });
    for (const s of riskStops) {
      const sev = s.risk_severity === 'critical' ? 'critical' : 'warning';
      items.push({
        kind: 'risk',
        rank: sev === 'critical' ? 4 : 2,
        severity: sev,
        sevLevel: sev === 'critical' ? 'L1' : 'L2',
        item: s,
      });
    }
    return items.sort((a, b) => b.rank - a.rank);
  }, [conflicts, riskStops]);

  const topAcute = ranked.slice(0, 3);
  const restCount = Math.max(0, ranked.length - topAcute.length);

  if (empty) {
    return (
      <div className="p-3 space-y-2 text-xs">
        <div className="flex items-center gap-1.5 text-green-700">
          <Lightbulb size={14} />
          <span className="font-medium">Keine kritischen Punkte</span>
        </div>
        <div className="text-gray-500 text-[11px]">
          Alle Stops innerhalb SLA-Fenster, keine Konflikte.
        </div>
      </div>
    );
  }

  const renderActionBtn = (
    type: NvTourConflict['suggested_actions'][0]['type'],
    stopId: string | undefined,
    label: string,
    onClick: () => void,
  ) => (
    <button
      key={`${type}:${stopId ?? ''}`}
      onClick={onClick}
      disabled={shiftMut.isPending}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-white border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50"
    >
      <Plus size={9} />
      {label}
    </button>
  );

  /**
   * S-1 WAS-IST-AKUT compact-Row pro Acute-Item.
   * Renderiert: severity-Icon + 1-Line-Text + Primary-Action-Button.
   */
  const renderAcuteRow = (a: AcuteItem) => {
    const colClass = severityColorClass(a.sevLevel);
    const Icon = a.kind === 'conflict' ? ShieldAlert : AlertTriangle;
    if (a.kind === 'conflict') {
      const c = a.item;
      // Primary-Action = erste suggested_action mit verfügbarem Handler.
      const primary = c.suggested_actions[0];
      const onPrimary = (() => {
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
          ? 'Stop +15min'
          : primary?.type === 'SPLIT_TOUR_AT_STOP'
            ? 'Tour splitten'
            : primary?.type === 'SWAP_DRIVER'
              ? 'Sub wechseln'
              : primary?.type === 'MOVE_STOP_TO_TOUR'
                ? 'In andere Tour'
                : null;
      return (
        <div
          key={`c-${a.idx}`}
          className={`border ${colClass} rounded px-2 py-1.5 flex items-center gap-1.5`}
        >
          <Icon size={12} className="flex-shrink-0" />
          <span className="flex-1 truncate">{c.msg}</span>
          {primaryLabel && onPrimary && (
            <button
              onClick={onPrimary}
              disabled={shiftMut.isPending}
              className="text-[10px] px-1.5 py-0.5 bg-white border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 flex-shrink-0"
            >
              {primaryLabel}
            </button>
          )}
        </div>
      );
    }
    // risk
    const s = a.item;
    const num = s.shipment?.shipment_number ?? `Stop ${s.position}`;
    const hint = hintForStop(s);
    return (
      <div
        key={`r-${s.id}`}
        className={`border ${colClass} rounded px-2 py-1.5 flex items-center gap-1.5`}
      >
        <Icon size={12} className="flex-shrink-0" />
        <span className="font-mono font-semibold">{num}</span>
        <span className="flex-1 truncate text-[10px] text-gray-700">
          {hint ?? s.stop_type}
        </span>
        <button
          onClick={() => shiftMut.mutate(s.id)}
          disabled={shiftMut.isPending}
          className="text-[10px] px-1.5 py-0.5 bg-white border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 flex-shrink-0"
        >
          +15min
        </button>
      </div>
    );
  };

  return (
    <div className="p-3 space-y-3 text-xs">
      {ranked.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 text-gray-700 font-medium mb-1">
            <AlertTriangle size={14} className="text-red-600" />
            Was ist akut?
            <span className="ml-1 text-[10px] text-gray-500">
              ({ranked.length} insg.)
            </span>
          </div>
          <div className="space-y-1.5">{topAcute.map(renderAcuteRow)}</div>
          {restCount > 0 && (
            <button
              onClick={() => setDetailsOpen((o) => !o)}
              className="mt-1.5 text-[10px] text-blue-700 hover:underline inline-flex items-center gap-0.5"
            >
              {detailsOpen ? (
                <ChevronDown size={10} />
              ) : (
                <ChevronRight size={10} />
              )}
              {detailsOpen ? 'weniger anzeigen' : `+ ${restCount} weitere`}
            </button>
          )}
        </section>
      )}

      {detailsOpen && conflicts.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 text-amber-700 font-medium mb-1">
            <ShieldAlert size={14} />
            {conflicts.length} Konflikt(e)
          </div>
          <div className="space-y-2">
            {conflicts.map((c, i) => {
              const col =
                c.severity === 'critical'
                  ? 'border-red-300 bg-red-50'
                  : 'border-amber-300 bg-amber-50';
              return (
                <div
                  key={i}
                  className={`border ${col} rounded px-2 py-1.5`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase text-gray-600">
                      {c.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {c.severity}
                    </span>
                  </div>
                  <div className="mt-0.5 text-gray-700">{c.msg}</div>
                  {c.suggested_actions.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.suggested_actions.map((a) => {
                        if (a.type === 'SHIFT_STOP_LATER' && a.stop_id) {
                          return renderActionBtn(
                            a.type,
                            a.stop_id,
                            'Stop +15min',
                            () => shiftMut.mutate(a.stop_id!),
                          );
                        }
                        if (a.type === 'SPLIT_TOUR_AT_STOP') {
                          return renderActionBtn(
                            a.type,
                            a.stop_id,
                            'Tour splitten',
                            () => setSplitOpen({ stopId: a.stop_id }),
                          );
                        }
                        if (a.type === 'SWAP_DRIVER') {
                          return renderActionBtn(
                            a.type,
                            undefined,
                            'Sub wechseln',
                            () => setSwapOpen(true),
                          );
                        }
                        if (a.type === 'MOVE_STOP_TO_TOUR' && a.stop_id) {
                          const stop = t.stops?.find(
                            (s) => s.id === a.stop_id,
                          );
                          const label =
                            stop?.shipment?.shipment_number ??
                            a.stop_id.slice(0, 6);
                          return renderActionBtn(
                            a.type,
                            a.stop_id,
                            'In andere Tour',
                            () => {
                              const found = t.stops?.find(
                                (s) => s.id === a.stop_id,
                              );
                              return setMoveOpen({
                                stopId: a.stop_id!,
                                label,
                                shipmentId: (found?.shipment as any)?.id,
                              });
                            },
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {detailsOpen && riskStops.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 text-amber-700 font-medium mb-1">
            <AlertTriangle size={14} />
            {riskStops.length} Stop(s) mit Risiko
          </div>
          <div className="space-y-2">
            {riskStops.map((s) => {
              const sev = s.risk_severity;
              const col =
                sev === 'critical'
                  ? 'border-red-300 bg-red-50'
                  : 'border-amber-300 bg-amber-50';
              const isDelivery = s.stop_type === 'DELIVERY';
              const windowFrom = isDelivery
                ? s.shipment?.delivery_time_from
                : s.shipment?.loading_time_from;
              const windowTo = isDelivery
                ? s.shipment?.delivery_time_to
                : s.shipment?.loading_time_to;
              const hint = hintForStop(s);
              return (
                <div key={s.id} className={`border ${col} rounded px-2 py-1.5`}>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-gray-700">
                      {s.position}.
                    </span>
                    <span className="font-mono font-semibold">
                      {s.shipment?.shipment_number ?? '—'}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {s.stop_type}
                    </span>
                    <span className="ml-auto text-[10px] text-gray-500">
                      Score {s.risk_score ?? '?'}
                    </span>
                  </div>
                  {(windowFrom || windowTo) && s.planned_arrival && (
                    <div className="mt-0.5 text-[10px] text-gray-600 inline-flex items-center gap-1">
                      <Clock size={10} />
                      Plan{' '}
                      {new Date(s.planned_arrival).toLocaleTimeString('de', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {windowFrom && windowTo && (
                        <span className="text-gray-400">
                          · Fenster {String(windowFrom).slice(0, 5)}–
                          {String(windowTo).slice(0, 5)}
                        </span>
                      )}
                    </div>
                  )}
                  {hint && (
                    <div className="mt-1 text-[10px] text-gray-700 inline-flex items-start gap-1">
                      <Lightbulb size={10} className="mt-[1px] flex-shrink-0" />
                      <span>{hint}</span>
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {renderActionBtn(
                      'SHIFT_STOP_LATER',
                      s.id,
                      'Stop +15min',
                      () => shiftMut.mutate(s.id),
                    )}
                    {renderActionBtn(
                      'MOVE_STOP_TO_TOUR',
                      s.id,
                      'In andere Tour',
                      () =>
                        setMoveOpen({
                          stopId: s.id,
                          label: s.shipment?.shipment_number ?? s.id.slice(0, 6),
                          shipmentId: (s.shipment as any)?.id,
                        }),
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
    </div>
  );
}

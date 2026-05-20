/**
 * W-3.2.A: TourCard extrahiert aus NvDispositionPage.tsx (Pure-Move).
 *
 * Eine NV-Tour-Card mit:
 *   - Header: Code + Sub + Status + Kosten-Aggregates
 *   - Capacity-Bars (Pal/kg/m³/LDM)
 *   - Stop-Liste gruppiert nach Adresse
 *   - Per-Stop-Buttons: Detail / DrillDown
 *   - Per-Tour-Buttons: Status-Wechsel / Beladeplan / Kosten / Löschen
 *   - DnD-Target (application/json shipmentIds)
 *
 * Logik unverändert ggü. Inline-Version vor W-3.2.A.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Box, Eye, Package, Pencil, Trash2, Truck } from 'lucide-react';
import { api } from '../../lib/api';
import { prefetchNvLoadingTour } from '../../lib/prefetchHelpers';
import type { NvTourMutableStatus } from '../../lib/nvTourStatus';
import type { NvTour, Stop } from '../../lib/nvTypes';
import type { CostComponent } from './CostDrillDownModal';
import { usePanel } from '../../state/panel';
import CapacityBars, { type CapacityData } from './CapacityBars';

export default function TourCard({
  tour,
  onDrop,
  onMoveStop,
  onDeleteStop,
  onDeleteTour,
  onOpenKosten,
  onOpenDrillDown,
  onOpenDetail,
  onSetTourStatus,
  onToggleTourView,
  isActive,
}: {
  tour: NvTour;
  onDrop: (shipmentIds: string[], source?: 'map' | 'list') => void;
  onMoveStop: (idx: number, dir: -1 | 1) => void;
  onDeleteStop: (stopId: string) => void;
  onDeleteTour: () => void;
  onOpenKosten: () => void;
  onOpenDrillDown: (shipmentId: string, shipmentNumber: string) => void;
  onOpenDetail: (shipmentId: string) => void;
  onSetTourStatus: (
    status: NvTourMutableStatus,
    openCount: number,
    shipmentCount: number,
  ) => void;
  onToggleTourView: () => void;
  isActive: boolean;
}) {
  const qc = useQueryClient();
  const { selectNvTour } = usePanel();
  const costsQ = useQuery<CostComponent[]>({
    queryKey: ['nv-tour-cost-comp', tour.id],
    queryFn: async () =>
      (await api.get<CostComponent[]>(`/nv-touren/${tour.id}/cost-components`))
        .data,
    staleTime: 30_000,
  });
  const capQ = useQuery<CapacityData>({
    queryKey: ['nv-tour-capacity', tour.id],
    queryFn: async () =>
      (await api.get(`/nv-touren/${tour.id}/capacity`)).data,
    staleTime: 0,
  });
  const costsByShipment = useMemo(() => {
    const m = new Map<string, CostComponent>();
    for (const c of costsQ.data ?? []) {
      if (c.shipment_id) m.set(c.shipment_id, c);
    }
    return m;
  }, [costsQ.data]);
  const tourAggregates = useMemo(() => {
    // Stopps = distinct loading- bzw. delivery-Adressen (mode-spezifisch
    // pro Stop). Gleicher Algo wie computeStopGroups in stop-list.
    const seen = new Set<string>();
    let sumErloes = 0;
    for (const s of tour.stops) {
      const sh: any = s.shipment;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh?.addresses_shipments_delivery_address_idToaddresses
          : sh?.addresses_shipments_loading_address_idToaddresses;
      const key = addr
        ? `${addr.street ?? ''}|${addr.zip ?? ''}|${addr.city ?? ''}`
        : `__none-${s.id}`;
      seen.add(key);
      const fr = sh?.freight_revenue;
      if (fr != null) {
        const n = Number(fr);
        if (Number.isFinite(n)) sumErloes += n;
      }
    }
    const distinctStops = seen.size;
    const totalKosten = tour.total_kosten_eur
      ? Number(tour.total_kosten_eur)
      : 0;
    const perStop =
      distinctStops > 0 && totalKosten > 0 ? totalKosten / distinctStops : 0;
    const sumDB = sumErloes - totalKosten;
    return { distinctStops, totalKosten, perStop, sumErloes, sumDB };
  }, [tour.stops, tour.total_kosten_eur]);

  const [hovered, setHovered] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHovered(false);
    const json = e.dataTransfer.getData('application/json');
    if (!json) return;
    try {
      const parsed = JSON.parse(json) as {
        shipmentId?: string;
        shipmentIds?: string[];
        source?: 'map' | 'list';
      };
      const ids = Array.isArray(parsed.shipmentIds)
        ? parsed.shipmentIds
        : parsed.shipmentId
          ? [parsed.shipmentId]
          : [];
      if (ids.length > 0) onDrop(ids, parsed.source);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('application/json')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setHovered(true);
        }
      }}
      onDragLeave={() => setHovered(false)}
      onDrop={handleDrop}
      className={`rounded-lg ${
        hovered
          ? 'border-2 border-blue-500 bg-blue-50 shadow-md'
          : isActive
            ? 'border-2 bg-white shadow-md'
            : 'border border-gray-200 bg-white shadow-sm'
      }`}
      style={
        isActive && !hovered
          ? {
              borderColor:
                tour.nv_stamm_tour?.nv_tour_gebiet?.farbe ?? '#1e40af',
              backgroundColor:
                (tour.nv_stamm_tour?.nv_tour_gebiet?.farbe ?? '#1e40af') +
                '14',
            }
          : undefined
      }
    >
      <div
        className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between cursor-pointer hover:bg-gray-100"
        onClick={(e) => {
          // P0-11: Plain-Click öffnet Panel + togglet Map-Highlight.
          // Cmd/Ctrl+Click NUR Map-Highlight (keine Panel-Änderung).
          if (!e.metaKey && !e.ctrlKey) {
            selectNvTour(tour.id);
          }
          onToggleTourView();
        }}
        title={isActive ? 'Tour-Karte schließen' : 'Tour-Karte anzeigen'}
      >
        <div>
          <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
            <span>{tour.nv_stamm_tour?.code ?? '—'}</span>
            <span className="text-xs text-gray-500">
              {tour.subunternehmer?.business_partner?.name ??
                tour.subunternehmer?.name ??
                '— kein Sub —'}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                tour.status === 'PLANNING'
                  ? 'bg-blue-100 text-blue-700'
                  : tour.status === 'COMPLETED'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
              }`}
            >
              {tour.status}
            </span>
            {tour.kosten_modus === 'SPOT' && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                title="Spot-Preis (manuell eingegeben)"
              >
                SPOT
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
            {(() => {
              const parts: React.ReactNode[] = [];
              parts.push(
                <span key="stopps">
                  Stopps:{' '}
                  <span className="font-mono text-gray-700">
                    {tourAggregates.distinctStops}
                  </span>
                </span>,
              );
              if (tour.geplante_km != null) {
                parts.push(
                  <span key="km">
                    KM:{' '}
                    <span className="font-mono text-slate-600">
                      {Number(tour.geplante_km).toFixed(0)}
                    </span>
                  </span>,
                );
              }
              if (tourAggregates.perStop > 0) {
                parts.push(
                  <span key="perstop">
                    Ø/Stop:{' '}
                    <span className="font-mono text-gray-700">
                      €{tourAggregates.perStop.toFixed(0)}
                    </span>
                  </span>,
                );
              }
              if (tourAggregates.sumErloes > 0) {
                parts.push(
                  <span key="erloes">
                    Erlös:{' '}
                    <span className="font-mono text-green-700">
                      €{tourAggregates.sumErloes.toFixed(0)}
                    </span>
                  </span>,
                );
              }
              if (tourAggregates.totalKosten > 0) {
                parts.push(
                  <span key="kosten">
                    Kosten:{' '}
                    <span className="font-mono text-rose-700">
                      €{tourAggregates.totalKosten.toFixed(0)}
                    </span>
                  </span>,
                );
              }
              if (
                tourAggregates.sumErloes > 0 &&
                tourAggregates.totalKosten > 0
              ) {
                parts.push(
                  <span key="db">
                    DB:{' '}
                    <span
                      className={`font-mono ${
                        tourAggregates.sumDB >= 0
                          ? 'text-green-700'
                          : 'text-rose-700'
                      }`}
                    >
                      €{tourAggregates.sumDB.toFixed(0)}
                    </span>
                  </span>,
                );
              }
              return parts.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-gray-300">·</span>}
                  {p}
                </span>
              ));
            })()}
          </div>
          <CapacityBars cap={capQ.data} />
        </div>
        <div
          className="flex items-center gap-1.5 ml-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {tour.status === 'PLANNING' && (
            <button
              onClick={() => onSetTourStatus('IN_PROGRESS', 0, 0)}
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Starten
            </button>
          )}
          {tour.status === 'IN_PROGRESS' && (
            <button
              onClick={() => {
                const open = tour.stops.filter(
                  (s) => s.status === 'PLANNED' || s.status === 'ARRIVED',
                ).length;
                onSetTourStatus('COMPLETED', open, open);
              }}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Abschließen
            </button>
          )}
          <button
            onClick={() => {
              const w = window.open(
                `/nv-loading/${tour.id}`,
                `tms-loading-plan-${tour.id}`,
                'width=1200,height=900,noopener=no',
              );
              if (w) w.focus();
            }}
            onMouseEnter={() => prefetchNvLoadingTour(qc, tour.id)}
            onFocus={() => prefetchNvLoadingTour(qc, tour.id)}
            className="text-gray-500 hover:text-gray-800 inline-flex items-center gap-0.5"
            title="Beladeplan in neuem Fenster"
          >
            <Box size={16} />
          </button>
          <button
            onClick={onOpenKosten}
            className="text-blue-600 hover:text-blue-800"
            title="Kosten bearbeiten"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={onDeleteTour}
            className="text-red-500 hover:text-red-700"
            title="Tour löschen"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {(() => {
          // Adress-Gruppierung: aufeinanderfolgende Stops mit gleicher
          // Loading- bzw. Delivery-Adresse erhalten dieselbe Stop-Nr.
          type Group = {
            stopNr: number;
            addressLabel: string;
            firstIdx: number;
            lastIdx: number;
            items: { stop: Stop; idx: number }[];
          };
          const groups: Group[] = [];
          let currentNr = 0;
          let lastKey: string | null = null;
          tour.stops.forEach((s, idx) => {
            const sh = s.shipment;
            const addr =
              s.stop_type === 'DELIVERY'
                ? sh?.addresses_shipments_delivery_address_idToaddresses
                : sh?.addresses_shipments_loading_address_idToaddresses;
            const key = addr
              ? `${addr.street ?? ''}|${addr.zip ?? ''}|${addr.city ?? ''}`
              : `__none-${s.id}`;
            if (key !== lastKey) {
              currentNr += 1;
              lastKey = key;
              const label = addr
                ? [
                    [addr.zip, addr.city].filter(Boolean).join(' '),
                    addr.street,
                    addr.name,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : '— Adresse fehlt —';
              groups.push({
                stopNr: currentNr,
                addressLabel: label,
                firstIdx: idx,
                lastIdx: idx,
                items: [],
              });
            }
            const g = groups[groups.length - 1];
            g.lastIdx = idx;
            g.items.push({ stop: s, idx });
          });
          return groups.map((g) => (
            <li key={`group-${g.firstIdx}`} className="text-sm">
              <div className="px-3 py-1.5 flex items-center gap-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-mono font-semibold text-gray-700 w-10">
                  Stop {g.stopNr}
                </span>
                {g.items[0].stop.stop_type === 'DELIVERY' ? (
                  <Truck size={14} className="text-purple-700" />
                ) : (
                  <Package size={14} className="text-blue-700" />
                )}
                <span className="text-xs text-gray-700 truncate flex-1">
                  {g.addressLabel}
                </span>
                <button
                  onClick={() => onMoveStop(g.firstIdx, -1)}
                  disabled={g.firstIdx === 0}
                  className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  title="Stop nach oben"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => onMoveStop(g.lastIdx, 1)}
                  disabled={g.lastIdx === tour.stops.length - 1}
                  className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  title="Stop nach unten"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  onClick={() => {
                    const n = g.items.length;
                    if (
                      !confirm(
                        n === 1
                          ? 'Stop löschen?'
                          : `${n} Stops an diesem Halt löschen?`,
                      )
                    )
                      return;
                    for (const it of g.items) onDeleteStop(it.stop.id);
                  }}
                  className="text-red-500 hover:text-red-700"
                  title={
                    g.items.length === 1
                      ? 'Stop löschen'
                      : `${g.items.length} Stops löschen`
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <ul className="divide-y divide-gray-50">
                {g.items.map(({ stop: s }) => (
                  <li
                    key={s.id}
                    className="px-3 py-1 pl-12 grid grid-cols-[24px_1fr_64px_72px_64px_64px_110px_80px] gap-2 items-center"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (s.shipment) onOpenDetail(s.shipment.id);
                      }}
                      disabled={!s.shipment}
                      className="text-gray-500 hover:text-blue-700 disabled:opacity-30"
                      title="Sendungs-Detail"
                    >
                      <Eye size={14} />
                    </button>
                    <span className="font-mono text-xs truncate">
                      {s.shipment?.shipment_number ?? '—'}
                    </span>
                    {(() => {
                      const sh = s.shipment;
                      const cell = (
                        v: string | number | null | undefined,
                        unit: string,
                        decimals = 0,
                      ) => {
                        if (v == null) {
                          return <span className="text-gray-300">—</span>;
                        }
                        const n = Number(v);
                        if (!Number.isFinite(n) || n === 0) {
                          return <span className="text-gray-300">—</span>;
                        }
                        return (
                          <>
                            <span className="font-mono">
                              {n.toFixed(decimals)}
                            </span>
                            <span className="text-gray-400 ml-0.5">
                              {unit}
                            </span>
                          </>
                        );
                      };
                      const dimsCell = () => {
                        const L = sh?.length_cm;
                        const W = sh?.width_cm;
                        const H = sh?.height_cm;
                        if (L == null && W == null && H == null) {
                          return <span className="text-gray-300">—</span>;
                        }
                        return (
                          <span className="font-mono">
                            {L ?? '—'}×{W ?? '—'}×{H ?? '—'}
                            <span className="text-gray-400 ml-0.5">cm</span>
                          </span>
                        );
                      };
                      const cc = sh?.id
                        ? costsByShipment.get(sh.id)
                        : null;
                      return (
                        <>
                          <span className="text-xs text-right">
                            {cell(sh?.package_count, 'Pak', 0)}
                          </span>
                          <span className="text-xs text-right">
                            {cell(sh?.weight_kg, 'kg', 0)}
                          </span>
                          <span className="text-xs text-right">
                            {cell(sh?.ldm, 'LDM', 2)}
                          </span>
                          <span
                            className="text-xs text-right"
                            title="Stack-aware Plätze (Fallback Pak)"
                          >
                            {cell(
                              sh?.effective_pallets ?? sh?.package_count,
                              'Pl',
                              1,
                            )}
                          </span>
                          <span className="text-xs text-right">
                            {dimsCell()}
                          </span>
                          <span className="text-xs text-right">
                            {cc && cc.total_eur ? (
                              <button
                                onClick={() =>
                                  sh &&
                                  onOpenDrillDown(sh.id, sh.shipment_number)
                                }
                                className="font-mono text-green-700 hover:underline"
                                title="Cost-Breakdown"
                              >
                                €{Number(cc.total_eur).toFixed(0)}
                              </button>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </span>
                        </>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            </li>
          ));
        })()}
      </ul>
      <div
        className={`px-3 py-2 text-xs text-center border-t ${
          hovered ? 'text-blue-700' : 'text-gray-400'
        }`}
      >
        {hovered ? 'Loslassen zum Hinzufügen' : '+ Sendung hierher droppen'}
      </div>
    </div>
  );
}

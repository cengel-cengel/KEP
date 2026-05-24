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
import { Box, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { prefetchNvLoadingTour } from '../../lib/prefetchHelpers';
import type { NvTourMutableStatus } from '../../lib/nvTourStatus';
import type { NvTour } from '../../lib/nvTypes';
import { usePanel } from '../../state/panel';
import CapacityBars, { type CapacityData } from './CapacityBars';
import NvSwapOptimizerModal from './NvSwapOptimizerModal';

export default function TourCard({
  tour,
  onDrop,
  // TEIL A Refactor: per-Stop-Aktionen wandern in TourDetailsTab.
  // Props bleiben Teil der API für Backward-Compat (BoardPanel-
  // Callsite reicht sie noch durch) — underscore-prefix signalisiert
  // TS dass sie absichtlich nicht genutzt sind.
  onMoveStop: _onMoveStop,
  onDeleteStop: _onDeleteStop,
  onDeleteTour,
  onOpenKosten,
  onOpenDrillDown: _onOpenDrillDown,
  onOpenDetail: _onOpenDetail,
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
  const capQ = useQuery<CapacityData>({
    queryKey: ['nv-tour-capacity', tour.id],
    queryFn: async () =>
      (await api.get(`/nv-touren/${tour.id}/capacity`)).data,
    staleTime: 0,
  });
  // TEIL A: costsQ + costsByShipment entfernt — wurden nur für
  // pro-Sendung-Drilldown im (jetzt entfernten) ul-Block genutzt.
  const tourAggregates = useMemo(() => {
    // TEIL A: Kachel-Refactor — neue Felder:
    //   Paletten (Hauptzahl) = Σ shipment.package_count
    //     Stückmenge, stapel-unabhängig.
    //   Boden-Verbrauch (Klammer) = Σ shipment.effective_pallets
    //     BE recalcAggregateForShipment ist Stapel-aware:
    //     heightFactor = floor(SATTEL_HOEHE/H) wenn stackable,
    //     sonst 1. eff_pallets = qty / heightFactor. Deckt 2- UND
    //     3-stöckig automatisch ab (H=110→2, H=73→3).
    //     Zeigt "belegte Bodenplätze" = Restraum-Indikator für
    //     "passt noch was drauf?".
    //   kg = Σ shipment.weight_kg
    //   ldm = Σ shipment.ldm
    //   tour-kosten = tour.total_kosten_eur
    //   DB-Platzhalter — Tarifwerk später.
    //
    // Dedup pro Sendung (Multi-Stop-Sendungen würden sonst doppelt
    // zählen): Set<shipment-id>.
    const seenShipments = new Set<string>();
    let sumPackages = 0;
    let sumBoden = 0;
    let sumKg = 0;
    let sumLdm = 0;
    for (const s of tour.stops ?? []) {
      const sh: any = s.shipment;
      if (!sh?.id || seenShipments.has(sh.id)) continue;
      seenShipments.add(sh.id);
      const pkg = Number(sh.package_count ?? 0);
      if (Number.isFinite(pkg)) sumPackages += pkg;
      const boden = Number(sh.effective_pallets ?? sh.package_count ?? 0);
      if (Number.isFinite(boden)) sumBoden += boden;
      const kg = Number(sh.weight_kg ?? 0);
      if (Number.isFinite(kg)) sumKg += kg;
      const ldm = Number(sh.ldm ?? 0);
      if (Number.isFinite(ldm)) sumLdm += ldm;
    }
    const totalKosten = tour.total_kosten_eur
      ? Number(tour.total_kosten_eur)
      : 0;
    return {
      shipmentCount: seenShipments.size,
      sumPackages,
      sumBoden: Math.round(sumBoden * 100) / 100,
      sumKg: Math.round(sumKg),
      sumLdm: Math.round(sumLdm * 100) / 100,
      totalKosten,
    };
  }, [tour.stops, tour.total_kosten_eur]);

  const [hovered, setHovered] = useState(false);
  // F2.2.a: Read-Only Swap-Optimizer-Vorschau.
  const [showSwapModal, setShowSwapModal] = useState(false);

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

  // S-2: Invalid-Drop-Target wenn Tour COMPLETED/CANCELLED.
  // Visual: red-ring + cursor-not-allowed während Drag-Over.
  const isInvalidTarget =
    tour.status === 'COMPLETED' || tour.status === 'CANCELLED';

  return (
    <div
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('application/json')) {
          e.preventDefault();
          if (isInvalidTarget) {
            e.dataTransfer.dropEffect = 'none';
          } else {
            e.dataTransfer.dropEffect = 'move';
          }
          setHovered(true);
        }
      }}
      onDragLeave={() => setHovered(false)}
      onDrop={(e) => {
        if (isInvalidTarget) {
          e.preventDefault();
          setHovered(false);
          return;
        }
        handleDrop(e);
      }}
      className={`rounded-lg ${
        hovered
          ? isInvalidTarget
            ? 'border-2 border-red-500 bg-red-50 shadow-md cursor-not-allowed'
            : 'border-2 border-blue-500 bg-blue-50 shadow-md'
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
          {/* TEIL A: Kachel-Aggregat — Paletten (Stückmenge,
              Hauptzahl) + Boden-Verbrauch (Klammer, Restraum-
              Indikator), kg, ldm, Kosten, DB-Placeholder.
              Sub schon im Title-Header oben. */}
          <div className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
            <span title={`${tourAggregates.sumPackages} Paletten · ${tourAggregates.sumBoden.toFixed(1)} Bodenplätze belegt (stapel-aware)`}>
              Paletten:{' '}
              <span className="font-mono text-gray-700">
                {tourAggregates.sumPackages}
              </span>{' '}
              <span className="text-gray-400">
                ({tourAggregates.sumBoden.toFixed(0)} Boden)
              </span>
            </span>
            <span className="text-gray-300">·</span>
            <span>
              kg:{' '}
              <span className="font-mono text-gray-700">
                {tourAggregates.sumKg}
              </span>
            </span>
            <span className="text-gray-300">·</span>
            <span>
              ldm:{' '}
              <span className="font-mono text-gray-700">
                {tourAggregates.sumLdm.toFixed(2)}
              </span>
            </span>
            <span className="text-gray-300">·</span>
            <span>
              Kosten:{' '}
              <span className="font-mono text-rose-700">
                {tourAggregates.totalKosten > 0
                  ? `€${tourAggregates.totalKosten.toFixed(0)}`
                  : '—'}
              </span>
            </span>
            <span className="text-gray-300">·</span>
            <span title="Deckungsbeitrag — kommt mit Tarifwerk">
              DB:{' '}
              <span className="font-mono text-gray-400">—</span>
            </span>
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
                const open = (tour.stops ?? []).filter(
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
          {/* F2.2.a: Tausch-Vorschau (read-only). */}
          <button
            onClick={() => setShowSwapModal(true)}
            onMouseEnter={() => prefetchNvLoadingTour(qc, tour.id)}
            onFocus={() => prefetchNvLoadingTour(qc, tour.id)}
            className="text-gray-500 hover:text-blue-600 inline-flex items-center gap-0.5"
            title="Tausch-Vorschlag generieren"
          >
            <Sparkles size={16} />
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
      <div
        className={`px-3 py-2 text-xs text-center border-t ${
          hovered ? 'text-blue-700' : 'text-gray-400'
        }`}
      >
        {hovered ? 'Loslassen zum Hinzufügen' : '+ Sendung hierher droppen'}
      </div>
      {showSwapModal && (
        <NvSwapOptimizerModal
          sourceTourId={tour.id}
          onClose={() => setShowSwapModal(false)}
        />
      )}
    </div>
  );
}

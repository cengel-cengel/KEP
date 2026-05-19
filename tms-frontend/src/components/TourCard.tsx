import { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import type { Tour } from '../types/tour';
import type { StackingLdmMetrics } from '../lib/loadingLdm';
import OverloadBar from './shared/OverloadBar';

export interface SubcontractorOption {
  id: string;
  name: string;
}

export interface MainCarriageConditionOption {
  id: string;
  label: string;
}

export interface TourCardProps {
  tour: Tour;
  onDrop: (shipmentId: string) => void;
  subcontractors?: SubcontractorOption[];
  onSaveCost?: (tourId: string, cost: number) => void;
  onAssignSubcontractor?: (tourId: string, subcontractorId: string) => void;
  /** Sprint 14: Hauptlauf-SUB-Kondition (MAIN_CARRIAGE) */
  mainCarriageConditions?: MainCarriageConditionOption[];
  onAssignMainCarriageCondition?: (tourId: string, conditionId: string) => void;
  onRelease?: (tourId: string) => void;
  onClick?: () => void;
  selected?: boolean;
  recommendedVehicleType?: string | null;
  /** Live aus Belade-Optimierung (Route + Stapelbarkeit) */
  stackingLdm?: StackingLdmMetrics | null;
  onOpenLoadingPlan?: (tourId: string) => void;
  releaseBlockingLockCount?: number;
}

function dbPercentColor(percent: number): string {
  if (percent >= 15) return 'text-emerald-600';
  if (percent >= 5) return 'text-amber-600';
  return 'text-red-600';
}

function dbPercentBg(percent: number): string {
  if (percent >= 15) return 'bg-emerald-500';
  if (percent >= 5) return 'bg-amber-500';
  return 'bg-red-500';
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function TourCard({
  tour,
  onDrop,
  subcontractors = [],
  onSaveCost,
  onAssignSubcontractor,
  mainCarriageConditions = [],
  onAssignMainCarriageCondition,
  onRelease,
  onClick,
  selected = false,
  recommendedVehicleType,
  stackingLdm = null,
  onOpenLoadingPlan,
  releaseBlockingLockCount = 0,
}: TourCardProps) {
  const [isEditingCost, setIsEditingCost] = useState(false);
  const [costInput, setCostInput] = useState('');
  const costInputRef = useRef<HTMLInputElement>(null);

  // API snake_case
  const tourNumber = tour.tour_number ?? tour.tourNumber ?? '–';
  const totalLdm = Number(tour.total_ldm ?? 0);
  const maxLdm = Number(tour.max_ldm ?? tour.maxLdm ?? 13.6);
  const shipmentsList = tour.shipments ?? [];
  const usedLdmTour =
    totalLdm > 0
      ? totalLdm
      : shipmentsList.reduce((sum, s) => sum + (Number((s as { ldm?: number }).ldm) || 0), 0);
  const usedLdm = stackingLdm ? stackingLdm.floorUsed : usedLdmTour;
  const maxLdmBar = stackingLdm ? stackingLdm.maxLdm : maxLdm;
  const freeLdm = stackingLdm ? stackingLdm.freeFloorLdm : Math.max(0, maxLdm - usedLdmTour);
  const freeLdmEffective = stackingLdm?.freeEffectiveLdm ?? null;
  const fillPct = maxLdmBar > 0 ? Math.min(100, (usedLdm / maxLdmBar) * 100) : 0;
  // Überladung wird ueber EFFECTIVE LDM bestimmt (Stapelbarkeit beruecksichtigt).
  // Boden-Bar darf >100% sein (z.B. wenn alles stapelbar) ohne 'Überladung'.
  const overloadByEffective = stackingLdm
    ? stackingLdm.effectivePct > 100
    : usedLdm > maxLdmBar;
  const fillPctEffective =
    stackingLdm && maxLdmBar > 0 ? Math.min(100, (stackingLdm.effectiveUsed / maxLdmBar) * 100) : null;
  const shipmentCount = shipmentsList.length ?? (tour as Tour & { _count?: { shipments?: number } })._count?.shipments ?? 0;

  const sub = tour.subcontractors ?? (tour as Tour & { subcontractor?: { id: string; name: string } }).subcontractor;
  const subId = sub?.id ?? (tour as Tour & { subcontractor_id?: string }).subcontractor_id ?? null;
  const subName = sub?.name ?? '–';
  const currentCost = Number(tour.subcontractor_cost ?? 0);
  const calcSubMain = Number((tour as Tour & { calculated_sub_cost?: unknown }).calculated_sub_cost ?? 0);
  const subConditionId =
    (tour as Tour & { sub_condition_id?: string | null }).sub_condition_id ?? '';
  const percent = Number(tour.cm_percent ?? tour.cmPercent ?? 0);
  const totalRevenue = Number(tour.total_revenue ?? 0);
  const contributionMargin = Number(tour.contribution_margin ?? 0);

  function tourStatusBadge() {
    const status = tour.status;
    switch (status) {
      case 'planned':
        return { label: 'Geplant', cls: 'bg-gray-100 text-gray-800' };
      case 'released':
        return { label: 'Freigegeben', cls: 'bg-emerald-100 text-emerald-800' };
      case 'dispatched':
        return { label: 'Abgefertigt', cls: 'bg-blue-100 text-blue-800' };
      case 'closed':
        return { label: 'Abgefahren', cls: 'bg-gray-800 text-gray-100' };
      default:
        return { label: status ?? '–', cls: 'bg-gray-100 text-gray-800' };
    }
  }

  useEffect(() => {
    if (isEditingCost) {
      setCostInput(String(currentCost || ''));
      costInputRef.current?.focus();
    }
  }, [isEditingCost, currentCost]);

  function submitCost() {
    const num = Number(costInput.replace(',', '.'));
    if (!Number.isNaN(num) && num >= 0 && onSaveCost) {
      onSaveCost(tour.id, num);
      setIsEditingCost(false);
    } else {
      setIsEditingCost(false);
      setCostInput('');
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('ring-2', 'ring-[#1e40af]');
  }

  function handleDragLeave(e: React.DragEvent) {
    e.currentTarget.classList.remove('ring-2', 'ring-[#1e40af]');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.currentTarget.classList.remove('ring-2', 'ring-[#1e40af]');
    try {
      const json = e.dataTransfer.getData('application/json');
      const { shipmentId } = JSON.parse(json);
      if (shipmentId) onDrop(shipmentId);
    } catch {
      // ignore
    }
  }

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all ${
        selected ? 'border-2 border-blue-600 bg-blue-50' : ''
      } ${onClick ? 'cursor-pointer' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-gray-900">{tourNumber}</div>
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${tourStatusBadge().cls}`}>
          {tourStatusBadge().label}
        </span>
      </div>
      <OverloadBar overload={tour.overload} className="mt-1" />
      <div className="mt-0.5 text-sm text-gray-600">
        {subId ? (
          <>SUB: {subName}</>
        ) : subcontractors.length > 0 && onAssignSubcontractor ? (
          <label className="flex items-center gap-1.5">
            <span>SUB zuordnen:</span>
            <select
              className="rounded border border-gray-300 px-2 py-0.5 text-gray-700 focus:border-[#1e40af] focus:outline-none focus:ring-1 focus:ring-[#1e40af]"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) onAssignSubcontractor(tour.id, id);
              }}
            >
              <option value="">— wählen —</option>
              {subcontractors.map((sub) => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <>SUB: {subName}</>
        )}
      </div>
      {subId &&
        mainCarriageConditions.length > 0 &&
        onAssignMainCarriageCondition && (
          <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
            <label className="flex flex-col gap-0.5 text-xs text-gray-600">
              <span>Hauptlauf-Kondition</span>
              <select
                className="rounded border border-gray-300 px-2 py-0.5 text-gray-800 bg-white"
                value={subConditionId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) onAssignMainCarriageCondition(tour.id, v);
                }}
              >
                <option value="">— Kondition wählen —</option>
                {mainCarriageConditions.map((c: MainCarriageConditionOption) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      {calcSubMain > 0 && (
        <div className="mt-1 text-xs text-gray-600">
          Kalk. SUB (Hauptlauf): {formatCurrency(calcSubMain)}
        </div>
      )}
      {recommendedVehicleType && (
        <div className="mt-1.5 text-xs">
          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-0.5">
            🚛 {recommendedVehicleType} empfohlen
          </span>
        </div>
      )}
      {tour.status === 'planned' && onRelease && (
        <div className="mt-2">
          <button
            type="button"
            title={
              releaseBlockingLockCount > 0
                ? `${releaseBlockingLockCount} Sendung(en) gesperrt (ADR/ZOLL) – Sperren aufheben`
                : undefined
            }
            disabled={releaseBlockingLockCount > 0}
            onClick={(e) => {
              e.stopPropagation();
              if (releaseBlockingLockCount > 0) return;
              onRelease(tour.id);
            }}
            className={`w-full px-3 py-2 text-white text-sm font-medium rounded-lg ${
              releaseBlockingLockCount > 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-[#1e40af] hover:bg-[#1e3a8a]'
            }`}
          >
            Tour freigeben
            {releaseBlockingLockCount > 0 ? ` (${releaseBlockingLockCount} gesperrt)` : ''}
          </button>
        </div>
      )}
      {onOpenLoadingPlan && (
        <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
          <details className="relative group">
            <summary className="list-none cursor-pointer flex items-center justify-center h-9 w-9 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50">
              <MoreVertical size={18} aria-hidden />
              <span className="sr-only">Weitere Aktionen</span>
            </summary>
            <div className="absolute right-0 mt-1 z-20 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                onClick={() => onOpenLoadingPlan(tour.id)}
              >
                Beladeplan öffnen
              </button>
            </div>
          </details>
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600">
        <span>Sendungen: {shipmentCount}</span>
        <span>Belegte ldm (Boden): {usedLdm.toFixed(1)}</span>
        <span>Frei (Boden): {freeLdm.toFixed(1)}</span>
        {freeLdmEffective != null ? (
          <span className="text-emerald-800" title="Stapelbar zählt mit ½">
            Frei effektiv: {freeLdmEffective.toFixed(1)}
          </span>
        ) : null}
      </div>
      {stackingLdm && stackingLdm.headroomLdm > 0.05 ? (
        <div className="mt-1 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
          Stapel-Potenzial: +{stackingLdm.headroomLdm.toFixed(1)} ldm (stapelbar ÷2)
        </div>
      ) : null}
      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>ldm Boden (max. 100 %)</span>
          <span>
            {usedLdm.toFixed(1)} / {maxLdmBar.toFixed(1)} ldm ({fillPct.toFixed(0)}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full ${overloadByEffective ? 'bg-red-500' : 'bg-[#1e40af]'}`}
            style={{ width: `${Math.min(100, fillPct)}%` }}
          />
        </div>
        {fillPctEffective != null ? (
          <>
            <div className="flex justify-between text-[11px] text-gray-500 pt-0.5">
              <span>ldm effektiv (Stapel)</span>
              <span>
                {stackingLdm!.effectiveUsed.toFixed(1)} / {maxLdmBar.toFixed(1)} ldm (
                {stackingLdm!.effectivePct.toFixed(0)}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full ${(stackingLdm!.effectivePct > 100) ? 'bg-red-400' : 'bg-emerald-600'}`}
                style={{ width: `${Math.min(100, fillPctEffective)}%` }}
              />
            </div>
          </>
        ) : null}
      </div>
      <div className="mt-2 space-y-0.5 text-sm text-gray-700">
        {currentCost > 0 && (
          <div>SUB-Kosten: {formatCurrency(currentCost)}</div>
        )}
        {totalRevenue > 0 && (
          <div>Erlös: {formatCurrency(totalRevenue)}</div>
        )}
        <div className={`font-medium ${dbPercentColor(percent)}`}>
          DB: {formatCurrency(contributionMargin)} ({percent.toFixed(1)}%)
          <span className={`ml-1.5 inline-block h-2 w-2 rounded-full ${dbPercentBg(percent)}`} />
        </div>
      </div>
      {onSaveCost && (
        <div className="mt-2">
          {isEditingCost ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">SUB-Kosten (€):</span>
              <input
                ref={costInputRef}
                type="number"
                step="0.01"
                min="0"
                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-[#1e40af] focus:outline-none focus:ring-1"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                onBlur={submitCost}
                onKeyDown={(e) => e.key === 'Enter' && submitCost()}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingCost(true)}
              className="text-sm text-[#1e40af] hover:underline"
            >
              SUB-Kosten eintragen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

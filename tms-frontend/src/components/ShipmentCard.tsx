import { useMutation, useQueryClient } from '@tanstack/react-query';
import { memo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { api } from '../lib/api';
import type { Shipment } from '../types/shipment';
import {
  TRANSPORT_TYPE_OPTIONS,
  transportTypeLabel,
} from '../constants/transportTypes';
import ShipmentEditModal from './ShipmentEditModal';

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatFromTo(s: Shipment): string {
  const load = s.loadingAddress ?? s.addresses_shipments_loading_address_idToaddresses;
  const deliv = s.deliveryAddress ?? s.addresses_shipments_delivery_address_idToaddresses;
  const from = load ? [load.city, load.country_code ?? load.countryCode].filter(Boolean).join(' ') || '–' : '–';
  const to = deliv ? [deliv.city, deliv.country_code ?? deliv.countryCode].filter(Boolean).join(' ') || '–' : '–';
  return `${from} → ${to}`;
}

function deliveryTypeBadge(type?: string | null) {
  switch (type) {
    case 'OWN_NV':
      return {
        emoji: '🟢',
        label: 'Eigener NV',
        className:
          'bg-green-100 text-green-800 border-green-200',
      };
    case 'NETWORK_PARTNER':
      return {
        emoji: '🔵',
        label: 'Netzwerk',
        className:
          'bg-blue-100 text-blue-800 border-blue-200',
      };
    case 'CHARTER':
      return {
        emoji: '🟠',
        label: 'Charter',
        className:
          'bg-orange-100 text-orange-800 border-orange-200',
      };
    case 'COOPERATOR':
      return {
        emoji: '🟣',
        label: 'Kooperator',
        className:
          'bg-purple-100 text-purple-800 border-purple-200',
      };
    default:
      return null;
  }
}

export interface ShipmentCardProps {
  shipment: Shipment;
  draggable?: boolean;
  onLockBadgeClick?: () => void;
  /** Phase-C: scalar boolean statt Set<string>. true wenn diese
   *  Sendung Teil einer Multi-Selection ist (>1 markiert). Wirkt auf
   *  Stackable + Verkehrsart-Toggle (Bulk-Mode). */
  isBulkSelected?: boolean;
  /** Phase-C: Bulk-IDs werden NICHT als Prop durchgereicht (Memo-
   *  Breaker bei jeder Selection-Aenderung). Stattdessen: Closure
   *  ueber stabilen useCallback im Parent, der zur Mutation-Zeit
   *  die aktuelle Auswahl aus einem Ref liest. Wenn null/undefined
   *  → Single-Mode (nicht-bulk). */
  getBulkIds?: () => string[];
  /** Klick auf Card-Body (außerhalb von interaktiven Elementen) */
  onCardClick?: () => void;
}

function ShipmentCardImpl({
  shipment,
  draggable = false,
  onLockBadgeClick,
  isBulkSelected,
  getBulkIds,
  onCardClick,
}: ShipmentCardProps) {
  // Bulk-Body-Helfer: liest die aktuelle Auswahl-IDs JIT (zur
  // Mutation-Zeit) statt sie als Prop zu cachen — damit kein
  // Memo-Breaker bei Selection-Toggles.
  const buildBulkBody = (
    patch: Record<string, unknown>,
  ): { ids: string[]; patch: Record<string, unknown> } | null => {
    if (!isBulkSelected || !getBulkIds) return null;
    const ids = getBulkIds();
    if (ids.length <= 1) return null;
    return { ids, patch };
  };
  const row = shipment as {
    customers?: { name: string };
    business_partner?: { name?: string; partner_number?: string };
  };
  const outboundType = (shipment as any).outbound_delivery_type as string | null | undefined;
  const inboundType = (shipment as any).inbound_delivery_type as string | null | undefined;
  const outboundBadge = deliveryTypeBadge(outboundType);
  const inboundBadge = deliveryTypeBadge(inboundType);

  const partyName =
    row.customers?.name ??
    (row.business_partner
      ? `[BP] ${row.business_partner.name ?? row.business_partner.partner_number ?? ''}`
      : undefined) ??
    shipment.customer?.name ??
    '–';

  const revenue = Number(shipment.freightRevenue ?? (shipment as { freight_revenue?: number }).freight_revenue ?? 0);
  const ldm = Number(shipment.ldm ?? 0);
  const rowAny = shipment as any;
  const packageCount = Number(rowAny.package_count ?? rowAny.packageCount ?? 0);
  const lengthCm = Number(rowAny.length_cm ?? rowAny.lengthCm ?? 0);
  const widthCm = Number(rowAny.width_cm ?? rowAny.widthCm ?? 0);
  const heightCm = Number(rowAny.height_cm ?? rowAny.heightCm ?? 0);
  const items = shipment.shipment_package_items ?? [];
  const fallbackStackable = !String(rowAny.package_type ?? rowAny.packageType ?? '')
    .toLowerCase()
    .includes('drum');
  const persistedStackable =
    items.length > 0 ? items.every((it) => it.stackable !== false) : null;
  const [optimisticStackable, setOptimisticStackable] = useState<boolean | null>(null);
  const isStackable =
    optimisticStackable ?? persistedStackable ?? fallbackStackable;
  const canToggle = items.length > 0;
  const queryClient = useQueryClient();
  const stackableMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const bulk = buildBulkBody({ stackable: next });
      if (bulk) {
        await api.post(`/shipments/bulk-patch`, bulk);
      } else {
        await api.patch(`/shipments/${shipment.id}/stackable`, { stackable: next });
      }
    },
    onMutate: async (next: boolean) => {
      setOptimisticStackable(next);
    },
    onError: () => {
      setOptimisticStackable(null);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['shipments'] });
      void queryClient.invalidateQueries({ queryKey: ['tours'] });
      setOptimisticStackable(null);
    },
  });

  const persistedTransportType =
    shipment.transport_type ?? (rowAny.transportType as string | undefined);
  const [optimisticTransportType, setOptimisticTransportType] = useState<string | null>(null);
  const currentTransportType = optimisticTransportType ?? persistedTransportType ?? '';
  const transportMutation = useMutation({
    mutationFn: async (next: string) => {
      const bulk = buildBulkBody({ transportType: next });
      if (bulk) {
        await api.post(`/shipments/bulk-patch`, bulk);
      } else {
        await api.patch(`/shipments/${shipment.id}`, { transportType: next });
      }
    },
    onMutate: async (next: string) => {
      setOptimisticTransportType(next);
    },
    onError: () => {
      setOptimisticTransportType(null);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['shipments'] });
      void queryClient.invalidateQueries({ queryKey: ['tours'] });
      setOptimisticTransportType(null);
    },
  });

  const hasLock = !!(rowAny.has_active_lock ?? shipment.has_active_lock);
  const lockLabel =
    (rowAny.lock_types ?? shipment.lock_types)?.split(',')[0]?.trim() || 'GESPERRT';

  const hasNvDisposition = Boolean((rowAny.has_nv_disposition ?? shipment.has_nv_disposition) ?? false);
  const hasDamage = Boolean((rowAny.has_damage_report ?? shipment.has_damage_report) ?? false);
  const hasReturn = Boolean((rowAny.has_return ?? shipment.has_return) ?? false);

  function handleDragStart(e: React.DragEvent) {
    if (!draggable) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ shipmentId: shipment.id }));
    e.dataTransfer.effectAllowed = 'move';
  }

  const [editOpen, setEditOpen] = useState(false);

  return (
    <div
      className={`group rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow ${
        hasLock ? 'border-red-500 ring-1 ring-red-200' : 'border-gray-200'
      } ${onCardClick ? 'cursor-pointer' : ''}`}
      draggable={draggable}
      onClick={onCardClick}
      onDragStart={draggable ? handleDragStart : undefined}
      role={draggable ? 'button' : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-900 flex items-center gap-2">
          {(shipment as { shipment_number?: string }).shipment_number ??
            shipment.shipmentNumber ??
            shipment.id}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditOpen(true);
            }}
            title="Sendung bearbeiten"
            className="opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 max-md:opacity-100 transition-opacity text-gray-400 hover:text-[#1e40af] p-0.5 rounded hover:bg-gray-100"
            aria-label="Sendung bearbeiten"
          >
            <Pencil size={14} />
          </button>
        </span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {hasLock && (
            <button
              type="button"
              title="Sperre"
              onClick={(e) => {
                e.stopPropagation();
                onLockBadgeClick?.();
              }}
              className="rounded bg-red-100 text-red-800 px-2 py-0.5 text-xs font-semibold border border-red-200"
            >
              🔒 {lockLabel}
            </button>
          )}
          {ldm > 0 && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {ldm} ldm
            </span>
          )}
          {hasNvDisposition && (
            <span className="rounded bg-red-100 text-red-800 px-2 py-0.5 text-xs font-semibold border border-red-200">
              🔴 NV offen
            </span>
          )}
          {hasDamage && (
            <span className="rounded bg-orange-100 text-orange-800 px-2 py-0.5 text-xs font-semibold border border-orange-200">
              🟠 Schaden
            </span>
          )}
          {hasReturn && (
            <span className="rounded bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-semibold border border-blue-200">
              🔵 Retoure
            </span>
          )}
        </div>
      </div>
      {(outboundBadge || inboundBadge) && (
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          {outboundBadge && (
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${outboundBadge.className}`}
            >
              {outboundBadge.emoji} {outboundBadge.label} (Ausgang)
            </span>
          )}
          {inboundBadge && (
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${inboundBadge.className}`}
            >
              {inboundBadge.emoji} {inboundBadge.label} (Eingang)
            </span>
          )}
        </div>
      )}
      <div className="mt-1 text-sm text-gray-600">
        {partyName}
      </div>
      <div className="mt-0.5 text-xs text-gray-500">
        {formatFromTo(shipment)}
      </div>
      <div className="mt-1 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
        <span>
          {packageCount || 0} EP · {(lengthCm / 100).toFixed(1)}×
          {(widthCm / 100).toFixed(1)}×{(heightCm / 100).toFixed(1)}m ·{' '}
          {ldm.toFixed(2)} ldm
        </span>
        <button
          type="button"
          disabled={!canToggle || stackableMutation.isPending}
          onClick={(e) => {
            e.stopPropagation();
            if (!canToggle) return;
            stackableMutation.mutate(!isStackable);
          }}
          title={
            canToggle
              ? 'Klick: Stapelbarkeit umschalten'
              : 'Keine Packstücke – Anzeige aus package_type abgeleitet'
          }
          className={
            (isStackable ? 'text-blue-700' : 'text-red-700') +
            ' rounded px-1 ' +
            (canToggle
              ? 'hover:bg-gray-100 cursor-pointer'
              : 'cursor-default opacity-70') +
            (stackableMutation.isPending ? ' animate-pulse' : '')
          }
        >
          {isStackable ? '🔵 Stapelbar' : '🔴 Nicht stapelbar'}
        </button>
        <span
          className={
            'relative inline-flex items-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 ' +
            (transportMutation.isPending ? 'animate-pulse' : '')
          }
          title="Klick: Verkehrsart ändern"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="px-1 text-[11px] font-medium pointer-events-none">
            📦 {transportTypeLabel(currentTransportType)}
          </span>
          <select
            disabled={transportMutation.isPending}
            value={currentTransportType}
            onChange={(e) => {
              const next = e.target.value;
              if (next && next !== currentTransportType) {
                transportMutation.mutate(next);
              }
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Verkehrsart"
          >
            {!currentTransportType && <option value="">–</option>}
            {TRANSPORT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-gray-500">{formatDate((shipment as { loading_date?: string }).loading_date ?? shipment.loadingDate ?? '')}</span>
        {revenue > 0 && (
          <span className="font-medium text-gray-700">{formatCurrency(revenue)}</span>
        )}
      </div>
      <ShipmentEditModal
        shipment={shipment}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

/**
 * Phase-C: React.memo + scalar Bulk-Props. Vorher war `selectedIds:
 * Set<string>` ein Memo-Breaker — Set-Identitaet aenderte sich bei
 * jedem Toggle, alle ~600 Cards re-renderten. Jetzt:
 *   · isBulkSelected: boolean — wechselt nur fuer betroffene Rows.
 *   · getBulkIds: useCallback im Parent — Function-Ref stabil.
 * Default-shallow-Compare reicht.
 */
const ShipmentCard = memo(ShipmentCardImpl);
export default ShipmentCard;

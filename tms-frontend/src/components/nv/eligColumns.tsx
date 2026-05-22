/**
 * W-3.2.A: eligColumns extrahiert aus NvDispositionPage.tsx (Pure-Move).
 * Spalten-Spec für die Eligible-Shipments-Tabelle (ResponsiveTable).
 */
import { Eye } from 'lucide-react';
import type { Column } from '../table/ResponsiveTable';
import {
  pickupBadge,
  type EligibleShipment,
} from '../../lib/nvTypes';

export function eligColumns(
  onOpenDetail: (id: string) => void,
): Column<EligibleShipment>[] {
  return [
    {
      key: 'detail',
      header: '',
      width: 32,
      minWidth: 32,
      resizable: false,
      render: (s) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(s.id);
          }}
          className="text-gray-500 hover:text-blue-700"
          title="Detail"
        >
          <Eye size={16} />
        </button>
      ),
    },
    {
      key: 'number',
      header: 'Nr.',
      width: 110,
      render: (s) => <span className="font-mono text-xs">{s.shipment_number}</span>,
    },
    {
      key: 'customer',
      header: 'Kunde',
      minWidth: 140,
      render: (s) => (
        <span className="truncate" title={s.customer?.name ?? ''}>
          {s.customer?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'ort',
      header: 'Ort',
      width: 140,
      render: (s) => (
        <span className="text-xs text-gray-600 truncate">
          {s.delivery_address?.zip} {s.delivery_address?.city}
        </span>
      ),
    },
    {
      key: 'info',
      header: 'Info',
      width: 130,
      render: (s) => (
        <span className="text-xs text-gray-600">
          {s.package_count} Pak
          {s.total_weight_kg
            ? ` · ${Number(s.total_weight_kg).toFixed(0)} kg`
            : ''}
          {s.total_ldm ? ` · ${Number(s.total_ldm).toFixed(2)} LDM` : ''}
        </span>
      ),
    },
    {
      key: 'badges',
      header: 'Status',
      width: 180,
      render: (s) => {
        const b = pickupBadge(s.loading_date);
        const c = classificationBadge(s.classification);
        return (
          <span className="flex flex-wrap gap-1">
            {c && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.cls}`}
                title={c.title}
              >
                {c.label}
              </span>
            )}
            {s.is_stamm_kunde && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700"
                title="Stammkunde"
              >
                Stamm
              </span>
            )}
            {b && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${b.cls}`}
                title={`Pickup ${s.loading_date.slice(0, 10)}`}
              >
                {b.label}
              </span>
            )}
          </span>
        );
      },
    },
  ];
}

/**
 * TEIL C: 3-stufige Classification-Badges für NV-Eligible-Liste
 * (FV-Pattern aus R2.3 — dort "CU" als amber). SG=grau (Default),
 * CU=amber, CD=rose.
 */
function classificationBadge(
  classification: string | null | undefined,
): { label: string; cls: string; title: string } | null {
  switch (classification) {
    case 'SAMMELGUT':
      return {
        label: 'SG',
        cls: 'bg-gray-100 text-gray-700',
        title: 'Sammelgut (< 3t)',
      };
    case 'CHARTER_UMSCHLAG':
      return {
        label: 'CU',
        cls: 'bg-amber-100 text-amber-800',
        title: 'Charter-Umschlag (NV-Vorholung → Lager → FV-Hauptlauf)',
      };
    case 'CHARTER_DIREKT':
      return {
        label: 'CD',
        cls: 'bg-rose-100 text-rose-800',
        title: 'Charter-Direkt (ohne Umschlag)',
      };
    default:
      return null;
  }
}

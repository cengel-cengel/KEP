import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { AUTH_TOKEN_KEY, api } from '../lib/api';
import type { Shipment } from '../types/shipment';

function formatLoadingDate(shipment: Shipment): string {
  try {
    const raw = (shipment as unknown as Record<string, unknown>).loading_date ?? shipment.loadingDate;
    if (raw == null) return '–';
    const d = new Date(raw as string);
    if (Number.isNaN(d.getTime())) return '–';
    return d.toLocaleDateString('de-DE');
  } catch {
    return '–';
  }
}

function formatOptionalDate(raw?: string | null): string {
  try {
    if (raw == null) return '–';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '–';
    return d.toLocaleDateString('de-DE');
  } catch {
    return '–';
  }
}

function formatDb(s: Shipment): string {
  const r = s as unknown as Record<string, unknown>;
  const percent = r.cm_percent ?? r.cmPercent;
  if (percent != null && !Number.isNaN(Number(percent))) return `${Number(percent).toFixed(1)}%`;
  const rev = Number(r.freight_revenue ?? s.freightRevenue ?? 0);
  const cm = Number(r.contribution_margin ?? s.contributionMargin ?? 0);
  if (rev <= 0) return '–';
  return `${((cm / rev) * 100).toFixed(1)}%`;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}


function statusBadgeClass(status: string): string {
  switch (status) {
    case 'new':
      return 'bg-gray-100 text-gray-800';
    case 'dispatched':
      return 'bg-blue-100 text-blue-800';
    case 'in_transit':
      return 'bg-orange-100 text-orange-800';
    case 'delivered':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function toDateInputValue(raw?: string | null): string {
  if (!raw) return '';
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toTimeInputValue(raw?: string | null): string {
  if (!raw) return '';
  const s = String(raw);
  const m = s.match(/(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

function parseOptionalNumber(v: string): number | undefined {
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function parseShipmentNumberList(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  const parts = s
    .split(/[\s,;]+/g)
    .map((p) => p.trim())
    .filter(Boolean);
  // Keep original formatting, but avoid duplicates.
  return Array.from(new Set(parts));
}

function extractDateYYYYMMDD(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw);
  // ISO: take date part.
  if (s.includes('T')) {
    const d = s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DE / Freitext formats like DD.MM.YYYY or DD-MM-YYYY
  // We take the first occurrence and normalize to YYYY-MM-DD.
  const mDe = s.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (mDe) {
    const dd = String(mDe[1]).padStart(2, '0');
    const mm = String(mDe[2]).padStart(2, '0');
    const yyyy = mDe[3];
    const normalized = `${yyyy}-${mm}-${dd}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  }

  // Formats like YYYY.MM.DD or YYYY/MM/DD
  const mIsoDotted = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (mIsoDotted) {
    const yyyy = mIsoDotted[1];
    const mm = String(mIsoDotted[2]).padStart(2, '0');
    const dd = String(mIsoDotted[3]).padStart(2, '0');
    const normalized = `${yyyy}-${mm}-${dd}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  }

  // Try extracting first YYYY-MM-DD occurrence.
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function extractTimeHHMM(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw);
  const m = s.match(/(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

function downloadXlsx(filename: string, workbook: XLSX.WorkBook) {
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function decodeJwtSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + (4 - (normalized.length % 4)) % 4, '=');
    const decoded = atob(padded);
    const json = JSON.parse(decoded) as { sub?: unknown };
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

export default function ShipmentsPage() {
  type ShipmentForEdit = Shipment & {
    tour_id?: string | null;
    tourId?: string | null;
    customers?: { id?: string; name?: string } | null;
    business_partner?: { id?: string; name?: string; partner_number?: string } | null;
    shipment_number?: string;
    freight_revenue?: number | null;
    freightRevenue?: number | null;
    cm_percent?: number | null;
    cmPercent?: number | null;
    addresses_shipments_loading_address_idToaddresses?: {
      id?: string;
      city?: string | null;
      name?: string | null;
      zip?: string | null;
      country_code?: string | null;
    } | null;
    addresses_shipments_delivery_address_idToaddresses?: {
      id?: string;
      city?: string | null;
      name?: string | null;
      zip?: string | null;
      country_code?: string | null;
    } | null;
    tours?: {
      id?: string;
      tour_number?: string | null;
      status?: string | null;
      total_revenue?: unknown;
      subcontractor_cost?: unknown;
      closed_at?: string | null;
      completed_at?: string | null;
    } | null;
    inbound_routing?: {
      rule_name?: string | null;
      delivery_type?: string | null;
      partner_name?: string | null;
    } | null;
    outbound_routing?: {
      rule_name?: string | null;
      delivery_type?: string | null;
      partner_name?: string | null;
    } | null;
    inbound_delivery_type?: string | null;
    outbound_delivery_type?: string | null;
    pre_carriage_shipments?: Array<{
      pre_carriage_tours?: {
        id?: string;
        tour_date?: string | null;
        total_cost?: unknown;
        status?: string | null;
      } | null;
    }>;
    pre_carriage_cost?: unknown;
    main_carriage_cost?: unknown;
    transport_type?: string | null;
    transportType?: string | null;
    loading_address_id?: string | null;
    loadingAddressId?: string | null;
    delivery_address_id?: string | null;
    deliveryAddressId?: string | null;
    customer_ref?: string | null;
    customerRef?: string | null;
    loading_date?: string | null;
    loadingDate?: string | null;
    loading_time_from?: string | null;
    loadingTimeFrom?: string | null;
    loading_time_to?: string | null;
    loadingTimeTo?: string | null;
    delivery_date?: string | null;
    deliveryDate?: string | null;
    delivery_time_from?: string | null;
    deliveryTimeFrom?: string | null;
    delivery_time_to?: string | null;
    deliveryTimeTo?: string | null;
    package_type?: string | null;
    packageType?: string | null;
    package_count?: number | null;
    packageCount?: number | null;
    weight_kg?: number | null;
    weightKg?: number | null;
    volume_m3?: number | null;
    volumeM3?: number | null;
    is_hazmat?: boolean | null;
    isHazmat?: boolean | null;
    hazmat_class?: string | null;
    hazmatClass?: string | null;
    hazmat_un_number?: string | null;
    hazmatUnNumber?: string | null;
    hazmat_packing_group?: string | null;
    hazmatPackingGroup?: string | null;
    hazmat_description?: string | null;
    hazmatDescription?: string | null;
    incoterm?: string | null;
    freightPayer?: string | null;
    freight_payer?: string | null;
    comment?: string | null;
    customerNote?: string | null;
    customer_note?: string | null;
  };

  const { data: shipments, isLoading, isError, error } = useQuery({
    queryKey: ['shipments'],
    queryFn: async () => {
      const { data } = await api.get<Shipment[]>('/shipments');
      return data;
    },
  });

  const queryClient = useQueryClient();

  const [lockModalShipmentId, setLockModalShipmentId] = useState<string | null>(null);
  const { data: lockModalLocks = [] } = useQuery({
    queryKey: ['status', 'locks', 'shipment', lockModalShipmentId],
    queryFn: async () => {
      const { data } = await api.get<
        Array<{ id: string; lock_type: string; reason: string | null; locked_at: string | null }>
      >(`/status/locks/shipment/${lockModalShipmentId}/active`);
      return data;
    },
    enabled: !!lockModalShipmentId,
  });

  type ListScope = 'open' | 'all' | 'archived';
  const [listScope, setListScope] = useState<ListScope>('open');

  const baseShipments = useMemo(() => {
    if (!shipments) return [];
    const typed = shipments as ShipmentForEdit[];
    if (listScope === 'open') {
      return typed.filter((s) => s.tour_id == null && (s.tourId == null || s.tourId === null));
    }
    if (listScope === 'archived') {
      return typed.filter((s) => {
        const st = s.tours?.status;
        return st === 'closed' || st === 'completed';
      });
    }
    return typed;
  }, [shipments, listScope]);

  const getCustomerName = (row: ShipmentForEdit): string => {
    const bpName = row.business_partner
      ? `[BP] ${row.business_partner.name ?? row.business_partner.partner_number ?? ''}`.trim()
      : '';
    return (
      row.customers?.name ??
      bpName ??
      row.customer?.name ??
      ''
    );
  };

  const getLoadingCity = (row: ShipmentForEdit): string =>
    row.addresses_shipments_loading_address_idToaddresses?.city ??
    row.loadingAddress?.city ??
    '';

  const getDeliveryCity = (row: ShipmentForEdit): string =>
    row.addresses_shipments_delivery_address_idToaddresses?.city ??
    row.deliveryAddress?.city ??
    '';

  const getReceiverCountryZipCity = (row: ShipmentForEdit): string => {
    const a = row.addresses_shipments_delivery_address_idToaddresses;
    if (!a) return '';
    const cc = a.country_code ?? '';
    const zip = a.zip ?? '';
    const city = a.city ?? '';
    return [cc, zip, city].filter(Boolean).join(' ');
  };

  const getRoutingRelationsText = (row: ShipmentForEdit): string => {
    const ir = row.inbound_routing;
    const or = row.outbound_routing;
    const it = ir?.delivery_type ?? row.inbound_delivery_type ?? '';
    const ot = or?.delivery_type ?? row.outbound_delivery_type ?? '';
    const line1 = [
      it ? `Eingang: ${it}` : '',
      ot ? `Ausgang: ${ot}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const names = [ir?.rule_name, or?.rule_name].filter(Boolean).join(' · ');
    return [line1, names].filter(Boolean).join(' | ');
  };

  const getPreCarriageTourText = (row: ShipmentForEdit): string => {
    const pcs = row.pre_carriage_shipments ?? [];
    if (!pcs.length) return '';
    return pcs
      .map((p) => {
        const t = p.pre_carriage_tours;
        if (!t?.id) return '';
        const d = t.tour_date
          ? new Date(t.tour_date).toLocaleDateString('de-DE')
          : '';
        return `Vorlauf ${d} (${String(t.id).slice(0, 8)}…)`;
      })
      .filter(Boolean)
      .join(' | ');
  };

  const getMainTourText = (row: ShipmentForEdit): string => {
    const tour = row.tours;
    if (!tour?.tour_number) return '';
    return `${tour.tour_number}${tour.status ? ` (${tour.status})` : ''}`;
  };

  const getTourTotalsText = (row: ShipmentForEdit): string => {
    const tour = row.tours;
    if (!tour?.tour_number) return '';
    const rev = Number(tour.total_revenue ?? 0);
    const cost = Number(tour.subcontractor_cost ?? 0);
    return `Tour ${tour.tour_number}: ${formatCurrency(rev)} / ${formatCurrency(cost)}`;
  };

  const getDbPercentRaw = (row: ShipmentForEdit): number | null => {
    const v = (row.cm_percent ?? row.cmPercent) as number | null | undefined;
    if (v == null) return null;
    const n = Number(v);
    if (Number.isNaN(n)) return null;
    return n;
  };

  type ColumnDef = {
    id: string;
    label: string;
    getFilterText: (row: ShipmentForEdit) => string;
    getExportValue: (row: ShipmentForEdit) => unknown;
  };

  const columnDefs: ColumnDef[] = [
      {
        id: 'shipmentNumber',
        label: 'Nr.',
        getFilterText: (row) => String(row.shipment_number ?? row.shipmentNumber ?? ''),
        getExportValue: (row) => row.shipment_number ?? row.shipmentNumber ?? null,
      },
      {
        id: 'customerName',
        label: 'Kunde',
        getFilterText: (row) => getCustomerName(row),
        getExportValue: (row) => getCustomerName(row) || null,
      },
      {
        id: 'customerRef',
        label: 'Kundenref.',
        getFilterText: (row) => String(row.customer_ref ?? row.customerRef ?? ''),
        getExportValue: (row) => row.customer_ref ?? row.customerRef ?? null,
      },
      {
        id: 'transportType',
        label: 'Transporttyp',
        getFilterText: (row) => String(row.transport_type ?? row.transportType ?? ''),
        getExportValue: (row) => row.transport_type ?? row.transportType ?? null,
      },
      {
        id: 'loadingAddressId',
        label: 'Ladeadresse ID',
        getFilterText: (row) => String(row.loading_address_id ?? row.loadingAddressId ?? row.addresses_shipments_loading_address_idToaddresses?.id ?? ''),
        getExportValue: (row) =>
          row.loading_address_id ?? row.loadingAddressId ?? row.addresses_shipments_loading_address_idToaddresses?.id ?? null,
      },
      {
        id: 'loadingCity',
        label: 'Ladestelle',
        getFilterText: (row) => getLoadingCity(row),
        getExportValue: (row) => getLoadingCity(row) || null,
      },
      {
        id: 'deliveryAddressId',
        label: 'Entladeadresse ID',
        getFilterText: (row) => String(row.delivery_address_id ?? row.deliveryAddressId ?? row.addresses_shipments_delivery_address_idToaddresses?.id ?? ''),
        getExportValue: (row) =>
          row.delivery_address_id ?? row.deliveryAddressId ?? row.addresses_shipments_delivery_address_idToaddresses?.id ?? null,
      },
      {
        id: 'deliveryCity',
        label: 'Entladestelle',
        getFilterText: (row) => getDeliveryCity(row),
        getExportValue: (row) => getDeliveryCity(row) || null,
      },
      {
        id: 'loadingDate',
        label: 'Ladedatum',
        getFilterText: (row) => {
          const raw = row.loading_date ?? row.loadingDate ?? '';
          return `${String(raw ?? '')} ${formatLoadingDate(row as unknown as Shipment)}`;
        },
        getExportValue: (row) => (row.loading_date ?? row.loadingDate) ?? null,
      },
      {
        id: 'loadingTimeFrom',
        label: 'Ladezeit von',
        getFilterText: (row) => String(row.loading_time_from ?? row.loadingTimeFrom ?? ''),
        getExportValue: (row) => row.loading_time_from ?? row.loadingTimeFrom ?? null,
      },
      {
        id: 'loadingTimeTo',
        label: 'Ladezeit bis',
        getFilterText: (row) => String(row.loading_time_to ?? row.loadingTimeTo ?? ''),
        getExportValue: (row) => row.loading_time_to ?? row.loadingTimeTo ?? null,
      },
      {
        id: 'deliveryDate',
        label: 'Entladedatum',
        getFilterText: (row) => {
          const raw = row.delivery_date ?? row.deliveryDate ?? '';
          return `${String(raw ?? '')} ${formatOptionalDate(String(raw ?? '') === '' ? null : (raw as string))}`;
        },
        getExportValue: (row) => (row.delivery_date ?? row.deliveryDate) ?? null,
      },
      {
        id: 'deliveryTimeFrom',
        label: 'Entladezeit von',
        getFilterText: (row) => String(row.delivery_time_from ?? row.deliveryTimeFrom ?? ''),
        getExportValue: (row) => row.delivery_time_from ?? row.deliveryTimeFrom ?? null,
      },
      {
        id: 'deliveryTimeTo',
        label: 'Entladezeit bis',
        getFilterText: (row) => String(row.delivery_time_to ?? row.deliveryTimeTo ?? ''),
        getExportValue: (row) => row.delivery_time_to ?? row.deliveryTimeTo ?? null,
      },
      {
        id: 'packageType',
        label: 'Pakettyp',
        getFilterText: (row) => String(row.package_type ?? row.packageType ?? ''),
        getExportValue: (row) => row.package_type ?? row.packageType ?? null,
      },
      {
        id: 'packageCount',
        label: 'Paketanzahl',
        getFilterText: (row) => String(row.package_count ?? row.packageCount ?? ''),
        getExportValue: (row) => row.package_count ?? row.packageCount ?? null,
      },
      {
        id: 'weightKg',
        label: 'Gewicht (kg)',
        getFilterText: (row) => String(row.weight_kg ?? row.weightKg ?? ''),
        getExportValue: (row) => row.weight_kg ?? row.weightKg ?? null,
      },
      {
        id: 'ldm',
        label: 'LDM',
        getFilterText: (row) => String(row.ldm ?? '') as string,
        getExportValue: (row) => row.ldm ?? null,
      },
      {
        id: 'volumeM3',
        label: 'Volumen (m³)',
        getFilterText: (row) => String(row.volume_m3 ?? row.volumeM3 ?? ''),
        getExportValue: (row) => row.volume_m3 ?? row.volumeM3 ?? null,
      },
      {
        id: 'isHazmat',
        label: 'Gefahrgut',
        getFilterText: (row) => String(row.is_hazmat ?? row.isHazmat ?? false),
        getExportValue: (row) => row.is_hazmat ?? row.isHazmat ?? false,
      },
      {
        id: 'hazmatClass',
        label: 'Klasse',
        getFilterText: (row) => String(row.hazmat_class ?? row.hazmatClass ?? ''),
        getExportValue: (row) => row.hazmat_class ?? row.hazmatClass ?? null,
      },
      {
        id: 'hazmatUnNumber',
        label: 'UN-Nummer',
        getFilterText: (row) => String(row.hazmat_un_number ?? row.hazmatUnNumber ?? ''),
        getExportValue: (row) => row.hazmat_un_number ?? row.hazmatUnNumber ?? null,
      },
      {
        id: 'hazmatPackingGroup',
        label: 'Packing Group',
        getFilterText: (row) => String(row.hazmat_packing_group ?? row.hazmatPackingGroup ?? ''),
        getExportValue: (row) => row.hazmat_packing_group ?? row.hazmatPackingGroup ?? null,
      },
      {
        id: 'hazmatDescription',
        label: 'Beschreibung',
        getFilterText: (row) => String(row.hazmat_description ?? row.hazmatDescription ?? ''),
        getExportValue: (row) => row.hazmat_description ?? row.hazmatDescription ?? null,
      },
      {
        id: 'incoterm',
        label: 'Incoterm',
        getFilterText: (row) => String(row.incoterm ?? ''),
        getExportValue: (row) => row.incoterm ?? null,
      },
      {
        id: 'freightPayer',
        label: 'Frachtzahler',
        getFilterText: (row) => String(row.freight_payer ?? row.freightPayer ?? ''),
        getExportValue: (row) => row.freight_payer ?? row.freightPayer ?? null,
      },
      {
        id: 'comment',
        label: 'Kommentar',
        getFilterText: (row) => String(row.comment ?? ''),
        getExportValue: (row) => row.comment ?? null,
      },
      {
        id: 'customerNote',
        label: 'Kunden-Notiz',
        getFilterText: (row) => String(row.customer_note ?? row.customerNote ?? ''),
        getExportValue: (row) => row.customer_note ?? row.customerNote ?? null,
      },
      {
        id: 'freightRevenue',
        label: 'Erlös',
        getFilterText: (row) => String(row.freight_revenue ?? row.freightRevenue ?? ''),
        getExportValue: (row) => row.freight_revenue ?? row.freightRevenue ?? null,
      },
      {
        id: 'dbPercent',
        label: 'DB %',
        getFilterText: (row) => String(getDbPercentRaw(row) ?? ''),
        getExportValue: (row) => getDbPercentRaw(row),
      },
      {
        id: 'routingRelations',
        label: 'Relation (Ein/Aus)',
        getFilterText: (row) => getRoutingRelationsText(row),
        getExportValue: (row) => getRoutingRelationsText(row) || null,
      },
      {
        id: 'receiverCountryZipCity',
        label: 'Empfang (Land PLZ Ort)',
        getFilterText: (row) => getReceiverCountryZipCity(row),
        getExportValue: (row) => getReceiverCountryZipCity(row) || null,
      },
      {
        id: 'preCarriageTourInfo',
        label: 'Vorlauf-Tour',
        getFilterText: (row) => getPreCarriageTourText(row),
        getExportValue: (row) => getPreCarriageTourText(row) || null,
      },
      {
        id: 'mainCarriageTourInfo',
        label: 'Hauptlauf-Tour',
        getFilterText: (row) => getMainTourText(row),
        getExportValue: (row) => getMainTourText(row) || null,
      },
      {
        id: 'tourTotalsContext',
        label: 'Tour Erlös / Kosten',
        getFilterText: (row) => getTourTotalsText(row),
        getExportValue: (row) => getTourTotalsText(row) || null,
      },
      {
        id: 'costPreCarriageShare',
        label: 'Kostenanteil Vorlauf',
        getFilterText: (row) => String(row.pre_carriage_cost ?? ''),
        getExportValue: (row) => row.pre_carriage_cost ?? null,
      },
      {
        id: 'costMainCarriageShare',
        label: 'Kostenanteil Hauptlauf',
        getFilterText: (row) => String(row.main_carriage_cost ?? ''),
        getExportValue: (row) => row.main_carriage_cost ?? null,
      },
      {
        id: 'status',
        label: 'Status',
        getFilterText: (row) => String(row.status ?? ''),
        getExportValue: (row) => row.status ?? null,
      },
  ];

  const authToken = typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const authUserSub = decodeJwtSub(authToken);
  const STORAGE_KEY = `shipmentsPage.visibleColumns.v1:${authUserSub ?? 'unknown'}`;
  const defaultVisibleColumnIds = columnDefs.map((c) => c.id);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultVisibleColumnIds;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((x) => typeof x === 'string' && defaultVisibleColumnIds.includes(x));
        return cleaned.length ? cleaned : defaultVisibleColumnIds;
      }
      return defaultVisibleColumnIds;
    } catch {
      return defaultVisibleColumnIds;
    }
  });

  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);

  const visibleColumns = useMemo(() => {
    const byId = new Map(columnDefs.map((c) => [c.id, c]));
    return visibleColumnIds.map((id) => byId.get(id)).filter((c): c is ColumnDef => Boolean(c));
  }, [visibleColumnIds]); // columnDefs bewusst ausgelassen (neu pro Render)
  const visibleColumnIdsRef = useRef<string[]>(visibleColumnIds);
  useEffect(() => {
    visibleColumnIdsRef.current = visibleColumnIds;
  }, [visibleColumnIds]);
  const allowedColumnIdsSetRef = useRef<Set<string>>(new Set(defaultVisibleColumnIds));
  useEffect(() => {
    allowedColumnIdsSetRef.current = new Set(defaultVisibleColumnIds);
  }, [defaultVisibleColumnIds]);

  const actionColumnWidthPx = 160;
  const defaultColumnWidthPx = 170;
  const columnWidthsStorageKey = `shipmentsPage.columnWidths.v1:${authUserSub ?? 'unknown'}`;

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(columnWidthsStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n) && n > 0) out[k] = n;
      }
      return out;
    } catch {
      return {};
    }
  });

  const columnWidthsRef = useRef(columnWidths);
  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  const serverColumnWidthsQuery = useQuery({
    queryKey: ['shipments-page-column-widths'],
    queryFn: async () => {
      const { data } = await api.get<{ columnWidths: Record<string, number> | null }>(
        '/user-preferences/shipments-page-column-widths',
      );
      return data.columnWidths;
    },
    enabled: !!authToken,
    retry: false,
  });

  useEffect(() => {
    if (!serverColumnWidthsQuery.isSuccess) return;
    const widths = serverColumnWidthsQuery.data;
    if (!widths || typeof widths !== 'object') return;

    const allowed = allowedColumnIdsSetRef.current;
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(widths)) {
      if (!allowed.has(k)) continue;
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n) && n > 0) cleaned[k] = n;
    }
    if (Object.keys(cleaned).length === 0) return;

    // Avoid needless updates.
    const same = Object.keys(cleaned).every((k) => columnWidthsRef.current[k] === cleaned[k]);
    if (!same) setColumnWidths((prev) => ({ ...prev, ...cleaned }));
  }, [serverColumnWidthsQuery.isSuccess, serverColumnWidthsQuery.data]);

  const saveColumnWidthsMutation = useMutation({
    mutationFn: async (widths: Record<string, number>) => {
      await api.put('/user-preferences/shipments-page-column-widths', { columnWidths: widths });
    },
  });

  const columnWidthsSaveTimerRef = useRef<number | null>(null);
  const scheduleSaveColumnWidths = (widths: Record<string, number>) => {
    if (columnWidthsSaveTimerRef.current) window.clearTimeout(columnWidthsSaveTimerRef.current);
    columnWidthsSaveTimerRef.current = window.setTimeout(() => {
      // Always persist locally too (nice for fast reloads / backend downtime).
      localStorage.setItem(columnWidthsStorageKey, JSON.stringify(widths));
      if (authToken) saveColumnWidthsMutation.mutate(widths);
    }, 400);
  };

  const getColumnWidthPx = (colId: string): number => columnWidths[colId] ?? defaultColumnWidthPx;
  const totalTableWidthPx = visibleColumns.reduce((sum, c) => sum + getColumnWidthPx(c.id), 0) + actionColumnWidthPx;

  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [textColumnFilters, setTextColumnFilters] = useState<Record<string, string>>({});

  type DateFilterMode = 'none' | 'range' | 'month' | 'year';
  type DateFilterState = {
    helpEnabled: boolean;
    mode: DateFilterMode;
    query?: string; // raw user input (free-text). Used even without help.
    from?: string;
    to?: string;
    month?: string; // YYYY-MM
    year?: string; // YYYY
  };

  const [dateColumnFilters, setDateColumnFilters] = useState<Record<string, DateFilterState>>({});
  const [dateQuickTextByColId, setDateQuickTextByColId] = useState<Record<string, string>>({});
  const [shipmentNumberListText, setShipmentNumberListText] = useState<string>('');

  type TimeColumnFilterState = { helpEnabled: boolean; value?: string };
  const [timeColumnFilters, setTimeColumnFilters] = useState<Record<string, TimeColumnFilterState>>({});

  const serverVisibleColumnsQuery = useQuery({
    queryKey: ['shipments-page-visible-columns'],
    queryFn: async () => {
      const { data } = await api.get<{ columns: string[] | null }>(
        '/user-preferences/shipments-page-visible-columns',
      );
      return data.columns;
    },
    enabled: !!authToken,
    retry: false,
  });

  const [serverPrefsLoaded, setServerPrefsLoaded] = useState(false);
  useEffect(() => {
    if (!serverVisibleColumnsQuery.isSuccess) return;
    setServerPrefsLoaded(true);

    const cols = serverVisibleColumnsQuery.data;
    if (!cols || cols.length === 0) return;

    const cleaned = cols.filter((id) => allowedColumnIdsSetRef.current.has(id));
    if (cleaned.length === 0) return;

    // Avoid unnecessary state updates.
    const same =
      cleaned.length === visibleColumnIdsRef.current.length &&
      cleaned.every((id, i) => id === visibleColumnIdsRef.current[i]);
    if (!same) setVisibleColumnIds(cleaned);
  }, [serverVisibleColumnsQuery.isSuccess, serverVisibleColumnsQuery.data]);

  const saveVisibleColumnsMutation = useMutation({
    mutationFn: async (columns: string[]) => {
      await api.put('/user-preferences/shipments-page-visible-columns', { columns });
    },
  });

  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!serverPrefsLoaded) return;
    const cols = visibleColumnIdsRef.current;
    if (cols.length === 0) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveVisibleColumnsMutation.mutate(cols);
    }, 400);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [serverPrefsLoaded, visibleColumnIds, saveVisibleColumnsMutation]);

  const activeTextColumnFilters = useMemo(
    () => Object.entries(textColumnFilters).filter(([, v]) => v.trim() !== ''),
    [textColumnFilters],
  );

  const shipmentNumberSet = useMemo(
    () => new Set(parseShipmentNumberList(shipmentNumberListText)),
    [shipmentNumberListText],
  );

  const filteredShipments = (() => {
    // Fast path: no filters at all
    const hasShipmentFilter = shipmentNumberSet.size > 0;
    const hasTextFilters = activeTextColumnFilters.length > 0;
    const dateFilterIds = ['loadingDate', 'deliveryDate'];
    const hasDateFilters = dateFilterIds.some((id) => {
      const filter = dateColumnFilters[id];
      const q = filter?.query?.trim();
      if (q) return true;
      if (!filter || filter.mode === 'none') return false;
      if (filter.mode === 'range') return !!filter.from?.trim() || !!filter.to?.trim();
      if (filter.mode === 'month') return !!filter.month?.trim();
      if (filter.mode === 'year') return !!filter.year?.trim();
      return false;
    });

    const hasTimeFilters = (['loadingTimeFrom', 'loadingTimeTo', 'deliveryTimeFrom', 'deliveryTimeTo'] as const).some(
      (id) => !!timeColumnFilters[id]?.value?.trim(),
    );

    if (!hasShipmentFilter && !hasTextFilters && !hasDateFilters && !hasTimeFilters) return baseShipments;

    const colById = new Map(columnDefs.map((c) => [c.id, c]));

    const getRowShipmentNumber = (r: ShipmentForEdit): string => String(r.shipment_number ?? r.shipmentNumber ?? '');
    const getRowDate = (r: ShipmentForEdit, dateColId: 'loadingDate' | 'deliveryDate'): string | null => {
      if (dateColId === 'loadingDate') return extractDateYYYYMMDD(r.loading_date ?? r.loadingDate ?? null);
      return extractDateYYYYMMDD(r.delivery_date ?? r.deliveryDate ?? null);
    };

    const applyDateFilter = (r: ShipmentForEdit, dateColId: 'loadingDate' | 'deliveryDate'): boolean => {
      const filter = dateColumnFilters[dateColId];
      if (!filter) return true;

      const query = filter.query?.trim().toLowerCase() ?? '';
      const structuredMode = filter.mode;

      // Free-text matching: allow matching any substring (e.g. "2026", "03", "2026-03", "20.03.2026").
      if (query) {
        const raw =
          dateColId === 'loadingDate' ? r.loading_date ?? r.loadingDate ?? null : r.delivery_date ?? r.deliveryDate ?? null;
        const normalized = extractDateYYYYMMDD(raw);
        const deFormatted = normalized ? new Date(normalized).toLocaleDateString('de-DE') : '';

        const rawStr = raw == null ? '' : String(raw);
        const haystack = [rawStr, normalized ?? '', deFormatted].join(' ').toLowerCase();
        const freeOk = haystack.includes(query);

        // If we also have structured constraints, prefer structured (so range/month/year works as expected).
        if (structuredMode !== 'none') {
          const structuredOk = (() => {
            const dateStr = getRowDate(r, dateColId);
            if (!dateStr) return false;

            if (structuredMode === 'range') {
              const from = filter.from?.trim() ? filter.from.trim() : undefined;
              const to = filter.to?.trim() ? filter.to.trim() : undefined;
              if (from && dateStr < from) return false;
              if (to && dateStr > to) return false;
              return true;
            }
            if (structuredMode === 'month') {
              const month = filter.month?.trim();
              if (!month) return true;
              return dateStr.startsWith(month);
            }
            if (structuredMode === 'year') {
              const year = filter.year?.trim();
              if (!year) return true;
              return dateStr.startsWith(year);
            }
            return true;
          })();

          return structuredOk;
        }

        return freeOk;
      }

      // No free-text query: fall back to structured mode only.
      if (structuredMode === 'none') return true;

      const dateStr = getRowDate(r, dateColId);
      if (!dateStr) return false;

      if (structuredMode === 'range') {
        const from = filter.from?.trim() ? filter.from.trim() : undefined;
        const to = filter.to?.trim() ? filter.to.trim() : undefined;
        if (from && dateStr < from) return false;
        if (to && dateStr > to) return false;
        return true;
      }
      if (structuredMode === 'month') {
        const month = filter.month?.trim();
        if (!month) return true;
        return dateStr.startsWith(month);
      }
      if (structuredMode === 'year') {
        const year = filter.year?.trim();
        if (!year) return true;
        return dateStr.startsWith(year);
      }

      return true;
    };

    const applyTimeFilterForSegment = (
      r: ShipmentForEdit,
      segment: 'loading' | 'delivery',
    ): boolean => {
      const fromId = segment === 'loading' ? 'loadingTimeFrom' : 'deliveryTimeFrom';
      const toId = segment === 'loading' ? 'loadingTimeTo' : 'deliveryTimeTo';

      const filterFrom = (timeColumnFilters[fromId]?.value ?? '').trim();
      const filterTo = (timeColumnFilters[toId]?.value ?? '').trim();

      if (!filterFrom && !filterTo) return true;

      const rowStartRaw =
        segment === 'loading'
          ? r.loading_time_from ?? r.loadingTimeFrom ?? null
          : r.delivery_time_from ?? r.deliveryTimeFrom ?? null;
      const rowEndRaw =
        segment === 'loading'
          ? r.loading_time_to ?? r.loadingTimeTo ?? null
          : r.delivery_time_to ?? r.deliveryTimeTo ?? null;

      const rowStart = extractTimeHHMM(rowStartRaw);
      const rowEnd = extractTimeHHMM(rowEndRaw) ?? rowStart;

      if (!rowStart || !rowEnd) return false;

      // Overlap check (inclusive):
      // - if the row ends before the filter starts => no overlap
      // - if the row starts after the filter ends => no overlap
      if (filterFrom && rowEnd < filterFrom) return false;
      if (filterTo && rowStart > filterTo) return false;
      return true;
    };

    return baseShipments.filter((row) => {
      const r = row as ShipmentForEdit;

      if (hasShipmentFilter) {
        const v = getRowShipmentNumber(r);
        if (!shipmentNumberSet.has(v)) return false;
      }

      if (hasTextFilters) {
        const ok = activeTextColumnFilters.every(([colId, needle]) => {
          const col = colById.get(colId);
          if (!col) return true;
          const hay = col.getFilterText(r).toLowerCase();
          return hay.includes(needle.toLowerCase());
        });
        if (!ok) return false;
      }

      if (hasDateFilters) {
        if (!applyDateFilter(r, 'loadingDate')) return false;
        if (!applyDateFilter(r, 'deliveryDate')) return false;
      }

      if (hasTimeFilters) {
        if (!applyTimeFilterForSegment(r, 'loading')) return false;
        if (!applyTimeFilterForSegment(r, 'delivery')) return false;
      }

      return true;
    });
  })();

  const [exporting, setExporting] = useState(false);

  const exportScopeLabel =
    listScope === 'open' ? 'nicht-disponiert' : listScope === 'archived' ? 'archiv' : 'alle';
  const handleExportXlsx = async () => {
    if (!filteredShipments.length) return;
    setExporting(true);
    try {
      const rows = filteredShipments.map((s) => {
        const row = s as ShipmentForEdit;
        const out: Record<string, unknown> = {};
        visibleColumns.forEach((col) => {
          out[col.label] = col.getExportValue(row);
        });
        return out;
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Sendungen');

      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      downloadXlsx(`sendungen-${exportScopeLabel}-${stamp}.xlsx`, wb);
    } finally {
      setExporting(false);
    }
  };

  type EditDraft = {
    transportType: string;
    customerRef: string;
    loadingAddressId: string;
    deliveryAddressId: string;
    loadingDate: string;
    loadingTimeFrom: string;
    loadingTimeTo: string;
    deliveryDate: string;
    deliveryTimeFrom: string;
    deliveryTimeTo: string;
    packageType: string;
    packageCount: string;
    weightKg: string;
    ldm: string;
    volumeM3: string;
    isHazmat: boolean;
    hazmatClass: string;
    hazmatUnNumber: string;
    hazmatPackingGroup: string;
    hazmatDescription: string;
    incoterm: string;
    freightPayer: string;
    comment: string;
    customerNote: string;
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  const openEdit = (s: ShipmentForEdit) => {
    setEditingId(s.id);
    setEditDraft({
      transportType: String(s.transport_type ?? s.transportType ?? ''),
      customerRef: String(s.customer_ref ?? s.customerRef ?? ''),
      loadingAddressId: String(
        s.loading_address_id ??
          s.loadingAddressId ??
          s.addresses_shipments_loading_address_idToaddresses?.id ??
          '',
      ),
      deliveryAddressId: String(
        s.delivery_address_id ??
          s.deliveryAddressId ??
          s.addresses_shipments_delivery_address_idToaddresses?.id ??
          '',
      ),
      loadingDate: toDateInputValue(s.loading_date ?? s.loadingDate ?? ''),
      loadingTimeFrom: toTimeInputValue(s.loading_time_from ?? s.loadingTimeFrom ?? ''),
      loadingTimeTo: toTimeInputValue(s.loading_time_to ?? s.loadingTimeTo ?? ''),
      deliveryDate: toDateInputValue(s.delivery_date ?? s.deliveryDate ?? ''),
      deliveryTimeFrom: toTimeInputValue(s.delivery_time_from ?? s.deliveryTimeFrom ?? ''),
      deliveryTimeTo: toTimeInputValue(s.delivery_time_to ?? s.deliveryTimeTo ?? ''),
      packageType: String(s.package_type ?? s.packageType ?? ''),
      packageCount: String(s.package_count ?? s.packageCount ?? ''),
      weightKg: String(s.weight_kg ?? s.weightKg ?? ''),
      ldm: String(s.ldm ?? ''),
      volumeM3: String(s.volume_m3 ?? s.volumeM3 ?? ''),
      isHazmat: Boolean(s.is_hazmat ?? s.isHazmat ?? false),
      hazmatClass: String(s.hazmat_class ?? s.hazmatClass ?? ''),
      hazmatUnNumber: String(s.hazmat_un_number ?? s.hazmatUnNumber ?? ''),
      hazmatPackingGroup: String(s.hazmat_packing_group ?? s.hazmatPackingGroup ?? ''),
      hazmatDescription: String(s.hazmat_description ?? s.hazmatDescription ?? ''),
      incoterm: String(s.incoterm ?? ''),
      freightPayer: String(s.freight_payer ?? s.freightPayer ?? ''),
      comment: String(s.comment ?? ''),
      customerNote: String(s.customer_note ?? s.customerNote ?? ''),
    });
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const updateMutation = useMutation({
    mutationFn: async (payload: { shipmentId: string; dto: Record<string, unknown> }) => {
      const { shipmentId, dto } = payload;
      await api.patch(`/shipments/${shipmentId}`, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      closeEdit();
    },
  });

  const editingShipment = useMemo(() => {
    if (!editingId) return null;
    const list = (shipments ?? []) as ShipmentForEdit[];
    return list.find((s) => s.id === editingId) ?? null;
  }, [editingId, shipments]);

  const handleSaveEdit = async () => {
    if (!editingShipment || !editDraft) return;

    const dto: Record<string, unknown> = {};
    const transportType = editDraft.transportType.trim();
    if (transportType) dto.transportType = transportType;
    const customerRef = editDraft.customerRef.trim();
    if (customerRef) dto.customerRef = customerRef;

    const loadingAddressId = editDraft.loadingAddressId.trim();
    if (loadingAddressId) dto.loadingAddressId = loadingAddressId;
    const deliveryAddressId = editDraft.deliveryAddressId.trim();
    if (deliveryAddressId) dto.deliveryAddressId = deliveryAddressId;

    if (editDraft.loadingDate) dto.loadingDate = editDraft.loadingDate;
    if (editDraft.loadingTimeFrom) dto.loadingTimeFrom = editDraft.loadingTimeFrom;
    if (editDraft.loadingTimeTo) dto.loadingTimeTo = editDraft.loadingTimeTo;

    if (editDraft.deliveryDate) dto.deliveryDate = editDraft.deliveryDate;
    if (editDraft.deliveryTimeFrom) dto.deliveryTimeFrom = editDraft.deliveryTimeFrom;
    if (editDraft.deliveryTimeTo) dto.deliveryTimeTo = editDraft.deliveryTimeTo;

    const packageType = editDraft.packageType.trim();
    if (packageType) dto.packageType = packageType;

    const packageCount = parseOptionalNumber(editDraft.packageCount);
    if (packageCount !== undefined) dto.packageCount = packageCount;

    const weightKg = parseOptionalNumber(editDraft.weightKg);
    if (weightKg !== undefined) dto.weightKg = weightKg;

    const ldm = parseOptionalNumber(editDraft.ldm);
    if (ldm !== undefined) dto.ldm = ldm;

    const volumeM3 = parseOptionalNumber(editDraft.volumeM3);
    if (volumeM3 !== undefined) dto.volumeM3 = volumeM3;

    dto.isHazmat = editDraft.isHazmat;
    if (editDraft.isHazmat) {
      const hazmatClass = editDraft.hazmatClass.trim();
      if (hazmatClass) dto.hazmatClass = hazmatClass;
      const hazmatUnNumber = editDraft.hazmatUnNumber.trim();
      if (hazmatUnNumber) dto.hazmatUnNumber = hazmatUnNumber;
      const hazmatPackingGroup = editDraft.hazmatPackingGroup.trim();
      if (hazmatPackingGroup) dto.hazmatPackingGroup = hazmatPackingGroup;
      const hazmatDescription = editDraft.hazmatDescription.trim();
      if (hazmatDescription) dto.hazmatDescription = hazmatDescription;
    }

    const incoterm = editDraft.incoterm.trim();
    if (incoterm) dto.incoterm = incoterm;

    const freightPayer = editDraft.freightPayer.trim();
    if (freightPayer) dto.freightPayer = freightPayer;

    const comment = editDraft.comment.trim();
    if (comment) dto.comment = comment;

    const customerNote = editDraft.customerNote.trim();
    if (customerNote) dto.customerNote = customerNote;

    await updateMutation.mutateAsync({ shipmentId: editingShipment.id, dto });
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] bg-white flex flex-col">
      <main className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sticky top-0 z-30 bg-white border-b border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Sendungen</h1>
            <div className="mt-2 inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setListScope('open')}
                className={`px-3 py-1.5 ${listScope === 'open' ? 'bg-[#1e40af] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Nicht disponiert
              </button>
              <button
                type="button"
                onClick={() => setListScope('archived')}
                className={`px-3 py-1.5 border-l border-gray-300 ${listScope === 'archived' ? 'bg-[#1e40af] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Abgeschlossene Touren
              </button>
              <button
                type="button"
                onClick={() => setListScope('all')}
                className={`px-3 py-1.5 border-l border-gray-300 ${listScope === 'all' ? 'bg-[#1e40af] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Alle
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <div
              className="text-xs text-gray-500 whitespace-nowrap max-w-[14rem]"
              title={visibleColumns.map((c) => c.label).join(', ')}
            >
              Sichtbar: <span className="text-gray-700 font-medium">{visibleColumns.length}</span> Felder ·
              Reihenfolge: ⠿ ziehen, speichern wie bisher (Benutzer-Icon)
            </div>
            <button
              onClick={handleExportXlsx}
              disabled={exporting || filteredShipments.length === 0}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-800 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? 'Export…' : 'Excel Export'}
            </button>
            <button
              onClick={() => setShowColumnChooser(true)}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-800 font-medium rounded-lg hover:bg-gray-50"
            >
              Spalten wählen
            </button>
            <Link
              to="/shipments/new"
              className="inline-flex items-center justify-center px-4 py-2 bg-[#1e40af] text-white font-medium rounded-lg hover:bg-[#1e3a8a] transition-colors"
            >
              Neue Sendung
            </Link>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
          </div>
        )}

        {isError && (
          <div
            className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700"
            role="alert"
          >
            {error instanceof Error ? error.message : 'Fehler beim Laden der Sendungen.'}
          </div>
        )}

        {!isLoading && !isError && (shipments?.length ?? 0) === 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
            Noch keine Sendungen erfasst.
          </div>
        )}

        {!isLoading && !isError && (shipments?.length ?? 0) > 0 && baseShipments.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900 text-sm">
            Für die gewählte Ansicht gibt es keine Sendungen.
          </div>
        )}

        {!isLoading && !isError && baseShipments.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto w-full">
              <table
                className="w-full table-fixed min-w-full divide-y divide-gray-200"
                style={{ width: totalTableWidthPx }}
              >
                <thead className="bg-gray-50">
                  <tr>
                    {visibleColumns.map((col) => (
                      <th
                        key={col.id}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative select-none"
                        style={{ width: getColumnWidthPx(col.id) }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromId =
                            draggingColumnId || e.dataTransfer.getData('text/plain');
                          if (!fromId || fromId === col.id) return;
                          setVisibleColumnIds((prev) => {
                            const i = prev.indexOf(fromId);
                            const j = prev.indexOf(col.id);
                            if (i < 0 || j < 0) return prev;
                            const next = [...prev];
                            next.splice(i, 1);
                            next.splice(j, 0, fromId);
                            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                            return next;
                          });
                          setDraggingColumnId(null);
                        }}
                      >
                        <span
                          draggable
                          role="button"
                          tabIndex={0}
                          onDragStart={(e) => {
                            setDraggingColumnId(col.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', col.id);
                          }}
                          onDragEnd={() => setDraggingColumnId(null)}
                          className="inline-block cursor-grab mr-1.5 text-gray-400 align-middle"
                          title="Spalte per Drag & Drop verschieben"
                        >
                          ⠿
                        </span>
                        <span>{col.label}</span>
                        <span
                          role="separator"
                          aria-label={`Spaltenbreite einstellen: ${col.label}`}
                          className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const startX = e.clientX;
                            const startWidth = getColumnWidthPx(col.id);
                            let lastWidth = startWidth;

                            document.body.style.userSelect = 'none';
                            document.body.style.cursor = 'col-resize';

                            const onMove = (ev: MouseEvent) => {
                              const delta = ev.clientX - startX;
                              const next = Math.max(90, Math.min(650, startWidth + delta));
                              lastWidth = next;
                              setColumnWidths((prev) => ({ ...prev, [col.id]: next }));
                            };
                            const onUp = () => {
                              document.removeEventListener('mousemove', onMove);
                              document.removeEventListener('mouseup', onUp);
                              document.body.style.userSelect = '';
                              document.body.style.cursor = '';
                              scheduleSaveColumnWidths({ ...columnWidthsRef.current, [col.id]: lastWidth });
                            };

                            document.addEventListener('mousemove', onMove);
                            document.addEventListener('mouseup', onUp);
                          }}
                        />
                      </th>
                    ))}
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                      style={{ width: actionColumnWidthPx }}
                    >
                      Aktion
                    </th>
                  </tr>
                  <tr>
                    {visibleColumns.map((col) => {
                      const w = getColumnWidthPx(col.id);

                      if (col.id === 'shipmentNumber') {
                        const nums = parseShipmentNumberList(shipmentNumberListText);
                        const active = nums.length > 0;
                        return (
                          <th key={col.id} className="px-4 py-2 align-top min-h-[72px]" style={{ width: w }}>
                            <textarea
                              value={shipmentNumberListText}
                              onChange={(e) => setShipmentNumberListText(e.target.value)}
                              className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm"
                              rows={1}
                              placeholder="Nr. einfügen (1/Zeile oder Liste)"
                            />
                            {active && (
                              <div
                                className="text-[10px] text-gray-500 mt-1 truncate"
                                title={`Aktiv: ${nums.length} Nr.`}
                              >
                                Aktiv
                              </div>
                            )}
                          </th>
                        );
                      }

                      if (col.id === 'loadingDate' || col.id === 'deliveryDate') {
                        const dateColId = col.id;
                        const filter =
                          dateColumnFilters[dateColId] ?? ({ helpEnabled: false, mode: 'none' as const } satisfies DateFilterState);
                        const isHelpEnabled = filter.helpEnabled;
                        const hasValues =
                          filter.mode === 'range'
                            ? !!filter.from?.trim() || !!filter.to?.trim()
                            : filter.mode === 'month'
                              ? !!filter.month?.trim()
                              : filter.mode === 'year'
                                ? !!filter.year?.trim()
                                : false;
                        const summary =
                          filter.mode === 'range'
                            ? `Aktiv: ${filter.from ?? '…'} bis ${filter.to ?? '…'}`
                            : filter.mode === 'month'
                              ? `Aktiv: ${filter.month ?? '…'}`
                              : filter.mode === 'year'
                                ? `Aktiv: ${filter.year ?? '…'}`
                                : '';

                        return (
                          <th key={col.id} className="px-4 py-2 align-top min-h-[72px]" style={{ width: w }}>
                            <div className="space-y-1">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={
                                    dateQuickTextByColId[dateColId] ??
                                    (filter.mode === 'range'
                                      ? filter.from ?? ''
                                      : filter.mode === 'month'
                                        ? filter.month ?? ''
                                        : filter.mode === 'year'
                                          ? filter.year ?? ''
                                          : '')
                                  }
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setDateQuickTextByColId((prev) => ({ ...prev, [dateColId]: next }));
                                    const trimmed = next.trim();
                                    setDateColumnFilters((prev) => {
                                      if (!trimmed) {
                                        return { ...prev, [dateColId]: { mode: 'none', helpEnabled: false, query: '' } };
                                      }

                                      const ymdIso = /^(\d{4})-(\d{2})-(\d{2})$/;
                                      const dmyDe = /^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/; // DD.MM.YYYY
                                      const ymIso = /^(\d{4})-(\d{2})$/;
                                      const yearRe = /^\d{4}$/;

                                      const isoMatch = trimmed.match(ymdIso);
                                      if (isoMatch) {
                                        const [, yyyy, mm, dd] = isoMatch;
                                        const ymd = `${yyyy}-${mm}-${dd}`;
                                        return {
                                          ...prev,
                                          [dateColId]: { mode: 'range', helpEnabled: false, from: ymd, to: ymd, query: trimmed },
                                        };
                                      }

                                      const deMatch = trimmed.match(dmyDe);
                                      if (deMatch) {
                                        const [, dd, mm, yyyy] = deMatch;
                                        const ymd = `${yyyy}-${mm}-${dd}`;
                                        return {
                                          ...prev,
                                          [dateColId]: { mode: 'range', helpEnabled: false, from: ymd, to: ymd, query: trimmed },
                                        };
                                      }

                                      const ymIsoMatch = trimmed.match(ymIso);
                                      if (ymIsoMatch) {
                                        const [, yyyy, mm] = ymIsoMatch;
                                        return {
                                          ...prev,
                                          [dateColId]: {
                                            mode: 'month',
                                            helpEnabled: false,
                                            month: `${yyyy}-${mm}`,
                                            query: trimmed,
                                          },
                                        };
                                      }

                                      if (yearRe.test(trimmed)) {
                                        return {
                                          ...prev,
                                          [dateColId]: { mode: 'year', helpEnabled: false, year: trimmed, query: trimmed },
                                        };
                                      }

                                      // Keep filter inert for invalid/partial input.
                                      return { ...prev, [dateColId]: { mode: 'none', helpEnabled: false, query: trimmed } };
                                    });
                                  }}
                                  placeholder=""
                                  className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm pr-9"
                                />

                                <label className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={isHelpEnabled}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setDateColumnFilters((prev) => {
                                        // When closing help, normalize everything back to range(from..to)
                                        // so the single-value date input stays consistent.
                                        if (!checked) {
                                          if (filter.mode === 'month' && filter.month) {
                                            const from = `${filter.month}-01`;
                                            const to = `${filter.month}-31`;
                                            return { ...prev, [dateColId]: { mode: 'range', helpEnabled: false, from, to, query: filter.query } };
                                          }
                                          if (filter.mode === 'year' && filter.year) {
                                            const from = `${filter.year}-01-01`;
                                            const to = `${filter.year}-12-31`;
                                            return { ...prev, [dateColId]: { mode: 'range', helpEnabled: false, from, to, query: filter.query } };
                                          }
                                          if (filter.mode === 'range') {
                                            return { ...prev, [dateColId]: { ...filter, helpEnabled: false } };
                                          }
                                          return { ...prev, [dateColId]: { mode: 'none', helpEnabled: false, query: filter.query } };
                                        }

                                        // Opening help: ensure we have a usable mode.
                                        if (filter.mode === 'none') {
                                          return { ...prev, [dateColId]: { mode: 'range', helpEnabled: true, from: undefined, to: undefined, query: filter.query } };
                                        }
                                        return { ...prev, [dateColId]: { ...filter, helpEnabled: true } };
                                      });
                                    }}
                                    aria-label={`Wert-Hilfe für ${col.label} öffnen`}
                                    title={`Wert-Hilfe für ${col.label} öffnen`}
                                  />
                                </label>
                              </div>

                              {hasValues && <div className="text-[10px] text-gray-500 break-all">{summary}</div>}

                              {isHelpEnabled && (
                                <div className="space-y-1">
                                  <select
                                    value={filter.mode === 'none' ? 'range' : filter.mode}
                                    onChange={(e) => {
                                      const nextMode = e.target.value as Exclude<DateFilterMode, 'none'>;
                                      setDateColumnFilters((prev) => {
                                        if (nextMode === 'range') {
                                          const from =
                                            filter.mode === 'month' && filter.month
                                              ? `${filter.month}-01`
                                              : filter.mode === 'year' && filter.year
                                                ? `${filter.year}-01-01`
                                                : filter.from;
                                          const to =
                                            filter.mode === 'month' && filter.month
                                              ? `${filter.month}-31`
                                              : filter.mode === 'year' && filter.year
                                                ? `${filter.year}-12-31`
                                                : filter.to ?? filter.from;
                                          return { ...prev, [dateColId]: { ...filter, helpEnabled: true, mode: 'range', from, to } };
                                        }
                                        if (nextMode === 'month') {
                                          const month =
                                            filter.mode === 'range' && filter.from
                                              ? filter.from.slice(0, 7)
                                              : filter.mode === 'year' && filter.year
                                                ? filter.year // fallback, will be overwritten by user input
                                                : filter.month;
                                          return { ...prev, [dateColId]: { ...filter, helpEnabled: true, mode: 'month', month } };
                                        }
                                        const year =
                                          filter.mode === 'range' && filter.from ? filter.from.slice(0, 4) : filter.year;
                                        return { ...prev, [dateColId]: { ...filter, helpEnabled: true, mode: 'year', year } };
                                      });
                                    }}
                                    className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm"
                                  >
                                    <option value="range">Zeitraum</option>
                                    <option value="month">Monat</option>
                                    <option value="year">Jahr</option>
                                  </select>

                                  {filter.mode === 'range' && (
                                    <div className="space-y-1">
                                      <input
                                        type="text"
                                        value={filter.from ?? ''}
                                        onChange={(e) =>
                                          setDateColumnFilters((prev) => ({
                                            ...prev,
                                            [dateColId]: { ...filter, mode: 'range', helpEnabled: true, from: e.target.value },
                                          }))
                                        }
                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm"
                                        placeholder="YYYY-MM-DD"
                                      />
                                      <input
                                        type="text"
                                        value={filter.to ?? ''}
                                        onChange={(e) =>
                                          setDateColumnFilters((prev) => ({
                                            ...prev,
                                            [dateColId]: { ...filter, mode: 'range', helpEnabled: true, to: e.target.value },
                                          }))
                                        }
                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm"
                                        placeholder="YYYY-MM-DD"
                                      />
                                    </div>
                                  )}

                                  {filter.mode === 'month' && (
                                    <div>
                                      <input
                                        type="text"
                                        value={filter.month ?? ''}
                                        onChange={(e) =>
                                          setDateColumnFilters((prev) => ({
                                            ...prev,
                                            [dateColId]: { ...filter, mode: 'month', helpEnabled: true, month: e.target.value },
                                          }))
                                        }
                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm"
                                        placeholder="YYYY-MM"
                                      />
                                    </div>
                                  )}

                                  {filter.mode === 'year' && (
                                    <div>
                                      <input
                                        type="text"
                                        value={filter.year ?? ''}
                                        onChange={(e) =>
                                          setDateColumnFilters((prev) => ({
                                            ...prev,
                                            [dateColId]: { ...filter, mode: 'year', helpEnabled: true, year: e.target.value },
                                          }))
                                        }
                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm"
                                        placeholder="YYYY"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </th>
                        );
                      }

                      if (
                        col.id === 'loadingTimeFrom' ||
                        col.id === 'loadingTimeTo' ||
                        col.id === 'deliveryTimeFrom' ||
                        col.id === 'deliveryTimeTo'
                      ) {
                        const timeColId = col.id;
                        const state =
                          timeColumnFilters[timeColId] ?? ({ helpEnabled: false } satisfies TimeColumnFilterState);

                        const summary = state.value?.trim() ? `Aktiv: ${state.value}` : '';

                        return (
                          <th key={col.id} className="px-4 py-2 align-top min-h-[72px]" style={{ width: w }}>
                            <div className="relative">
                              <input
                                type="time"
                                value={state.value ?? ''}
                                onChange={(e) =>
                                      setTimeColumnFilters((prev) => {
                                        const current = prev[timeColId] ?? state;
                                        return {
                                          ...prev,
                                          [timeColId]: { ...current, value: e.target.value },
                                        };
                                      })
                                }
                                    className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm pr-9"
                              />

                              <label className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                                <input
                                  type="checkbox"
                                  checked={state.helpEnabled}
                                  aria-label={`Wert-Hilfe für ${col.label} aktivieren`}
                                  title={`Wert-Hilfe für ${col.label} aktivieren`}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setTimeColumnFilters((prev) => {
                                      const current = prev[timeColId] ?? state;
                                      return {
                                        ...prev,
                                        [timeColId]: { ...current, helpEnabled: checked },
                                      };
                                    });
                                  }}
                                />
                              </label>
                            </div>

                            {summary && (
                              <div className="text-[10px] text-gray-500 mt-1 truncate" title={summary}>
                                {summary}
                              </div>
                            )}
                          </th>
                        );
                      }

                      const val = textColumnFilters[col.id] ?? '';
                      return (
                        <th key={col.id} className="px-4 py-2 align-top min-h-[72px]" style={{ width: w }}>
                          <input
                            value={val}
                            onChange={(e) =>
                              setTextColumnFilters((prev) => ({
                                ...prev,
                                [col.id]: e.target.value,
                              }))
                            }
                            className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm"
                            placeholder=""
                          />
                          {val.trim() !== '' && (
                            <div className="text-[10px] text-gray-500 mt-1 truncate" title={`Aktiv: ${val}`}>
                              Aktiv
                            </div>
                          )}
                        </th>
                      );
                    })}
                    <th
                      className="px-4 py-2 text-right"
                      style={{ width: actionColumnWidthPx }}
                    >
                      <button
                        className="text-xs text-gray-600 hover:text-gray-900"
                        onClick={() => {
                          setTextColumnFilters({});
                          setDateColumnFilters({});
                        setDateQuickTextByColId({});
                          setTimeColumnFilters({});
                          setShipmentNumberListText('');
                        }}
                      >
                        Reset
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredShipments.map((s) => {
                    const row = s as ShipmentForEdit;
                    return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      {visibleColumns.map((col) => {
                        if (col.id === 'shipmentNumber') {
                          const num = String(row.shipment_number ?? row.shipmentNumber ?? '');
                          const hasLock = !!(row as ShipmentForEdit).has_active_lock;
                          const lt = (row as ShipmentForEdit).lock_types?.split(',')[0]?.trim();
                          return (
                            <td key={col.id} className="px-4 py-3" style={{ width: getColumnWidthPx(col.id) }}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-gray-900">{num || '–'}</span>
                                {hasLock && lt && (
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5"
                                    onClick={() => setLockModalShipmentId(row.id)}
                                  >
                                    🔒 {lt}
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (col.id === 'status') {
                          return (
                            <td key={col.id} className="px-4 py-3" style={{ width: getColumnWidthPx(col.id) }}>
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadgeClass(row.status)}`}
                              >
                                {row.status}
                              </span>
                            </td>
                          );
                        }

                        if (col.id === 'freightRevenue') {
                          const revenue = row.freight_revenue ?? row.freightRevenue ?? null;
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-3 text-sm text-gray-600"
                              style={{ width: getColumnWidthPx(col.id) }}
                            >
                              {revenue != null ? formatCurrency(Number(revenue)) : '–'}
                            </td>
                          );
                        }

                        if (col.id === 'costPreCarriageShare' || col.id === 'costMainCarriageShare') {
                          const raw =
                            col.id === 'costPreCarriageShare'
                              ? row.pre_carriage_cost
                              : row.main_carriage_cost;
                          const n = raw != null ? Number(raw) : NaN;
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-3 text-sm text-gray-600"
                              style={{ width: getColumnWidthPx(col.id) }}
                            >
                              {Number.isFinite(n) ? formatCurrency(n) : '–'}
                            </td>
                          );
                        }

                        if (col.id === 'routingRelations') {
                          const t = getRoutingRelationsText(row);
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-3 text-sm text-gray-600 whitespace-pre-line"
                              style={{ width: getColumnWidthPx(col.id) }}
                            >
                              {t || '–'}
                            </td>
                          );
                        }

                        if (col.id === 'dbPercent') {
                          return (
                            <td key={col.id} className="px-4 py-3 text-sm text-gray-600" style={{ width: getColumnWidthPx(col.id) }}>
                              {formatDb(row)}
                            </td>
                          );
                        }

                        if (col.id === 'loadingDate') {
                          return (
                            <td key={col.id} className="px-4 py-3 text-sm text-gray-600" style={{ width: getColumnWidthPx(col.id) }}>
                              {formatLoadingDate(row)}
                            </td>
                          );
                        }

                        if (col.id === 'deliveryDate') {
                          return (
                            <td key={col.id} className="px-4 py-3 text-sm text-gray-600" style={{ width: getColumnWidthPx(col.id) }}>
                              {formatOptionalDate((row.delivery_date ?? row.deliveryDate) ?? null)}
                            </td>
                          );
                        }

                        if (col.id === 'isHazmat') {
                          const v = row.is_hazmat ?? row.isHazmat ?? false;
                          return (
                            <td key={col.id} className="px-4 py-3 text-sm text-gray-600" style={{ width: getColumnWidthPx(col.id) }}>
                              {v ? 'Ja' : 'Nein'}
                            </td>
                          );
                        }

                        const raw = col.getExportValue(row);
                        const text =
                          raw === null || raw === undefined || raw === ''
                            ? '–'
                            : typeof raw === 'boolean'
                              ? raw
                                ? 'Ja'
                                : 'Nein'
                              : String(raw);

                        return (
                          <td
                            key={col.id}
                            className="px-4 py-3 text-sm text-gray-600"
                            style={{ width: getColumnWidthPx(col.id) }}
                          >
                            {text}
                          </td>
                        );
                      })}
                      <td
                        className="px-4 py-3 text-right text-sm"
                        style={{ width: actionColumnWidthPx }}
                      >
                        {row.tour_id == null && row.tourId == null ? (
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="text-[#1e40af] hover:text-[#1e3a8a] font-medium"
                          >
                            Bearbeiten
                          </button>
                        ) : (
                          <span className="text-gray-400">–</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {lockModalShipmentId && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-4">
              <div className="flex justify-between items-start gap-2">
                <h3 className="text-lg font-semibold">Aktive Sperren</h3>
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-800"
                  onClick={() => setLockModalShipmentId(null)}
                >
                  ✕
                </button>
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {lockModalLocks.length === 0 && <li className="text-gray-500">Keine aktiven Sperren.</li>}
                {lockModalLocks.map((l) => (
                  <li key={l.id} className="border rounded-lg p-2">
                    <div className="font-medium text-red-700">{l.lock_type}</div>
                    {l.reason && <div className="text-gray-700">{l.reason}</div>}
                    <div className="text-xs text-gray-500">{l.locked_at ? new Date(l.locked_at).toLocaleString('de-DE') : ''}</div>
                    <button
                      type="button"
                      className="mt-2 text-sm text-[#1e40af] hover:underline"
                      onClick={async () => {
                        const note = window.prompt('Auflösungsnotiz (Pflicht):');
                        if (!note?.trim()) return;
                        await api.patch(`/status/locks/${l.id}/resolve`, { resolutionNotes: note });
                        await queryClient.invalidateQueries({ queryKey: ['shipments'] });
                        await queryClient.invalidateQueries({ queryKey: ['status'] });
                        setLockModalShipmentId(null);
                      }}
                    >
                      Sperre aufheben
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {showColumnChooser && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-gray-900">Spalten auswählen</div>
                  <div className="text-sm text-gray-600 mt-1">Wähle aus, welche Felder in der Übersicht angezeigt werden.</div>
                </div>
                <button
                  onClick={() => setShowColumnChooser(false)}
                  className="text-gray-600 hover:text-gray-900 px-2 py-1"
                  aria-label="Schließen"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 max-h-[70vh] overflow-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {columnDefs.map((col) => {
                    const checked = visibleColumnIds.includes(col.id);
                    return (
                      <label key={col.id} className="flex items-center gap-3 text-sm px-2 py-1 rounded-md hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const nextSet = new Set(visibleColumnIds);
                            if (nextSet.has(col.id)) nextSet.delete(col.id);
                            else nextSet.add(col.id);
                            const next = columnDefs.map((c) => c.id).filter((id) => nextSet.has(id));
                            if (next.length === 0) return; // immer mindestens eine Spalte anzeigen
                            setVisibleColumnIds(next);
                            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                          }}
                        />
                        <span className="text-gray-800">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setVisibleColumnIds(defaultVisibleColumnIds);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultVisibleColumnIds));
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 text-sm"
                >
                  Alle
                </button>
                <button
                  onClick={() => setShowColumnChooser(false)}
                  className="px-4 py-2 rounded-lg bg-[#1e40af] text-white font-medium hover:bg-[#1e3a8a] text-sm"
                >
                  Fertig
                </button>
              </div>
            </div>
          </div>
        )}

        {editingShipment && editDraft && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-full overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    Sendung bearbeiten
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {editingShipment.shipment_number ?? editingShipment.shipmentNumber ?? '–'} · nur nicht disponierte Sendungen
                  </div>
                </div>
                <button
                  onClick={closeEdit}
                  className="text-gray-600 hover:text-gray-900 px-2 py-1"
                  aria-label="Schließen"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 max-h-[75vh] overflow-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Transporttyp</span>
                    <input
                      value={editDraft.transportType}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, transportType: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Kundenreferenz</span>
                    <input
                      value={editDraft.customerRef}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, customerRef: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Ladeadresse ID</span>
                    <input
                      value={editDraft.loadingAddressId}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, loadingAddressId: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Entladeadresse ID</span>
                    <input
                      value={editDraft.deliveryAddressId}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, deliveryAddressId: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Ladedatum</span>
                    <input
                      type="date"
                      value={editDraft.loadingDate}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, loadingDate: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Entladedatum</span>
                    <input
                      type="date"
                      value={editDraft.deliveryDate}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, deliveryDate: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Ladezeit von</span>
                    <input
                      type="time"
                      value={editDraft.loadingTimeFrom}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, loadingTimeFrom: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Ladezeit bis</span>
                    <input
                      type="time"
                      value={editDraft.loadingTimeTo}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, loadingTimeTo: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Entladezeit von</span>
                    <input
                      type="time"
                      value={editDraft.deliveryTimeFrom}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, deliveryTimeFrom: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Entladezeit bis</span>
                    <input
                      type="time"
                      value={editDraft.deliveryTimeTo}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, deliveryTimeTo: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Pakettyp</span>
                    <input
                      value={editDraft.packageType}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, packageType: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Paketanzahl</span>
                    <input
                      inputMode="decimal"
                      value={editDraft.packageCount}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, packageCount: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Gewicht (kg)</span>
                    <input
                      inputMode="decimal"
                      value={editDraft.weightKg}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, weightKg: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">LDM</span>
                    <input
                      inputMode="decimal"
                      value={editDraft.ldm}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, ldm: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Volumen (m³)</span>
                    <input
                      inputMode="decimal"
                      value={editDraft.volumeM3}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, volumeM3: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block sm:col-span-2 flex items-center gap-3 pt-1">
                    <input
                      type="checkbox"
                      checked={editDraft.isHazmat}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, isHazmat: e.target.checked } : v))}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium text-gray-700">Gefahrgut</span>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Klasse</span>
                    <input
                      value={editDraft.hazmatClass}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, hazmatClass: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">UN-Nummer</span>
                    <input
                      value={editDraft.hazmatUnNumber}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, hazmatUnNumber: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Packing Group</span>
                    <input
                      value={editDraft.hazmatPackingGroup}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, hazmatPackingGroup: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-gray-700">Beschreibung</span>
                    <textarea
                      value={editDraft.hazmatDescription}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, hazmatDescription: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                      rows={3}
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-gray-700">Incoterm</span>
                    <input
                      value={editDraft.incoterm}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, incoterm: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-gray-700">Frachtzahler</span>
                    <input
                      value={editDraft.freightPayer}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, freightPayer: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-gray-700">Kommentar</span>
                    <textarea
                      value={editDraft.comment}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, comment: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                      rows={3}
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-gray-700">Kunden-Notiz</span>
                    <textarea
                      value={editDraft.customerNote}
                      onChange={(e) => setEditDraft((v) => (v ? { ...v, customerNote: e.target.value } : v))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                      rows={3}
                    />
                  </label>
                </div>
              </div>

              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  onClick={closeEdit}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 text-sm"
                  disabled={updateMutation.isPending}
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 rounded-lg bg-[#1e40af] text-white font-medium hover:bg-[#1e3a8a] text-sm disabled:opacity-50"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

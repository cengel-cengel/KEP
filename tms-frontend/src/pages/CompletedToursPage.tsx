import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { api } from '../lib/api';

type TourShipment = {
  id: string;
  shipment_number: string;
  status: string;
  tour_position?: number | null;
  freight_revenue?: unknown;
  pre_carriage_cost?: unknown;
  main_carriage_cost?: unknown;
  inbound_delivery_type?: string | null;
  outbound_delivery_type?: string | null;
  customers?: { name?: string | null } | null;
  business_partner?: { name?: string | null; partner_number?: string | null } | null;
  addresses_shipments_delivery_address_idToaddresses?: {
    country_code?: string | null;
    zip?: string | null;
    city?: string | null;
  } | null;
  inbound_routing?: { rule_name?: string | null; delivery_type?: string | null } | null;
  outbound_routing?: { rule_name?: string | null; delivery_type?: string | null } | null;
  pre_carriage_shipments?: Array<{
    pre_carriage_tours?: {
      id: string;
      tour_date?: string;
      total_cost?: unknown;
      status?: string | null;
    } | null;
  }>;
};

type CompletedTour = {
  id: string;
  tour_number: string;
  tour_date: string;
  status: string;
  closed_at?: string | null;
  completed_at?: string | null;
  total_revenue?: unknown;
  total_ldm?: unknown;
  total_weight_kg?: unknown;
  subcontractor_cost?: unknown;
  contribution_margin?: unknown;
  cm_percent?: unknown;
  vehicle_plate?: string | null;
  driver_name?: string | null;
  subcontractors?: { id?: string; name?: string | null } | null;
  shipments: TourShipment[];
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDate(raw?: string | null) {
  if (!raw) return '–';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString('de-DE');
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function receiverLine(s: TourShipment): string {
  const a = s.addresses_shipments_delivery_address_idToaddresses;
  if (!a) return '–';
  return [a.country_code, a.zip, a.city].filter(Boolean).join(' ');
}

function preCarriageLine(s: TourShipment): string {
  const pcs = s.pre_carriage_shipments ?? [];
  if (!pcs.length) return '–';
  return pcs
    .map((p) => {
      const t = p.pre_carriage_tours;
      if (!t) return '–';
      return `Vorlauf ${formatDate(t.tour_date)} · ${formatCurrency(num(t.total_cost))}`;
    })
    .join(' | ');
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): string | null {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

function customerLine(s: TourShipment): string {
  if (s.customers?.name) return s.customers.name;
  if (s.business_partner) {
    return `[BP] ${s.business_partner.name ?? s.business_partner.partner_number ?? ''}`.trim();
  }
  return '';
}

export default function CompletedToursPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tours', 'completed-archive'],
    queryFn: async () => {
      const { data: rows } = await api.get<CompletedTour[]>('/tours/completed-archive/list');
      return rows;
    },
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [filterTourText, setFilterTourText] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSubId, setFilterSubId] = useState('');

  const subcontractorOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of data ?? []) {
      const id = t.subcontractors?.id;
      const name = t.subcontractors?.name;
      if (id && name) m.set(id, name);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'));
  }, [data]);

  const filteredTours = useMemo(() => {
    const rows = data ?? [];
    const qTour = filterTourText.trim().toLowerCase();
    const from = filterDateFrom.trim() ? parseYmd(filterDateFrom) : null;
    const to = filterDateTo.trim() ? parseYmd(filterDateTo) : null;

    return rows.filter((t) => {
      if (qTour && !t.tour_number.toLowerCase().includes(qTour)) return false;
      if (filterSubId && t.subcontractors?.id !== filterSubId) return false;
      const td = t.tour_date ? toYmd(new Date(t.tour_date)) : '';
      if (from && td && td < from) return false;
      if (to && td && td > to) return false;
      return true;
    });
  }, [data, filterTourText, filterDateFrom, filterDateTo, filterSubId]);

  const handleExportXlsx = () => {
    if (!filteredTours.length) return;
    const flat: Record<string, unknown>[] = [];
    for (const t of filteredTours) {
      for (const s of t.shipments) {
        flat.push({
          Tour: t.tour_number,
          TourDatum: formatDate(t.tour_date),
          TourStatus: t.status,
          Subunternehmer: t.subcontractors?.name ?? '',
          Sendung: s.shipment_number,
          SendungStatus: s.status,
          Pos: s.tour_position ?? '',
          Kunde: customerLine(s),
          Empfang: receiverLine(s),
          RelationE: s.inbound_routing?.delivery_type ?? s.inbound_delivery_type ?? '',
          RelationA: s.outbound_routing?.delivery_type ?? s.outbound_delivery_type ?? '',
          Vorlauf: preCarriageLine(s),
          Erlös: num(s.freight_revenue),
          KostenVorlauf: num(s.pre_carriage_cost),
          KostenHauptlauf: num(s.main_carriage_cost),
        });
      }
    }

    const summary = filteredTours.map((t) => ({
      Tour: t.tour_number,
      Datum: formatDate(t.tour_date),
      Status: t.status,
      Sub: t.subcontractors?.name ?? '',
      Sendungen: t.shipments.length,
      LDM: num(t.total_ldm),
      Erlös: num(t.total_revenue),
      Frachtkosten: num(t.subcontractor_cost),
      DB: num(t.contribution_margin),
      DBpct: num(t.cm_percent),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), 'Sendungen');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Touren');
    const stamp = toYmd(new Date());
    XLSX.writeFile(wb, `touren-archiv-${stamp}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Touren (abgeschlossen)</h1>
        <p className="text-sm text-gray-600 mb-4">
          Übersicht aller Touren mit Status <span className="font-medium">closed</span> oder{' '}
          <span className="font-medium">completed</span> inkl. zugeordneter Sendungen.
        </p>

        {!isLoading && !isError && (data?.length ?? 0) > 0 && (
          <div className="mb-6 flex flex-col lg:flex-row lg:flex-wrap gap-3 lg:items-end rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Tour-Nr. enthält</label>
              <input
                value={filterTourText}
                onChange={(e) => setFilterTourText(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm min-w-[10rem]"
                placeholder=""
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Tour-Datum von</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Tour-Datum bis</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[12rem]">
              <label className="text-xs font-medium text-gray-600">Subunternehmer</label>
              <select
                value={filterSubId}
                onChange={(e) => setFilterSubId(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Alle</option>
                {subcontractorOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setFilterTourText('');
                setFilterDateFrom('');
                setFilterDateTo('');
                setFilterSubId('');
              }}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-800 hover:bg-white self-start lg:self-end"
            >
              Filter zurücksetzen
            </button>
            <button
              type="button"
              onClick={handleExportXlsx}
              disabled={filteredTours.length === 0}
              className="px-3 py-2 rounded-lg bg-[#1e40af] text-white text-sm hover:bg-[#1e3a8a] disabled:opacity-50 self-start lg:self-end lg:ml-auto"
            >
              Excel exportieren ({filteredTours.length} Touren)
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
          </div>
        )}

        {isError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700">
            {error instanceof Error ? error.message : 'Fehler beim Laden.'}
          </div>
        )}

        {!isLoading && !isError && (data?.length ?? 0) === 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
            Keine abgeschlossenen Touren vorhanden.
          </div>
        )}

        {!isLoading && !isError && (data?.length ?? 0) > 0 && filteredTours.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900 text-sm">
            Keine Touren passen zum aktuellen Filter.
          </div>
        )}

        {!isLoading && !isError && filteredTours.length > 0 && (
          <div className="space-y-3">
            {filteredTours.map((t) => {
              const expanded = openId === t.id;
              return (
                <div
                  key={t.id}
                  className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(expanded ? null : t.id)}
                    className="w-full text-left px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-gray-50 hover:bg-gray-100 border-b border-gray-100"
                  >
                    <div>
                      <div className="font-semibold text-gray-900">{t.tour_number}</div>
                      <div className="text-xs text-gray-600">
                        {formatDate(t.tour_date)} · Status: {t.status}
                        {t.closed_at && ` · Geschlossen: ${formatDate(t.closed_at)}`}
                        {t.completed_at && ` · Erledigt: ${formatDate(t.completed_at)}`}
                      </div>
                    </div>
                    <div className="text-sm text-gray-700 flex flex-wrap gap-4">
                      <span>
                        Sendungen: <strong>{t.shipments.length}</strong>
                      </span>
                      <span>LDM: {num(t.total_ldm).toFixed(2)}</span>
                      <span>{formatCurrency(num(t.total_revenue))} Erlös</span>
                      <span>{formatCurrency(num(t.subcontractor_cost))} Frachtkosten</span>
                      <span className="text-[#1e40af]">{expanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  <div className="px-4 py-2 text-xs text-gray-600 grid sm:grid-cols-2 gap-1">
                    <div>
                      Subunternehmer: {t.subcontractors?.name ?? '–'} · Fahrzeug:{' '}
                      {t.vehicle_plate ?? '–'} · Fahrer: {t.driver_name ?? '–'}
                    </div>
                    <div>
                      DB: {formatCurrency(num(t.contribution_margin))} (
                      {num(t.cm_percent).toFixed(1)}%)
                    </div>
                  </div>

                  {expanded && (
                    <div className="overflow-x-auto border-t border-gray-100">
                      <table className="min-w-full text-sm">
                        <thead className="bg-white text-gray-500 text-xs uppercase">
                          <tr>
                            <th className="px-3 py-2 text-left">Pos.</th>
                            <th className="px-3 py-2 text-left">Sendung</th>
                            <th className="px-3 py-2 text-left">Status</th>
                            <th className="px-3 py-2 text-left">Kunde / BP</th>
                            <th className="px-3 py-2 text-left">Empfang</th>
                            <th className="px-3 py-2 text-left">Relation E/A</th>
                            <th className="px-3 py-2 text-left">Vorlauf</th>
                            <th className="px-3 py-2 text-right">Erlös</th>
                            <th className="px-3 py-2 text-right">Kosten V/H</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {t.shipments.map((s) => (
                            <tr key={s.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-600">{s.tour_position ?? '–'}</td>
                              <td className="px-3 py-2 font-medium text-gray-900">
                                {s.shipment_number}
                              </td>
                              <td className="px-3 py-2">{s.status}</td>
                              <td className="px-3 py-2 text-gray-700">
                                {s.customers?.name ??
                                  (s.business_partner
                                    ? `[BP] ${s.business_partner.name ?? s.business_partner.partner_number}`
                                    : '–')}
                              </td>
                              <td className="px-3 py-2 text-gray-700">{receiverLine(s)}</td>
                              <td className="px-3 py-2 text-gray-700 text-xs">
                                E: {s.inbound_routing?.delivery_type ?? s.inbound_delivery_type ?? '–'} ·
                                A: {s.outbound_routing?.delivery_type ?? s.outbound_delivery_type ?? '–'}
                                {(s.inbound_routing?.rule_name || s.outbound_routing?.rule_name) && (
                                  <div className="text-gray-500 mt-0.5">
                                    {s.inbound_routing?.rule_name && (
                                      <span>{s.inbound_routing.rule_name}</span>
                                    )}
                                    {s.outbound_routing?.rule_name && (
                                      <span>
                                        {s.inbound_routing?.rule_name ? ' · ' : ''}
                                        {s.outbound_routing.rule_name}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-700">{preCarriageLine(s)}</td>
                              <td className="px-3 py-2 text-right">
                                {formatCurrency(num(s.freight_revenue))}
                              </td>
                              <td className="px-3 py-2 text-right text-xs">
                                {formatCurrency(num(s.pre_carriage_cost))} /{' '}
                                {formatCurrency(num(s.main_carriage_cost))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { ArrowLeft, List, Map as MapIcon, X, Power } from 'lucide-react';
import Navigation from '../components/Navigation';
import { api } from '../lib/api';
import type { Shipment } from '../types/shipment';
import type { Tour } from '../types/tour';
import {
  TRANSPORT_TYPE_OPTIONS,
  transportTypeLabel,
} from '../constants/transportTypes';

function deliveryCoords(s: Shipment): [number, number] | null {
  const a =
    (s as unknown as { addresses_shipments_delivery_address_idToaddresses?: { lat?: unknown; lng?: unknown } })
      .addresses_shipments_delivery_address_idToaddresses ??
    (s as unknown as { deliveryAddress?: { lat?: unknown; lng?: unknown } }).deliveryAddress;
  if (!a || a.lat == null || a.lng == null) return null;
  const lat = Number(a.lat);
  const lng = Number(a.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

function deliveryCountry(s: Shipment): string {
  const a =
    (s as unknown as { addresses_shipments_delivery_address_idToaddresses?: { country_code?: string } })
      .addresses_shipments_delivery_address_idToaddresses ??
    (s as unknown as { deliveryAddress?: { country_code?: string } }).deliveryAddress;
  return (a?.country_code ?? 'XX').toUpperCase();
}

function flagFor(code: string): string {
  if (!code || code.length !== 2) return '🌐';
  const base = 0x1f1e6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(code.charCodeAt(0) + base, code.charCodeAt(1) + base);
}

function loadingDateOf(s: Shipment): string | null {
  const v = (s as { loading_date?: string }).loading_date ?? s.loadingDate;
  if (!v) return null;
  return v.slice(0, 10);
}

export default function MapDispositionPage() {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  // Filter-State
  const [countryFilter, setCountryFilter] = useState<Set<string>>(new Set());
  const [relationFilter, setRelationFilter] = useState<Set<string>>(new Set());
  const [transportFilter, setTransportFilter] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [relSearch, setRelSearch] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  // Phase D: Tour-Auswahl + Bulk-Add
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: shipments = [] } = useQuery<Shipment[]>({
    queryKey: ['shipments', 'map-disposition', 'new', 'unassigned'],
    queryFn: async () => {
      const { data } = await api.get<Shipment[]>('/shipments', {
        params: { status: 'new', tourId: 'null' },
      });
      return data;
    },
  });

  const { data: tours = [] } = useQuery<Tour[]>({
    queryKey: ['tours', 'planned'],
    queryFn: async () => {
      const { data } = await api.get<Tour[]>('/tours', { params: { status: 'planned' } });
      return data;
    },
  });

  const activeTour = tours.find((t) => t.id === activeTourId) ?? null;

  const assignMutation = useMutation({
    mutationFn: async (vars: { shipmentId: string; tourId: string }) => {
      await api.patch(`/shipments/${vars.shipmentId}`, { tourId: vars.tourId });
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['shipments'] });
      void queryClient.invalidateQueries({ queryKey: ['tours'] });
      setHint(`Sendung in Tour übernommen.`);
      setTimeout(() => setHint(null), 2000);
      void vars;
    },
    onError: (_e, vars) => {
      // Rollback Optimistic
      setRecentlyAdded((prev) => {
        const n = new Set(prev);
        n.delete(vars.shipmentId);
        return n;
      });
      setHint('Zuweisung fehlgeschlagen.');
      setTimeout(() => setHint(null), 3000);
    },
  });

  // Refs für Click-Closure (immer aktueller State)
  const stateRef = useRef({ bulkMode, activeTourId, recentlyAdded, tours });
  stateRef.current = { bulkMode, activeTourId, recentlyAdded, tours };
  const mutateRef = useRef(assignMutation.mutate);
  mutateRef.current = assignMutation.mutate;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
    );
  }

  function buildPopupHtml(s: Shipment): string {
    const r = s as unknown as Record<string, unknown>;
    const shipNo = (r.shipment_number as string) ?? s.shipmentNumber ?? s.id.slice(0, 6);
    const customer =
      (r.customers as { name?: string } | undefined)?.name ??
      (r.customer as { name?: string } | undefined)?.name ??
      '–';
    const loadAddr =
      (r.addresses_shipments_loading_address_idToaddresses as { city?: string; country_code?: string } | undefined) ??
      (r.loadingAddress as { city?: string; country_code?: string } | undefined);
    const delivAddr =
      (r.addresses_shipments_delivery_address_idToaddresses as { city?: string; country_code?: string } | undefined) ??
      (r.deliveryAddress as { city?: string; country_code?: string } | undefined);
    const fromTo = `${loadAddr?.city ?? '?'} → ${delivAddr?.city ?? '?'}`;
    const pkg = Number(r.package_count ?? 0);
    const wt = Number(r.weight_kg ?? 0);
    const ldm = Number(s.ldm ?? 0);
    const tt = transportTypeLabel((s.transport_type ?? (r.transportType as string)) ?? '');
    const rel = s.relation;
    const relStr = rel ? `${rel.code}${rel.name ? ' – ' + rel.name : ''}` : '–';
    const items = (s.shipment_package_items ?? []) as Array<{ stackable?: boolean }>;
    const stackable =
      items.length > 0 ? items.every((i) => i.stackable !== false) : true;
    const stackTxt = stackable ? '🔵 Stapelbar' : '🔴 Nicht stapelbar';

    const tourOptions = stateRef.current.tours
      .map(
        (t) =>
          `<option value="${escapeHtml(t.id)}">${escapeHtml(t.tour_number ?? '')}</option>`,
      )
      .join('');

    return `
      <div style="font-size:12px; min-width:220px">
        <div style="font-weight:600; font-size:13px; margin-bottom:2px">${escapeHtml(shipNo)}</div>
        <div style="color:#374151">${escapeHtml(customer)}</div>
        <div style="color:#6b7280; font-size:11px; margin-top:2px">${escapeHtml(fromTo)}</div>
        <div style="color:#374151; margin-top:4px">${pkg} EP · ${wt.toFixed(0)} kg · ${ldm.toFixed(2)} ldm</div>
        <div style="margin-top:4px"><span style="background:#eef2ff; color:#3730a3; padding:1px 6px; border-radius:4px; font-size:11px">${escapeHtml(tt)}</span></div>
        <div style="color:#6b7280; font-size:11px; margin-top:2px">Relation: ${escapeHtml(relStr)}</div>
        <div style="margin-top:2px; font-size:11px">${stackTxt}</div>
        <div style="display:flex; gap:6px; margin-top:8px; align-items:center; flex-wrap:wrap">
          <button data-action="goto-list" data-id="${escapeHtml(s.id)}"
            style="background:#1e40af; color:#fff; border:none; border-radius:6px; padding:5px 8px; font-size:11px; cursor:pointer">
            📋 Zur Liste
          </button>
          <select data-action="tour-select" data-id="${escapeHtml(s.id)}"
            style="border:1px solid #d1d5db; border-radius:6px; padding:4px 6px; font-size:11px">
            <option value="">➕ In Tour…</option>
            ${tourOptions}
          </select>
        </div>
      </div>
    `;
  }

  // Filter-Optionen aus Daten ableiten
  const countryOptions = useMemo(() => {
    const set = new Map<string, number>();
    for (const s of shipments) {
      const cc = deliveryCountry(s);
      set.set(cc, (set.get(cc) ?? 0) + 1);
    }
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [shipments]);

  const relationOptions = useMemo(() => {
    const set = new Map<string, { code: string; name: string; count: number }>();
    for (const s of shipments) {
      const r = s.relation;
      if (!r?.code) continue;
      const cur = set.get(r.code);
      if (cur) cur.count++;
      else set.set(r.code, { code: r.code, name: r.name ?? '', count: 1 });
    }
    return [...set.values()].sort((a, b) => b.count - a.count);
  }, [shipments]);

  const filteredRelationOptions = useMemo(() => {
    const q = relSearch.trim().toLowerCase();
    if (!q) return relationOptions.slice(0, 50);
    return relationOptions
      .filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [relationOptions, relSearch]);

  // Anwenden Filter
  const filtered = useMemo(() => {
    return shipments.filter((s) => {
      if (countryFilter.size > 0 && !countryFilter.has(deliveryCountry(s))) return false;
      if (relationFilter.size > 0) {
        const code = s.relation?.code;
        if (!code || !relationFilter.has(code)) return false;
      }
      if (transportFilter.size > 0) {
        const tt = s.transport_type ?? (s as { transportType?: string }).transportType ?? '';
        if (!transportFilter.has(tt)) return false;
      }
      if (dateFrom || dateTo) {
        const d = loadingDateOf(s);
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
      }
      return true;
    });
  }, [shipments, countryFilter, relationFilter, transportFilter, dateFrom, dateTo]);

  const { withCoords, withoutCoords } = useMemo(() => {
    const withC: Array<{ s: Shipment; pos: [number, number] }> = [];
    const withoutC: Shipment[] = [];
    for (const s of filtered) {
      const pos = deliveryCoords(s);
      if (pos) withC.push({ s, pos });
      else withoutC.push(s);
    }
    return { withCoords: withC, withoutCoords: withoutC };
  }, [filtered]);

  // Karte init
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, {
      center: [51.1657, 10.4515],
      zoom: 5,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    const cluster = L.markerClusterGroup({
      disableClusteringAtZoom: 13,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    map.addLayer(cluster);
    clusterRef.current = cluster;
    mapRef.current = map;
  }, []);

  // Pins re-rendern bei Filter-Änderung
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;
    cluster.clearLayers();
    if (withCoords.length === 0) return;
    const bounds = L.latLngBounds([]);
    for (const { s, pos } of withCoords) {
      const shipNo =
        (s as { shipment_number?: string }).shipment_number ??
        s.shipmentNumber ??
        s.id.slice(0, 6);
      const relCode = s.relation?.code ?? '';
      const isAdded = recentlyAdded.has(s.id);
      const marker = L.circleMarker(pos, {
        radius: 7,
        color: isAdded ? '#15803d' : '#374151',
        fillColor: isAdded ? '#22c55e' : '#9ca3af',
        fillOpacity: 0.9,
        weight: 1.5,
      });
      marker.bindTooltip(
        `<div style="font-size:11px"><strong>${shipNo}</strong>${
          relCode ? `<br/><span style="opacity:.7">${relCode}</span>` : ''
        }</div>`,
        { direction: 'top', opacity: 0.95 },
      );
      marker.bindPopup(buildPopupHtml(s), { maxWidth: 280 });
      marker.on('click', () => {
        const st = stateRef.current;
        if (!st.bulkMode) {
          // Normal-Modus: Popup wird automatisch geöffnet (bindPopup)
          return;
        }
        if (!st.activeTourId) {
          setHint('Erst eine Tour auswählen.');
          setTimeout(() => setHint(null), 2500);
          return;
        }
        if (st.recentlyAdded.has(s.id)) return;
        setRecentlyAdded((prev) => {
          const n = new Set(prev);
          n.add(s.id);
          return n;
        });
        mutateRef.current({ shipmentId: s.id, tourId: st.activeTourId });
        marker.closePopup();
      });
      marker.on('popupopen', (e) => {
        if (stateRef.current.bulkMode) {
          marker.closePopup();
          return;
        }
        const popupEl = (e as L.PopupEvent).popup.getElement();
        if (!popupEl) return;
        const gotoBtn = popupEl.querySelector<HTMLButtonElement>('[data-action="goto-list"]');
        gotoBtn?.addEventListener('click', () => {
          marker.closePopup();
          navigateRef.current(`/disposition?focus=${encodeURIComponent(s.id)}`);
        });
        const sel = popupEl.querySelector<HTMLSelectElement>('[data-action="tour-select"]');
        sel?.addEventListener('change', () => {
          const tourId = sel.value;
          if (!tourId) return;
          setRecentlyAdded((prev) => {
            const n = new Set(prev);
            n.add(s.id);
            return n;
          });
          mutateRef.current({ shipmentId: s.id, tourId });
          marker.closePopup();
        });
      });
      cluster.addLayer(marker);
      bounds.extend(pos);
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
  }, [withCoords, recentlyAdded]);

  function toggleSet(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const n = new Set(set);
    n.has(key) ? n.delete(key) : n.add(key);
    setter(n);
  }
  function resetFilters() {
    setCountryFilter(new Set());
    setRelationFilter(new Set());
    setTransportFilter(new Set());
    setDateFrom('');
    setDateTo('');
    setRelSearch('');
  }

  const activeChips: Array<{ label: string; onRemove: () => void }> = [];
  for (const cc of countryFilter) {
    activeChips.push({
      label: `${flagFor(cc)} ${cc}`,
      onRemove: () => toggleSet(countryFilter, cc, setCountryFilter),
    });
  }
  for (const rc of relationFilter) {
    activeChips.push({ label: rc, onRemove: () => toggleSet(relationFilter, rc, setRelationFilter) });
  }
  for (const tt of transportFilter) {
    activeChips.push({
      label: transportTypeLabel(tt),
      onRemove: () => toggleSet(transportFilter, tt, setTransportFilter),
    });
  }
  if (dateFrom) activeChips.push({ label: `Ab ${dateFrom}`, onRemove: () => setDateFrom('') });
  if (dateTo) activeChips.push({ label: `Bis ${dateTo}`, onRemove: () => setDateTo('') });

  return (
    <>
      <Navigation />
      <main className="w-full flex-1 flex flex-col bg-gray-50 min-h-0">
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <Link to="/disposition" className="text-gray-500 hover:text-gray-800">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-lg font-semibold text-gray-900">Karten-Disposition</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="text-xs text-gray-600 underline"
            >
              {showFilters ? 'Filter ausblenden' : 'Filter einblenden'}
            </button>
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
              <Link
                to="/disposition"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white text-gray-700 hover:bg-gray-50 border-r border-gray-300"
              >
                <List size={14} /> Liste
              </Link>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1e40af] text-white">
                <MapIcon size={14} /> Karte
              </span>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="border-b border-gray-200 bg-white px-4 py-3 space-y-3 text-sm">
            <div>
              <div className="text-[11px] uppercase text-gray-500 mb-1">Land</div>
              <div className="flex flex-wrap gap-1.5">
                {countryOptions.map(([cc, n]) => {
                  const active = countryFilter.has(cc);
                  return (
                    <button
                      key={cc}
                      type="button"
                      onClick={() => toggleSet(countryFilter, cc, setCountryFilter)}
                      className={
                        'rounded border px-2 py-0.5 text-xs ' +
                        (active
                          ? 'bg-[#1e40af] text-white border-[#1e40af]'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
                      }
                    >
                      {flagFor(cc)} {cc} ({n})
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase text-gray-500 mb-1">Verkehrsart</div>
              <div className="flex flex-wrap gap-1.5">
                {TRANSPORT_TYPE_OPTIONS.map((o) => {
                  const active = transportFilter.has(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleSet(transportFilter, o.value, setTransportFilter)}
                      className={
                        'rounded border px-2 py-0.5 text-xs ' +
                        (active
                          ? 'bg-[#1e40af] text-white border-[#1e40af]'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <div className="text-[11px] uppercase text-gray-500 mb-1">Relation (Suche)</div>
                <input
                  type="text"
                  value={relSearch}
                  onChange={(e) => setRelSearch(e.target.value)}
                  placeholder="Code oder Name…"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
                {(relSearch || relationFilter.size > 0) && (
                  <div className="mt-1 max-h-40 overflow-auto rounded border border-gray-200 bg-white">
                    {filteredRelationOptions.map((r) => {
                      const active = relationFilter.has(r.code);
                      return (
                        <button
                          key={r.code}
                          type="button"
                          onClick={() => toggleSet(relationFilter, r.code, setRelationFilter)}
                          className={
                            'block w-full text-left px-2 py-1 text-xs hover:bg-gray-50 ' +
                            (active ? 'bg-blue-50' : '')
                          }
                        >
                          <span className="font-mono">{r.code}</span>
                          {r.name && <span className="text-gray-600"> – {r.name}</span>}
                          <span className="text-gray-400"> ({r.count})</span>
                        </button>
                      );
                    })}
                    {filteredRelationOptions.length === 0 && (
                      <div className="px-2 py-1 text-xs text-gray-500">Keine Treffer</div>
                    )}
                  </div>
                )}
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-500">Datum von</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-500">Datum bis</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            {activeChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] uppercase text-gray-500">Aktiv:</span>
                {activeChips.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs"
                  >
                    {c.label}
                    <button
                      type="button"
                      onClick={c.onRemove}
                      className="hover:text-blue-900"
                      aria-label="entfernen"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={resetFilters}
                  className="ml-2 text-xs text-gray-600 underline"
                >
                  Alle zurücksetzen
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tour-Liste (horizontal scrollende Karten) */}
        <div className="border-b border-gray-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] uppercase text-gray-500">Touren (planned)</span>
            <span className="text-[11px] text-gray-400">·</span>
            <button
              type="button"
              onClick={() => setBulkMode((v) => !v)}
              className={
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ' +
                (bulkMode
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300')
              }
            >
              <Power size={12} />
              Bulk-Add {bulkMode ? 'AN' : 'AUS'}
            </button>
            {recentlyAdded.size > 0 && (
              <span className="text-[11px] text-green-700">
                · {recentlyAdded.size} in dieser Sitzung hinzugefügt
              </span>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tours.length === 0 && (
              <span className="text-xs text-gray-500 px-1 py-2">Keine planned Touren.</span>
            )}
            {tours.map((t) => {
              const active = t.id === activeTourId;
              const sub =
                (t as Tour & { subcontractors?: { name?: string } | null }).subcontractors?.name ??
                (t as { driver_name?: string }).driver_name ??
                '';
              const ldm = Number(t.total_ldm ?? 0);
              const maxLdm = Number(t.max_ldm ?? 13.6);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTourId((cur) => (cur === t.id ? null : t.id))}
                  className={
                    'shrink-0 rounded-lg border px-3 py-2 text-left text-xs transition-colors ' +
                    (active
                      ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300'
                      : 'border-gray-200 bg-white hover:bg-gray-50')
                  }
                >
                  <div className="font-semibold text-gray-900">{t.tour_number}</div>
                  {sub && <div className="text-gray-600">{sub}</div>}
                  <div className="text-gray-500">
                    {ldm.toFixed(1)} / {maxLdm.toFixed(1)} ldm
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 relative">
          <div ref={mapDivRef} className="absolute inset-0" />
          <div className="absolute top-2 left-2 z-[1000] rounded bg-white/95 px-2 py-1 text-xs text-gray-700 shadow border border-gray-200">
            <span className="font-medium">{withCoords.length}</span> von {shipments.length} Sendungen
            {withoutCoords.length > 0 && (
              <span className="ml-2 text-red-700">· {withoutCoords.length} ohne Koord.</span>
            )}
          </div>
          {hint && (
            <div className="absolute top-2 right-2 z-[1000] rounded bg-blue-600 text-white px-3 py-1 text-xs shadow">
              {hint}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 bg-white px-4 py-2 text-sm flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-2">
            <span className="font-medium text-gray-700">Aktive Tour:</span>
            {activeTour ? (
              <>
                <span className="font-semibold text-gray-900">{activeTour.tour_number}</span>
                <span className="text-gray-600">
                  {Number(activeTour.total_ldm ?? 0).toFixed(1)} ldm
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTourId(null)}
                  className="text-xs text-gray-500 underline"
                >
                  deaktivieren
                </button>
              </>
            ) : (
              <span className="text-gray-500">– keine</span>
            )}
          </span>
          {bulkMode && !activeTour && (
            <span className="text-xs text-orange-700">
              Bulk-Add an, aber keine Tour gewählt — Pin-Klicks ignoriert.
            </span>
          )}
          {assignMutation.isPending && (
            <span className="text-xs text-gray-500">Speichere…</span>
          )}
        </div>
      </main>
    </>
  );
}

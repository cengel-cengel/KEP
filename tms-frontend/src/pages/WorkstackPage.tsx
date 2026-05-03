import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const LOCK_FILTER_TABS = [
  { id: '', label: 'Alle Sperren' },
  { id: 'ZOLL', label: 'ZOLL', accent: 'text-red-600' },
  { id: 'ADR', label: 'ADR', accent: 'text-orange-600' },
  { id: 'ADRESSFEHLER', label: 'ADRESSFEHLER', accent: 'text-yellow-700' },
  { id: 'KLAERFALL', label: 'KLAERFALL', accent: 'text-blue-600' },
  { id: 'AVIS', label: 'AVIS', accent: 'text-purple-600' },
] as const;

type LockRow = {
  id: string;
  lock_type: string;
  reason: string | null;
  locked_at: string | null;
  due_date: string | null;
  shipment_id: string;
  shipments?: {
    shipment_number?: string;
    ldm?: unknown;
    customers?: { name?: string } | null;
    business_partner?: { name?: string; partner_number?: string } | null;
    addresses_shipments_loading_address_idToaddresses?: { city?: string; country_code?: string } | null;
    addresses_shipments_delivery_address_idToaddresses?: { city?: string; country_code?: string } | null;
  };
};

function formatDt(s: string | null | undefined) {
  if (!s) return '–';
  try {
    return new Date(s).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '–';
  }
}

function partyName(s: LockRow['shipments']) {
  if (!s) return '–';
  return (
    s.customers?.name ??
    (s.business_partner ? `[BP] ${s.business_partner.name ?? s.business_partner.partner_number}` : null) ??
    '–'
  );
}

function routeLine(s: LockRow['shipments']) {
  if (!s) return '–';
  const a = s.addresses_shipments_loading_address_idToaddresses;
  const b = s.addresses_shipments_delivery_address_idToaddresses;
  const from = a ? [a.city, a.country_code].filter(Boolean).join(' ') : '';
  const to = b ? [b.city, b.country_code].filter(Boolean).join(' ') : '';
  return `${from || '–'} → ${to || '–'}`;
}

function lockCardClass(due: string | null | undefined) {
  if (!due) return 'border-gray-200';
  const d = new Date(due);
  const now = new Date();
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  if (d < now) return 'border-red-500 ring-2 ring-red-200 animate-pulse';
  if (d <= endToday) return 'border-orange-400 ring-1 ring-orange-200';
  return 'border-gray-200';
}

function hoursSince(s: string | null | undefined) {
  if (!s) return '';
  const ms = Date.now() - new Date(s).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'seit weniger als 1 Stunde';
  if (h < 24) return `seit ${h} Stunden`;
  const d = Math.floor(h / 24);
  return `seit ${d} Tag(en)`;
}

export default function WorkstackPage() {
  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState(0);
  const [lockSubTab, setLockSubTab] = useState('');
  const [resolveLockId, setResolveLockId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [newLockShipmentId, setNewLockShipmentId] = useState<string | null>(null);
  const [newLockType, setNewLockType] = useState('ZOLL');
  const [newLockReason, setNewLockReason] = useState('');
  const [newLockDue, setNewLockDue] = useState('');
  const [escalateLockId, setEscalateLockId] = useState<string | null>(null);
  const [escalateUserId, setEscalateUserId] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyShipmentId, setHistoryShipmentId] = useState<string | null>(null);

  // ── NV / Damages / Returns / Surplus Workstack Modals ─────────────
  const [nvActionId, setNvActionId] = useState<string | null>(null);
  const [nvActionType, setNvActionType] = useState<'RETRY' | 'RETURN' | 'SELF_PICKUP' | 'STORAGE'>('RETRY');
  const [nvRetryDate, setNvRetryDate] = useState('');
  const [nvRetryTimeFrom, setNvRetryTimeFrom] = useState('');
  const [nvRetryTimeTo, setNvRetryTimeTo] = useState('');
  const [nvRetryRequiresAdvisory, setNvRetryRequiresAdvisory] = useState(true);
  const [nvRetryNotes, setNvRetryNotes] = useState('');
  const [nvReturnCostEur, setNvReturnCostEur] = useState<number>(0);
  const [nvReturnCostBearer, setNvReturnCostBearer] = useState<string>('KED');
  const [nvReturnReasonNotes, setNvReturnReasonNotes] = useState('');
  const [nvSelfPickupUntilDate, setNvSelfPickupUntilDate] = useState('');
  const [nvSelfPickupNotes, setNvSelfPickupNotes] = useState('');
  const [nvStorageHallLocationId, setNvStorageHallLocationId] = useState<string>('');
  const [nvStorageDailyRate, setNvStorageDailyRate] = useState<number>(0);
  const [nvResolutionNotes, setNvResolutionNotes] = useState('');

  const [damageActionId, setDamageActionId] = useState<string | null>(null);
  const [damageStep, setDamageStep] = useState<1 | 2 | 3>(1);
  const [damageType, setDamageType] = useState<string>('OPTISCH');
  const [damageValueEur, setDamageValueEur] = useState<number>(0);
  const [damageCause, setDamageCause] = useState<string>('VERPACKUNG');
  const [damageLiabilityParty, setDamageLiabilityParty] = useState<string>('KED');

  // Stage 2
  const [damageCreateClaim, setDamageCreateClaim] = useState<boolean>(false);
  const [damageClaimAgainst, setDamageClaimAgainst] = useState<string>('PARTNER');
  const [damageClaimAmountEur, setDamageClaimAmountEur] = useState<number>(0);
  const [damageKulanzDecision, setDamageKulanzDecision] = useState<boolean>(false);

  const [damageInsuranceClaim, setDamageInsuranceClaim] = useState<boolean>(false);
  const [damageInsuranceRef, setDamageInsuranceRef] = useState<string>('');
  const [damageResolutionNotes, setDamageResolutionNotes] = useState<string>('');

  const [assignReturnId, setAssignReturnId] = useState<string | null>(null);
  const [assignReturnTourId, setAssignReturnTourId] = useState<string>('');

  const [surplusCreateOpen, setSurplusCreateOpen] = useState(false);
  const [surplusCreateTourId, setSurplusCreateTourId] = useState<string>('');
  const [surplusCreateDescription, setSurplusCreateDescription] = useState('');
  const [surplusCreateWeightKg, setSurplusCreateWeightKg] = useState<number>(0);
  const [surplusCreatePackageCount, setSurplusCreatePackageCount] = useState<number>(1);
  const [surplusCreatePhotoBase64, setSurplusCreatePhotoBase64] = useState<string | null>(null);
  const [surplusCreateScanCode, setSurplusCreateScanCode] = useState<string>('');
  const [surplusCreateHallLocationId, setSurplusCreateHallLocationId] = useState<string>('');

  const [surplusMatchId, setSurplusMatchId] = useState<string | null>(null);
  const [surplusMatchSearch, setSurplusMatchSearch] = useState('');

  const allLocksQuery = useQuery({
    queryKey: ['status', 'locks', 'workstack', 'all'],
    queryFn: async () => {
      const { data } = await api.get<LockRow[]>('/status/locks/workstack');
      return data;
    },
    enabled: mainTab === 0,
  });

  const displayedLocks = useMemo(() => {
    const list = allLocksQuery.data ?? [];
    if (!lockSubTab) return list;
    return list.filter((l) => l.lock_type === lockSubTab);
  }, [allLocksQuery.data, lockSubTab]);

  const lockCounts = useMemo(() => {
    const list = allLocksQuery.data ?? [];
    const m: Record<string, number> = { '': list.length };
    for (const row of list) {
      const t = row.lock_type;
      m[t] = (m[t] ?? 0) + 1;
    }
    return m;
  }, [allLocksQuery.data]);

  const badgeSummaryQuery = useQuery({
    queryKey: ['status', 'badge-summary'],
    queryFn: async () => {
      const { data } = await api.get<{
        activeLockCount: number;
        openAdvisoryCount: number;
        openNvDispositionsCount: number;
        openDamagesCount: number;
        openSurplusCount: number;
      }>('/status/badge-summary');
      return data;
    },
  });

  const openNvCount = badgeSummaryQuery.data?.openNvDispositionsCount ?? 0;
  const openDamagesCount = badgeSummaryQuery.data?.openDamagesCount ?? 0;
  const openSurplusCount = badgeSummaryQuery.data?.openSurplusCount ?? 0;

  const advisoriesQuery = useQuery({
    queryKey: ['status', 'advisories', 'workstack'],
    queryFn: async () => {
      const { data } = await api.get<any[]>('/status/advisories/workstack');
      return data;
    },
    enabled: mainTab === 1,
  });

  const monitorQueries = {
    ohne_erststatus: useQuery({
      queryKey: ['status', 'ws', 'ohne_erststatus'],
      queryFn: async () => (await api.get('/status/workstack/ohne_erststatus')).data,
      enabled: mainTab === 2,
    }),
    ohne_folgestatus: useQuery({
      queryKey: ['status', 'ws', 'ohne_folgestatus'],
      queryFn: async () => (await api.get('/status/workstack/ohne_folgestatus')).data,
      enabled: mainTab === 2,
    }),
    zustellhindernisse: useQuery({
      queryKey: ['status', 'ws', 'zustellhindernisse'],
      queryFn: async () => (await api.get('/status/workstack/zustellhindernisse')).data,
      enabled: mainTab === 2,
    }),
    ueberfaellig: useQuery({
      queryKey: ['status', 'ws', 'ueberfaellig'],
      queryFn: async () => (await api.get('/status/workstack/ueberfaellig')).data,
      enabled: mainTab === 2,
    }),
  };

  const historyQuery = useQuery({
    queryKey: ['status', 'history', historyShipmentId],
    queryFn: async () => {
      const { data } = await api.get(`/status/shipment/${historyShipmentId}/history`);
      return data as {
        shipment: { shipment_number: string; status: string };
        events: Array<{
          id: string;
          event_type: string;
          performed_at: string | null;
          description: string | null;
          location: string | null;
          users: { name: string } | null;
        }>;
      };
    },
    enabled: !!historyShipmentId && mainTab === 3,
  });

  const shipmentsSearchQuery = useQuery({
    queryKey: ['shipments', 'search', historySearch],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; shipment_number: string }[]>('/shipments', {
        params: { search: historySearch.trim() },
      });
      return data;
    },
    enabled: historySearch.trim().length >= 2 && mainTab === 3,
  });

  // ── Returns / Damages / NV Workstack ─────────────────────
  const nvWorkstackQuery = useQuery({
    queryKey: ['returns', 'workstack', 'nv'],
    queryFn: async () => (await api.get<any[]>('/returns/workstack/nv')).data,
    enabled: mainTab === 4,
  });

  const damagesWorkstackQuery = useQuery({
    queryKey: ['returns', 'workstack', 'damages'],
    queryFn: async () => (await api.get<any[]>('/returns/workstack/damages')).data,
    enabled: mainTab === 5,
  });

  const returnsWorkstackQuery = useQuery({
    queryKey: ['returns', 'workstack', 'returns'],
    queryFn: async () => (await api.get<any[]>('/returns/workstack/returns')).data,
    enabled: true,
  });

  const surplusWorkstackQuery = useQuery({
    queryKey: ['returns', 'workstack', 'surplus'],
    queryFn: async () => (await api.get<any[]>('/returns/workstack/surplus')).data,
    enabled: mainTab === 7,
  });

  const openReturnsCount = returnsWorkstackQuery.data?.length ?? 0;

  const toursQuery = useQuery({
    queryKey: ['tours'],
    queryFn: async () => (await api.get<any[]>('/tours')).data,
  });

  const hallLocationsQuery = useQuery({
    queryKey: ['hall', 'locations'],
    queryFn: async () => (await api.get<any[]>('/hall/locations')).data,
  });

  const surplusShipmentSearchQuery = useQuery({
    queryKey: ['shipments', 'search', surplusMatchSearch],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; shipment_number: string }[]>('/shipments', {
        params: { search: surplusMatchSearch.trim() },
      });
      return data;
    },
    enabled: surplusMatchId != null && surplusMatchSearch.trim().length >= 2,
  });

  const resolveMut = useMutation({
    mutationFn: async () => {
      await api.patch(`/status/locks/${resolveLockId}/resolve`, { resolutionNotes: resolveNote });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      setResolveLockId(null);
      setResolveNote('');
    },
  });

  const newLockMut = useMutation({
    mutationFn: async () => {
      await api.post('/status/locks', {
        shipmentId: newLockShipmentId,
        lockType: newLockType,
        reason: newLockReason || undefined,
        dueDate: newLockDue ? new Date(newLockDue).toISOString() : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      setNewLockShipmentId(null);
      setNewLockReason('');
      setNewLockDue('');
    },
  });

  const escalateMut = useMutation({
    mutationFn: async () => {
      await api.patch(`/status/locks/${escalateLockId}/escalate`, { escalatedTo: escalateUserId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      setEscalateLockId(null);
      setEscalateUserId('');
    },
  });

  const advisoryContactMut = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/status/advisories/${id}/status`, { status: 'contacted' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status', 'advisories'] }),
  });

  function openHistoryForFirstMatch() {
    const rows = shipmentsSearchQuery.data ?? [];
    if (!rows.length) {
      window.alert('Keine Sendung gefunden.');
      return;
    }
    setHistoryShipmentId(rows[0].id);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Arbeitsstapel</h1>

        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2 mb-4">
          {[
            `Klärfälle & Sperren (${lockCounts[''] ?? 0})`,
            `Avisierungen (${advisoriesQuery.data?.length ?? '…'})`,
            'Status-Überwachung',
            'Statusverlauf',
            `🔄 NV-Verfügungen (${openNvCount})`,
            `📦 Beschädigungen (${openDamagesCount})`,
            `🔁 Retouren (${openReturnsCount})`,
            `❓ Überzähligkeiten (${openSurplusCount})`,
          ].map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setMainTab(i)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                mainTab === i ? 'bg-[#1e40af] text-white' : 'bg-white text-gray-700 border border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mainTab === 0 && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              {LOCK_FILTER_TABS.map((t) => (
                <button
                  key={t.id || 'all'}
                  type="button"
                  onClick={() => setLockSubTab(t.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    lockSubTab === t.id
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200'
                  } ${'accent' in t ? t.accent : ''}`}
                >
                  {t.label}
                  <span className="ml-1 opacity-80">
                    ({t.id ? (lockCounts[t.id] ?? 0) : (lockCounts[''] ?? 0)})
                  </span>
                </button>
              ))}
            </div>

            {allLocksQuery.isLoading ? (
              <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {displayedLocks.map((row) => {
                  const sn = row.shipments?.shipment_number ?? row.shipment_id;
                  const ldm = row.shipments?.ldm != null ? Number(row.shipments.ldm).toFixed(1) : '0';
                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border bg-white p-4 shadow-sm ${lockCardClass(row.due_date)}`}
                    >
                      <div className="font-semibold text-gray-900">
                        {sn} · {partyName(row.shipments)}
                      </div>
                      <div className="text-sm text-gray-600 mt-0.5">
                        {routeLine(row.shipments)} · {ldm} ldm
                      </div>
                      <div className="text-sm mt-2">
                        <span className="font-medium text-red-600">{row.lock_type}</span>
                        <span className="text-gray-500"> · {hoursSince(row.locked_at)}</span>
                        {row.due_date && (
                          <span className="text-gray-600"> · fällig: {formatDt(row.due_date)}</span>
                        )}
                      </div>
                      {row.reason && <div className="text-sm text-gray-700 mt-1">Grund: {row.reason}</div>}
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg bg-[#1e40af] text-white"
                          onClick={() => {
                            setResolveLockId(row.id);
                            setResolveNote('');
                          }}
                        >
                          Sperre aufheben
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300"
                          onClick={() => {
                            setEscalateLockId(row.id);
                            setEscalateUserId('');
                          }}
                        >
                          Eskalieren
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300"
                          onClick={() => {
                            setNewLockShipmentId(row.shipment_id);
                            setNewLockType('SONSTIGES');
                          }}
                        >
                          Notiz / weitere Sperre
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mainTab === 1 && (
          <div className="space-y-4">
            {(advisoriesQuery.data ?? []).map((a) => {
              const s = a.shipments;
              const sn = s?.shipment_number ?? a.shipment_id;
              const deliv = s?.addresses_shipments_delivery_address_idToaddresses;
              return (
                <AdvisoryCard
                  key={a.id}
                  a={a}
                  sn={sn}
                  deliv={deliv}
                  onContact={() => advisoryContactMut.mutate(a.id)}
                  onEmail={() =>
                    api.post(`/status/advisories/${a.id}/send-email`).then(() =>
                      window.alert('E-Mail (Placeholder) – siehe Backend-Log.'),
                    )
                  }
                  onConfirmed={() => qc.invalidateQueries({ queryKey: ['status', 'advisories'] })}
                />
              );
            })}
            {!advisoriesQuery.data?.length && !advisoriesQuery.isLoading && (
              <p className="text-gray-500 text-sm">Keine offenen Avisierungen.</p>
            )}
          </div>
        )}

        {mainTab === 2 && (
          <div className="space-y-8">
            {(
              [
                ['ohne_erststatus', 'Ohne Erststatus (>24h)', monitorQueries.ohne_erststatus],
                ['ohne_folgestatus', 'Ohne Folgestatus (>48h)', monitorQueries.ohne_folgestatus],
                ['zustellhindernisse', 'Zustellhindernisse', monitorQueries.zustellhindernisse],
                ['ueberfaellig', 'Überfällig (Zustelldatum)', monitorQueries.ueberfaellig],
              ] as const
            ).map(([key, title, q]) => (
              <MonitorTable key={key} title={title} query={q} />
            ))}
          </div>
        )}

        {mainTab === 3 && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex gap-2 flex-wrap items-end">
              <label className="flex-1 min-w-[200px]">
                <span className="text-sm text-gray-600">Sendungsnummer</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="z. B. S26-100001"
                />
              </label>
              <button
                type="button"
                className="px-4 py-2 bg-[#1e40af] text-white rounded-lg"
                onClick={openHistoryForFirstMatch}
              >
                Verlauf laden
              </button>
            </div>

            {historyQuery.data && (
              <div className="bg-white rounded-xl border p-4">
                <div className="text-sm text-gray-600 mb-4">
                  {historyQuery.data.shipment.shipment_number} · Status {historyQuery.data.shipment.status}
                </div>
                <ol className="relative border-s border-gray-200 ms-3 space-y-6">
                  {historyQuery.data.events.map((ev) => (
                    <li key={ev.id} className="ms-6">
                      <span className="absolute flex items-center justify-center w-3 h-3 bg-blue-600 rounded-full -start-1.5 mt-1.5 ring-4 ring-white" />
                      <div className="font-medium">{ev.event_type}</div>
                      <div className="text-sm text-gray-500">
                        {formatDt(ev.performed_at)} {ev.users?.name ? `· ${ev.users.name}` : ''}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </div>
                      {ev.description && <div className="text-sm text-gray-700">{ev.description}</div>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {mainTab === 4 && (
          <div className="space-y-4">
            {nvWorkstackQuery.isLoading ? (
              <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
            ) : !nvWorkstackQuery.data?.length ? (
              <p className="text-gray-500 text-sm">Keine offenen NV-Verfügungen.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {nvWorkstackQuery.data.map((nv: any) => {
                  const s = nv.shipments;
                  const sn = s?.shipment_number ?? nv.shipment_id;
                  const delivery = s?.addresses_shipments_delivery_address_idToaddresses;
                  const empfaenger = [delivery?.contact_name, delivery?.city].filter(Boolean).join(', ') || '–';
                  const hinderis = formatDt(nv.reported_at);
                  return (
                    <div key={nv.id} className="rounded-xl border bg-white p-4 shadow-sm border-red-200">
                      <div className="font-semibold text-gray-900">
                        {sn} · {s?.customers?.name ?? '–'}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">Empfänger: {empfaenger}</div>
                      <div className="text-sm mt-2">
                        <span className="text-red-600 font-medium">⏰ Hindernis: {hinderis}</span>
                      </div>
                      <div className="text-sm mt-1">
                        🔴 {nv.problem_type}
                      </div>
                      {nv.driver_notes && <div className="text-sm text-gray-700 mt-1">Fahrer-Notiz: "{nv.driver_notes}"</div>}
                      {nv.driver_photo_base64 && (
                        <div className="mt-2">
                          <img
                            alt="NV Foto"
                            src={`data:image/png;base64,${nv.driver_photo_base64}`}
                            className="max-w-full max-h-32 rounded border border-gray-200"
                          />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg bg-[#1e40af] text-white"
                          onClick={() => {
                            setNvActionType('RETRY');
                            setNvActionId(nv.id);
                            setNvRetryNotes('');
                            setNvRetryRequiresAdvisory(true);
                            setNvRetryTimeFrom('');
                            setNvRetryTimeTo('');
                            setNvRetryDate('');
                            setNvResolutionNotes('');
                          }}
                        >
                          🔄 Neuer Versuch
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300"
                          onClick={() => {
                            setNvActionType('RETURN');
                            setNvActionId(nv.id);
                            setNvReturnCostEur(0);
                            setNvReturnCostBearer('KED');
                            setNvReturnReasonNotes('');
                            setNvResolutionNotes('');
                          }}
                        >
                          ↩ Retoure
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300"
                          onClick={() => {
                            setNvActionType('SELF_PICKUP');
                            setNvActionId(nv.id);
                            setNvSelfPickupUntilDate('');
                            setNvSelfPickupNotes('');
                            setNvResolutionNotes('');
                          }}
                        >
                          🏪 Selbstabholer
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300"
                          onClick={() => {
                            setNvActionType('STORAGE');
                            setNvActionId(nv.id);
                            setNvStorageHallLocationId('');
                            setNvStorageDailyRate(0);
                            setNvResolutionNotes('');
                          }}
                        >
                          📦 Einlagern
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mainTab === 5 && (
          <div className="space-y-4">
            {damagesWorkstackQuery.isLoading ? (
              <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
            ) : !damagesWorkstackQuery.data?.length ? (
              <p className="text-gray-500 text-sm">Keine offenen Schäden.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {damagesWorkstackQuery.data.map((dr: any) => {
                  const s = dr.shipments;
                  const sn = s?.shipment_number ?? dr.shipment_id;
                  const delivery = s?.addresses_shipments_delivery_address_idToaddresses;
                  return (
                    <div key={dr.id} className="rounded-xl border bg-white p-4 shadow-sm border-orange-200">
                      <div className="font-semibold text-gray-900">
                        {sn} · {s?.customers?.name ?? '–'}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Empfänger: {delivery?.contact_name ?? delivery?.name ?? '–'} {delivery?.city ? `· ${delivery.city}` : ''}
                      </div>
                      <div className="text-sm mt-2">
                        📦 <span className="font-medium">{dr.damage_type}</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Gemeldet: {dr.reported_by_driver ? 'Fahrer' : 'Dispatcher'} · {formatDt(dr.reported_at)}
                      </div>
                      <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{dr.damage_description}</div>
                      {dr.photo_base64_1 && (
                        <div className="mt-2">
                          <img
                            alt="Schaden Foto"
                            src={`data:image/png;base64,${dr.photo_base64_1}`}
                            className="max-w-full max-h-32 rounded border border-gray-200"
                          />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg bg-[#1e40af] text-white"
                          onClick={() => {
                            setDamageActionId(dr.id);
                            setDamageStep(1);
                            setDamageType(dr.damage_type ?? 'OPTISCH');
                            setDamageValueEur(Number(dr.damage_value_eur ?? 0));
                            setDamageCause(dr.damage_cause ?? 'VERPACKUNG');
                            setDamageLiabilityParty(dr.liability_party ?? 'KED');
                            setDamageCreateClaim(false);
                            setDamageClaimAgainst('PARTNER');
                            setDamageClaimAmountEur(Number(dr.damage_value_eur ?? 0));
                            setDamageKulanzDecision(false);
                            setDamageInsuranceClaim(Boolean(dr.insurance_claim));
                            setDamageInsuranceRef(dr.insurance_ref ?? '');
                            setDamageResolutionNotes('');
                          }}
                        >
                          Schaden bewerten
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mainTab === 6 && (
          <div className="space-y-4">
            <table className="w-full text-[11px] border-collapse border border-gray-200 bg-white rounded-lg overflow-hidden">
              <thead>
                <tr className="text-left bg-gray-50">
                  <th className="p-2 border-b">Sendung</th>
                  <th className="p-2 border-b">Empfänger</th>
                  <th className="p-2 border-b">Typ</th>
                  <th className="p-2 border-b">Grund</th>
                  <th className="p-2 border-b">Status</th>
                  <th className="p-2 border-b">Kosten</th>
                  <th className="p-2 border-b">Kostenträger</th>
                  <th className="p-2 border-b">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {(returnsWorkstackQuery.data ?? []).map((r: any) => {
                  const s = r.shipments;
                  const sn = s?.shipment_number ?? r.shipment_id;
                  const delivery = s?.addresses_shipments_delivery_address_idToaddresses;
                  const empfaenger = [delivery?.contact_name, delivery?.city].filter(Boolean).join(', ') || '–';
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="p-2 border-b font-medium">{sn}</td>
                      <td className="p-2 border-b">{empfaenger}</td>
                      <td className="p-2 border-b">{r.return_type}</td>
                      <td className="p-2 border-b">{r.return_reason}</td>
                      <td className="p-2 border-b">{r.status}</td>
                      <td className="p-2 border-b">{Number(r.return_cost_eur ?? 0).toFixed(2)} €</td>
                      <td className="p-2 border-b">{r.cost_bearer ?? '–'}</td>
                      <td className="p-2 border-b">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-[#1e40af] text-white text-[11px]"
                            onClick={() => {
                              setAssignReturnId(r.id);
                              setAssignReturnTourId('');
                            }}
                          >
                            Auf Tour setzen
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 rounded border border-gray-300 text-[11px]"
                            onClick={() => {
                              window.confirm('Retourenstatus auf "zugestellt" setzen?') &&
                                api
                                  .patch(`/returns/returns/${r.id}/mark-delivered`)
                                  .then(() =>
                                    qc.invalidateQueries({ queryKey: ['returns', 'workstack'] }),
                                  )
                                  .then(() => qc.invalidateQueries({ queryKey: ['status', 'badge-summary'] }));
                            }}
                          >
                            Als zugestellt markieren
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!returnsWorkstackQuery.data || returnsWorkstackQuery.data.length === 0) && (
                  <tr>
                    <td colSpan={8} className="p-4 text-gray-500">
                      Keine aktiven Retouren.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {mainTab === 7 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium text-gray-900">Überzähligkeiten</h2>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#1e40af] text-white text-sm"
                onClick={() => setSurplusCreateOpen(true)}
              >
                Neue ÜZ erfassen
              </button>
            </div>
            {surplusWorkstackQuery.isLoading ? (
              <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
            ) : !surplusWorkstackQuery.data?.length ? (
              <p className="text-gray-500 text-sm">Keine offenen ÜZ.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {surplusWorkstackQuery.data.map((it: any) => {
                  const code = it.scan_code ?? it.id.slice(0, 6).toUpperCase();
                  const matched = it.matchedShipment;
                  const hallCode = it.hallLocation?.code ?? '–';
                  return (
                    <div key={it.id} className="rounded-xl border bg-white p-4 shadow-sm">
                      <div className="font-semibold text-gray-900">{code} · {formatDt(it.created_at)}</div>
                      <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{it.description}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Hallenplatz: <span className="font-medium">{hallCode}</span>
                      </div>
                      <div className="text-sm mt-1">
                        Status: <span className="font-medium">{it.status}</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-2">
                        Automatische Suche: {matched ? `Treffer (${matched.shipment_number})` : 'Keine Treffer'}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg bg-[#1e40af] text-white"
                          onClick={() => {
                            setSurplusMatchId(it.id);
                            setSurplusMatchSearch('');
                          }}
                        >
                          Manuell zuordnen
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300"
                          onClick={() => {
                            window.confirm('ÜZ auf "nachbordero" setzen?') &&
                              api
                                .patch(`/returns/surplus/${it.id}/status`, { status: 'nachbordero' })
                                .then(() => qc.invalidateQueries({ queryKey: ['returns', 'workstack', 'surplus'] }))
                                .then(() => qc.invalidateQueries({ queryKey: ['status', 'badge-summary'] }));
                          }}
                        >
                          Nachbordero
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300"
                          onClick={() => {
                            window.confirm('ÜZ auf "entsorgt" setzen?') &&
                              api
                                .patch(`/returns/surplus/${it.id}/status`, { status: 'entsorgt' })
                                .then(() => qc.invalidateQueries({ queryKey: ['returns', 'workstack', 'surplus'] }))
                                .then(() => qc.invalidateQueries({ queryKey: ['status', 'badge-summary'] }));
                          }}
                        >
                          ✕ Entsorgen
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {resolveLockId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-4 shadow-lg">
            <h3 className="font-semibold text-lg">Sperre aufheben</h3>
            <textarea
              className="mt-3 w-full border rounded-lg p-2 text-sm min-h-[100px]"
              placeholder="Auflösungsnotiz (Pflicht)"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setResolveLockId(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="px-3 py-2 bg-[#1e40af] text-white rounded-lg disabled:opacity-50"
                disabled={!resolveNote.trim() || resolveMut.isPending}
                onClick={() => resolveMut.mutate()}
              >
                Aufheben
              </button>
            </div>
          </div>
        </div>
      )}

      {nvActionId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-4 shadow-lg">
            <h3 className="font-semibold text-lg">NV-Verfügung lösen: {nvActionType}</h3>

            {nvActionType === 'RETRY' && (
              <div className="space-y-3 mt-3">
                <label className="block text-sm text-gray-600">
                  Datum
                  <input type="date" className="mt-1 w-full border rounded-lg px-3 py-2" value={nvRetryDate} onChange={(e) => setNvRetryDate(e.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm text-gray-600">
                    Von
                    <input type="time" className="mt-1 w-full border rounded-lg px-3 py-2" value={nvRetryTimeFrom} onChange={(e) => setNvRetryTimeFrom(e.target.value)} />
                  </label>
                  <label className="block text-sm text-gray-600">
                    Bis
                    <input type="time" className="mt-1 w-full border rounded-lg px-3 py-2" value={nvRetryTimeTo} onChange={(e) => setNvRetryTimeTo(e.target.value)} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={nvRetryRequiresAdvisory} onChange={(e) => setNvRetryRequiresAdvisory(e.target.checked)} />
                  Avisierung erforderlich
                </label>
                <label className="block text-sm text-gray-600">
                  Notiz
                  <textarea className="mt-1 w-full border rounded-lg p-2 text-sm min-h-[80px]" value={nvRetryNotes} onChange={(e) => setNvRetryNotes(e.target.value)} />
                </label>
              </div>
            )}

            {nvActionType === 'RETURN' && (
              <div className="space-y-3 mt-3">
                <label className="block text-sm text-gray-600">
                  Retourenkosten (€)
                  <input type="number" min={0} step="0.01" className="mt-1 w-full border rounded-lg px-3 py-2" value={nvReturnCostEur} onChange={(e) => setNvReturnCostEur(Number(e.target.value))} />
                </label>
                <label className="block text-sm text-gray-600">
                  Kostenträger
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={nvReturnCostBearer} onChange={(e) => setNvReturnCostBearer(e.target.value)}>
                    {['KED', 'VERSENDER', 'EMPFAENGER'].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-gray-600">
                  Notiz
                  <textarea className="mt-1 w-full border rounded-lg p-2 text-sm min-h-[80px]" value={nvReturnReasonNotes} onChange={(e) => setNvReturnReasonNotes(e.target.value)} />
                </label>
              </div>
            )}

            {nvActionType === 'SELF_PICKUP' && (
              <div className="space-y-3 mt-3">
                <label className="block text-sm text-gray-600">
                  Abholfrist bis
                  <input type="date" className="mt-1 w-full border rounded-lg px-3 py-2" value={nvSelfPickupUntilDate} onChange={(e) => setNvSelfPickupUntilDate(e.target.value)} />
                </label>
                <label className="block text-sm text-gray-600">
                  Notiz für Empfänger
                  <textarea className="mt-1 w-full border rounded-lg p-2 text-sm min-h-[80px]" value={nvSelfPickupNotes} onChange={(e) => setNvSelfPickupNotes(e.target.value)} />
                </label>
              </div>
            )}

            {nvActionType === 'STORAGE' && (
              <div className="space-y-3 mt-3">
                <label className="block text-sm text-gray-600">
                  Hallenplatz
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={nvStorageHallLocationId} onChange={(e) => setNvStorageHallLocationId(e.target.value)}>
                    <option value="">(bitte wählen)</option>
                    {(hallLocationsQuery.data ?? []).map((h) => (
                      <option key={h.id} value={h.id}>{h.code} · {h.type}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-gray-600">
                  Lagergebühr €/Tag
                  <input type="number" min={0} step="0.01" className="mt-1 w-full border rounded-lg px-3 py-2" value={nvStorageDailyRate} onChange={(e) => setNvStorageDailyRate(Number(e.target.value))} />
                </label>
              </div>
            )}

            <label className="block text-sm text-gray-600 mt-3">
              Auflösungsnotiz (optional)
              <textarea className="mt-1 w-full border rounded-lg p-2 text-sm min-h-[70px]" value={nvResolutionNotes} onChange={(e) => setNvResolutionNotes(e.target.value)} />
            </label>

            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setNvActionId(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="px-3 py-2 bg-[#1e40af] text-white rounded-lg disabled:opacity-50"
                onClick={async () => {
                  if (!nvActionId) return;
                  const payload: any = { dispositionType: nvActionType, notes: nvResolutionNotes || undefined };

                  if (nvActionType === 'RETRY') {
                    payload.retryDate = nvRetryDate;
                    payload.retryTimeFrom = nvRetryTimeFrom || undefined;
                    payload.retryTimeTo = nvRetryTimeTo || undefined;
                    payload.retryRequiresAdvisory = nvRetryRequiresAdvisory;
                    payload.retryNotes = nvRetryNotes || undefined;
                  }
                  if (nvActionType === 'RETURN') {
                    payload.returnCostEur = nvReturnCostEur;
                    payload.returnCostBearer = nvReturnCostBearer;
                    payload.returnReason = undefined;
                    payload.notes = nvReturnReasonNotes || undefined;
                  }
                  if (nvActionType === 'SELF_PICKUP') {
                    payload.selfPickupUntilDate = nvSelfPickupUntilDate;
                    payload.selfPickupNotes = nvSelfPickupNotes || undefined;
                  }
                  if (nvActionType === 'STORAGE') {
                    payload.storageHallLocationId = nvStorageHallLocationId;
                    payload.storageDailyRate = nvStorageDailyRate;
                  }

                  await api.patch(`/returns/nv/${nvActionId}/resolve`, payload);
                  await qc.invalidateQueries({ queryKey: ['returns', 'workstack'] });
                  await qc.invalidateQueries({ queryKey: ['status', 'badge-summary'] });
                  setNvActionId(null);
                }}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {damageActionId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-4 shadow-lg">
            <h3 className="font-semibold text-lg">Schaden bewerten</h3>
            <div className="text-sm text-gray-600 mt-1">Stufe {damageStep} von 3</div>

            {damageStep === 1 && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm text-gray-600">
                    Schadenstyp
                    <select
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                      value={damageType}
                      onChange={(e) => setDamageType(e.target.value)}
                    >
                      {['OPTISCH', 'VERDECKT', 'TOTALSCHADEN'].map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-600">
                    Schadenswert in €
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                      value={damageValueEur}
                      onChange={(e) => setDamageValueEur(Number(e.target.value))}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm text-gray-600">
                    Schadensursache
                    <select
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                      value={damageCause}
                      onChange={(e) => setDamageCause(e.target.value)}
                    >
                      {['VERPACKUNG', 'TRANSPORT', 'PARTNER', 'UNBEKANNT'].map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-600">
                    Haftungspartei
                    <select
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                      value={damageLiabilityParty}
                      onChange={(e) => setDamageLiabilityParty(e.target.value)}
                    >
                      {['KED', 'PARTNER', 'VERSENDER', 'VERSICHERUNG'].map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}

            {damageStep === 2 && (
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={damageCreateClaim}
                    onChange={(e) => setDamageCreateClaim(e.target.checked)}
                  />
                  Reklamation erstellen
                </label>

                {damageCreateClaim && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm text-gray-600">
                      Gegen wen?
                      <select
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                        value={damageClaimAgainst}
                        onChange={(e) => setDamageClaimAgainst(e.target.value)}
                      >
                        {['PARTNER', 'VERSENDER'].map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-gray-600">
                      Betrag (€)
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                        value={damageClaimAmountEur}
                        onChange={(e) => setDamageClaimAmountEur(Number(e.target.value))}
                      />
                    </label>
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={damageInsuranceClaim}
                    onChange={(e) => setDamageInsuranceClaim(e.target.checked)}
                  />
                  Versicherungsfall
                </label>

                {damageInsuranceClaim && (
                  <label className="block text-sm text-gray-600">
                    Police-Nr.
                    <input
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                      value={damageInsuranceRef}
                      onChange={(e) => setDamageInsuranceRef(e.target.value)}
                    />
                  </label>
                )}

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={damageKulanzDecision}
                    onChange={(e) => setDamageKulanzDecision(e.target.checked)}
                  />
                  Kulanzentscheidung
                </label>
              </div>
            )}

            {damageStep === 3 && (
              <div className="mt-3 space-y-3">
                <label className="block text-sm text-gray-600">
                  Resolution-Notiz
                  <textarea
                    className="mt-1 w-full border rounded-lg p-2 text-sm min-h-[90px]"
                    value={damageResolutionNotes}
                    onChange={(e) => setDamageResolutionNotes(e.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="flex justify-between gap-2 mt-4">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setDamageActionId(null)}>
                Abbrechen
              </button>

              <div className="flex gap-2">
                {damageStep > 1 && (
                  <button
                    type="button"
                    className="px-3 py-2 border rounded-lg"
                    onClick={() => setDamageStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
                  >
                    Zurück
                  </button>
                )}

                {damageStep < 3 && (
                  <button
                    type="button"
                    className="px-3 py-2 bg-[#1e40af] text-white rounded-lg disabled:opacity-50"
                    disabled={damageStep === 1 ? !damageType || !damageCause || !damageLiabilityParty : damageCreateClaim && !damageClaimAmountEur}
                    onClick={() => setDamageStep((s) => ((s + 1) as 1 | 2 | 3))}
                  >
                    Weiter
                  </button>
                )}

                {damageStep === 3 && (
                  <button
                    type="button"
                    className="px-3 py-2 bg-[#1e40af] text-white rounded-lg"
                    onClick={async () => {
                      if (!damageActionId) return;
                      await api.patch(`/returns/damages/${damageActionId}/resolve`, {
                        status: 'abgeschlossen',
                        damageType,
                        damageValueEur,
                        damageCause,
                        liabilityParty: damageLiabilityParty,
                        createClaim: damageCreateClaim,
                        claimAgainst: damageCreateClaim ? damageClaimAgainst : undefined,
                        claimAmountEur: damageCreateClaim ? damageClaimAmountEur : undefined,
                        insuranceClaim: damageInsuranceClaim,
                        insuranceRef: damageInsuranceClaim ? damageInsuranceRef || undefined : undefined,
                        kulanzDecision: damageKulanzDecision,
                        resolutionNotes: damageResolutionNotes || undefined,
                      });
                      await qc.invalidateQueries({ queryKey: ['returns', 'workstack'] });
                      await qc.invalidateQueries({ queryKey: ['status', 'badge-summary'] });
                      setDamageActionId(null);
                    }}
                  >
                    Schaden abschliessen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {assignReturnId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-4 shadow-lg">
            <h3 className="font-semibold text-lg">Retouren-Tour setzen</h3>
            <label className="block mt-3 text-sm text-gray-600">
              Tour
              <select className="mt-1 w-full border rounded-lg px-3 py-2" value={assignReturnTourId} onChange={(e) => setAssignReturnTourId(e.target.value)}>
                <option value="">(bitte wählen)</option>
                {(toursQuery.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.tour_number} · {new Date(t.tour_date).toLocaleDateString('de-DE')}</option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setAssignReturnId(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="px-3 py-2 bg-[#1e40af] text-white rounded-lg disabled:opacity-50"
                disabled={!assignReturnTourId}
                onClick={async () => {
                  if (!assignReturnId) return;
                  await api.patch(`/returns/returns/${assignReturnId}/assign-tour`, { tourId: assignReturnTourId });
                  await qc.invalidateQueries({ queryKey: ['returns', 'workstack'] });
                  setAssignReturnId(null);
                }}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {surplusCreateOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-4 shadow-lg">
            <h3 className="font-semibold text-lg">Neue ÜZ erfassen</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="block text-sm text-gray-600">
                Beschreibung
                <textarea className="mt-1 w-full border rounded-lg p-2 text-sm min-h-[90px]" value={surplusCreateDescription} onChange={(e) => setSurplusCreateDescription(e.target.value)} />
              </label>
              <div className="space-y-3">
                <label className="block text-sm text-gray-600">
                  Gewicht (kg)
                  <input type="number" min={0} step="0.01" className="mt-1 w-full border rounded-lg px-3 py-2" value={surplusCreateWeightKg} onChange={(e) => setSurplusCreateWeightKg(Number(e.target.value))} />
                </label>
                <label className="block text-sm text-gray-600">
                  Anzahl Packstücke
                  <input type="number" min={1} step="1" className="mt-1 w-full border rounded-lg px-3 py-2" value={surplusCreatePackageCount} onChange={(e) => setSurplusCreatePackageCount(Number(e.target.value))} />
                </label>
                <label className="block text-sm text-gray-600">
                  Scan-Code
                  <input className="mt-1 w-full border rounded-lg px-3 py-2" value={surplusCreateScanCode} onChange={(e) => setSurplusCreateScanCode(e.target.value)} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="block text-sm text-gray-600">
                Tour
                <select className="mt-1 w-full border rounded-lg px-3 py-2" value={surplusCreateTourId} onChange={(e) => setSurplusCreateTourId(e.target.value)}>
                  <option value="">(bitte wählen)</option>
                  {(toursQuery.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.tour_number} · {new Date(t.tour_date).toLocaleDateString('de-DE')}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-gray-600">
                Hallenplatz
                <select className="mt-1 w-full border rounded-lg px-3 py-2" value={surplusCreateHallLocationId} onChange={(e) => setSurplusCreateHallLocationId(e.target.value)}>
                  <option value="">(bitte wählen)</option>
                  {(hallLocationsQuery.data ?? []).map((h) => (
                    <option key={h.id} value={h.id}>{h.code} · {h.type}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm text-gray-600 mt-3">
              Foto aufnehmen
              <input
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-sm text-gray-700"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const res = String(reader.result ?? '');
                    const base64 = res.includes(',') ? res.split(',')[1] : res;
                    setSurplusCreatePhotoBase64(base64);
                  };
                  reader.readAsDataURL(f);
                }}
              />
            </label>
            {surplusCreatePhotoBase64 && (
              <img
                alt="ÜZ Foto"
                src={`data:image/png;base64,${surplusCreatePhotoBase64}`}
                className="mt-3 max-w-full max-h-44 rounded border border-gray-200"
              />
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setSurplusCreateOpen(false)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="px-3 py-2 bg-[#1e40af] text-white rounded-lg disabled:opacity-50"
                disabled={!surplusCreateTourId || !surplusCreateHallLocationId || !surplusCreateDescription.trim()}
                onClick={async () => {
                  await api.post('/returns/surplus', {
                    tourId: surplusCreateTourId,
                    description: surplusCreateDescription,
                    weightKg: surplusCreateWeightKg,
                    packageCount: surplusCreatePackageCount,
                    photoBase64: surplusCreatePhotoBase64 ?? undefined,
                    scanCode: surplusCreateScanCode || undefined,
                    hallLocationId: surplusCreateHallLocationId,
                  });
                  await qc.invalidateQueries({ queryKey: ['returns', 'workstack', 'surplus'] });
                  await qc.invalidateQueries({ queryKey: ['status', 'badge-summary'] });
                  setSurplusCreateOpen(false);
                }}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {surplusMatchId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-4 shadow-lg">
            <h3 className="font-semibold text-lg">ÜZ manuell zuordnen</h3>
            <label className="block mt-3 text-sm text-gray-600">
              Sendungssuche (Nummer / Kunde)
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={surplusMatchSearch}
                onChange={(e) => setSurplusMatchSearch(e.target.value)}
                placeholder="z. B. S26-100001"
              />
            </label>
            <div className="mt-3 border rounded-lg p-3 bg-gray-50">
              {surplusShipmentSearchQuery.isLoading ? (
                <div className="text-sm text-gray-600">Suche…</div>
              ) : (surplusShipmentSearchQuery.data ?? []).length ? (
                <div className="space-y-2">
                  {(surplusShipmentSearchQuery.data ?? []).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="w-full text-left px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
                      onClick={async () => {
                        await api.patch(`/returns/surplus/${surplusMatchId}/match`, { shipmentId: row.id });
                        await qc.invalidateQueries({ queryKey: ['returns', 'workstack', 'surplus'] });
                        await qc.invalidateQueries({ queryKey: ['status', 'badge-summary'] });
                        setSurplusMatchId(null);
                        setSurplusMatchSearch('');
                      }}
                    >
                      {row.shipment_number}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">Keine Treffer.</div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setSurplusMatchId(null)}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {newLockShipmentId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-4 shadow-lg">
            <h3 className="font-semibold text-lg">Neue Sperre</h3>
            <label className="block mt-2 text-sm">
              Typ
              <select
                className="mt-1 w-full border rounded-lg px-2 py-2"
                value={newLockType}
                onChange={(e) => setNewLockType(e.target.value)}
              >
                {['ZOLL', 'ADR', 'ADRESSFEHLER', 'KLAERFALL', 'AVIS', 'VORKASSE', 'SONSTIGES'].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="block mt-2 text-sm">
              Grund
              <textarea
                className="mt-1 w-full border rounded-lg p-2 text-sm"
                value={newLockReason}
                onChange={(e) => setNewLockReason(e.target.value)}
              />
            </label>
            <label className="block mt-2 text-sm">
              Fällig bis (optional)
              <input
                type="datetime-local"
                className="mt-1 w-full border rounded-lg px-2 py-2"
                value={newLockDue}
                onChange={(e) => setNewLockDue(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setNewLockShipmentId(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="px-3 py-2 bg-[#1e40af] text-white rounded-lg"
                disabled={newLockMut.isPending}
                onClick={() => newLockMut.mutate()}
              >
                Sperren
              </button>
            </div>
          </div>
        </div>
      )}

      {escalateLockId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-4 shadow-lg">
            <h3 className="font-semibold text-lg">Eskalation</h3>
            <p className="text-sm text-gray-600 mt-1">User-ID (UUID) des Eskalationsziels</p>
            <input
              className="mt-2 w-full border rounded-lg px-3 py-2"
              value={escalateUserId}
              onChange={(e) => setEscalateUserId(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setEscalateLockId(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="px-3 py-2 bg-[#1e40af] text-white rounded-lg"
                disabled={!escalateUserId.trim() || escalateMut.isPending}
                onClick={() => escalateMut.mutate()}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MonitorTable({
  title,
  query,
}: {
  title: string;
  query: { data?: any[]; isLoading: boolean };
}) {
  const rows = query.data ?? [];
  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-2">
        {title} ({rows.length})
      </h2>
      {query.isLoading ? (
        <div className="animate-spin h-6 w-6 border-2 border-[#1e40af] border-t-transparent rounded-full" />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Nr.</th>
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Letzter Status</th>
                <th className="px-3 py-2">Lieferdatum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.shipment_number}</td>
                  <td className="px-3 py-2">
                    {r.customers?.name ?? r.business_partner?.name ?? '–'}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {r.addresses_shipments_loading_address_idToaddresses?.city ?? ''} →{' '}
                    {r.addresses_shipments_delivery_address_idToaddresses?.city ?? ''}
                  </td>
                  <td className="px-3 py-2">{r.last_event_type ?? '–'}</td>
                  <td className="px-3 py-2">
                    {r.delivery_date ? new Date(r.delivery_date).toLocaleDateString('de-DE') : '–'}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-gray-500">
                    Keine Einträge
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdvisoryCard({
  a,
  sn,
  deliv,
  onContact,
  onEmail,
  onConfirmed,
}: {
  a: any;
  sn: string;
  deliv: any;
  onContact: () => void;
  onEmail: () => void;
  onConfirmed: () => void;
}) {
  const [slotDate, setSlotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slotFrom, setSlotFrom] = useState('08:00');
  const [slotTo, setSlotTo] = useState('12:00');
  const [saving, setSaving] = useState(false);
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="font-semibold">
        {sn} · {a.shipments?.customers?.name ?? a.shipments?.business_partner?.name ?? '–'}
      </div>
      <div className="text-sm text-gray-600 mt-1">
        Zustellung:{' '}
        {a.shipments?.delivery_date
          ? new Date(a.shipments.delivery_date).toLocaleDateString('de-DE')
          : '–'}
      </div>
      <div className="text-sm mt-1">
        Empfänger: {deliv?.contact_name ?? '–'}
      </div>
      <div className="text-sm text-gray-700 mt-1">
        {deliv?.contact_phone ? `📞 ${deliv.contact_phone}` : ''}{' '}
        {deliv?.contact_email ? `✉ ${deliv.contact_email}` : ''}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" className="px-3 py-1.5 text-sm rounded-lg border border-gray-300" onClick={onContact}>
          Telefon ✓
        </button>
        <button type="button" className="px-3 py-1.5 text-sm rounded-lg border border-gray-300" onClick={onEmail}>
          E-Mail senden
        </button>
        {a.portal_url && (
          <a
            href={a.portal_url}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 inline-block"
          >
            Portal
          </a>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 items-end">
        <label className="text-xs text-gray-600">
          Datum
          <input
            type="date"
            className="block mt-1 border rounded px-2 py-1"
            value={slotDate}
            onChange={(e) => setSlotDate(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Von
          <input
            type="time"
            className="block mt-1 border rounded px-2 py-1"
            value={slotFrom}
            onChange={(e) => setSlotFrom(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Bis
          <input
            type="time"
            className="block mt-1 border rounded px-2 py-1"
            value={slotTo}
            onChange={(e) => setSlotTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={saving}
          className="px-3 py-2 bg-[#1e40af] text-white rounded-lg text-sm disabled:opacity-50"
          onClick={async () => {
            setSaving(true);
            try {
              await api.patch(`/status/advisories/${a.id}/confirm`, {
                scheduledDate: slotDate,
                timeFrom: slotFrom,
                timeTo: slotTo,
              });
              onConfirmed();
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? '…' : 'Bestätigen'}
        </button>
      </div>
    </div>
  );
}

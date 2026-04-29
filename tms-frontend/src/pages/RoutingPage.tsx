import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

type RoutingDirection = 'INBOUND' | 'OUTBOUND' | 'BOTH';
type DeliveryType = 'OWN_NV' | 'NETWORK_PARTNER' | 'CHARTER' | 'COOPERATOR';

const EU_COUNTRIES: { value: string; label: string }[] = [
  { value: 'AT', label: 'Österreich' },
  { value: 'BE', label: 'Belgien' },
  { value: 'BG', label: 'Bulgarien' },
  { value: 'HR', label: 'Kroatien' },
  { value: 'CY', label: 'Zypern' },
  { value: 'CZ', label: 'Tschechien' },
  { value: 'DK', label: 'Dänemark' },
  { value: 'EE', label: 'Estland' },
  { value: 'FI', label: 'Finnland' },
  { value: 'FR', label: 'Frankreich' },
  { value: 'DE', label: 'Deutschland' },
  { value: 'GR', label: 'Griechenland' },
  { value: 'HU', label: 'Ungarn' },
  { value: 'IE', label: 'Irland' },
  { value: 'IT', label: 'Italien' },
  { value: 'LV', label: 'Lettland' },
  { value: 'LT', label: 'Litauen' },
  { value: 'LU', label: 'Luxemburg' },
  { value: 'MT', label: 'Malta' },
  { value: 'NL', label: 'Niederlande' },
  { value: 'PL', label: 'Polen' },
  { value: 'PT', label: 'Portugal' },
  { value: 'RO', label: 'Rumänien' },
  { value: 'SE', label: 'Schweden' },
  { value: 'SI', label: 'Slowenien' },
  { value: 'SK', label: 'Slowakei' },
  { value: 'ES', label: 'Spanien' },
];

function deliveryTypeLabel(type?: string | null) {
  switch (type) {
    case 'OWN_NV':
      return 'Eigener NV';
    case 'NETWORK_PARTNER':
      return 'Netzwerk';
    case 'CHARTER':
      return 'Charter';
    case 'COOPERATOR':
      return 'Kooperator';
    default:
      return '—';
  }
}

function deliveryTypeColorClass(type?: string | null) {
  switch (type) {
    case 'OWN_NV':
      return 'text-green-700';
    case 'NETWORK_PARTNER':
      return 'text-blue-700';
    case 'CHARTER':
      return 'text-orange-600';
    case 'COOPERATOR':
      return 'text-purple-700';
    default:
      return 'text-gray-700';
  }
}

function formatDepartureDays(departureDays?: string | null) {
  const days = (departureDays ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  const set = new Set(days);

  const includes = (...xs: string[]) => xs.every((x) => set.has(x));
  if (includes('MON', 'TUE', 'WED', 'THU', 'FRI') && days.length === 5) return 'Mo-Fr';
  if (includes('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT') && days.length === 6) return 'Mo-Sa';

  const map: Record<string, string> = {
    MON: 'Mo',
    TUE: 'Di',
    WED: 'Mi',
    THU: 'Do',
    FRI: 'Fr',
    SAT: 'Sa',
    SUN: 'So',
  };
  return days.map((d) => map[d] ?? d).join(',');
}

function extractHHmm(t: unknown): string {
  const s = t == null ? '' : String(t);
  const m = s.match(/(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

function EUCountrySelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {EU_COUNTRIES.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

export default function RoutingPage() {
  const queryClient = useQueryClient();

  // ── Bereich 1: Routing Tester ─────────────────────────────────────
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('DE');
  const [direction, setDirection] = useState<RoutingDirection>('OUTBOUND');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testHasRun, setTestHasRun] = useState(false);

  const runTest = async () => {
    const z = zip.trim();
    const c = country.trim();
    if (!z || !c) return;

    setTestLoading(true);
    try {
      const { data } = await api.get('/routing/test', {
        params: { zip: z, country: c, direction },
      });
      setTestResult(data ?? null);
      setTestHasRun(true);
    } finally {
      setTestLoading(false);
    }
  };

  // ── Bereich 2: Routing Regeln ────────────────────────────────────
  const { data: routingRules = [] } = useQuery({
    queryKey: ['routing', 'rules'],
    queryFn: async () => api.get<any[]>('/routing/rules').then((r) => r.data),
  });

  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const sortedRules = useMemo(() => {
    const arr = [...routingRules];
    arr.sort((a, b) => {
      const pa = Number(a.priority ?? 0);
      const pb = Number(b.priority ?? 0);
      return sortDir === 'desc' ? pb - pa : pa - pb;
    });
    return arr;
  }, [routingRules, sortDir]);

  // Modals (Create/Edit)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteChecklist, setDeleteChecklist] = useState({
    understandsDeactivate: false,
    understandsAutoRoutingBehavior: false,
  });

  const emptyRuleForm = useMemo(
    () => ({
      rule_name: '',
      direction: 'OUTBOUND' as RoutingDirection,
      country_code: country,
      zip_from: '',
      zip_to: '',
      zip_prefix: '',
      delivery_type: 'NETWORK_PARTNER' as DeliveryType,
      partner_id: '',
      partner_name: '',
      gateway_name: '',
      gateway_zip: '',
      gateway_city: '',
      gateway_country: country,
      transit_days: 1,
      priority: 10,
      departure_days: [] as string[],
      departure_time: '',
      cutoff_time: '',
      hall_location_id: '',
      is_active: true,
      valid_from: '',
      valid_to: '',
    }),
    [country],
  );

  const [ruleForm, setRuleForm] = useState<any>(emptyRuleForm);

  // partner dropdown
  const { data: partners = [] } = useQuery({
    queryKey: ['routing', 'partners'],
    queryFn: async () =>
      api.get<any[]>('/masterdata/partners').then((r) => r.data),
  });

  // hall dropdown
  const { data: hallLocations = [] } = useQuery({
    queryKey: ['routing', 'hall_locations'],
    queryFn: async () => api.get<any[]>('/hall/locations').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        ...ruleForm,
        zip_from: ruleForm.zip_from?.trim() || null,
        zip_to: ruleForm.zip_to?.trim() || null,
        zip_prefix: ruleForm.zip_prefix?.trim() || null,
        partner_id: ruleForm.delivery_type === 'OWN_NV' ? null : (ruleForm.partner_id || null),
        partner_name: ruleForm.partner_name?.trim() || null,
        gateway_name: ruleForm.gateway_name?.trim() || null,
        gateway_zip: ruleForm.gateway_zip?.trim() || null,
        gateway_city: ruleForm.gateway_city?.trim() || null,
        gateway_country: ruleForm.gateway_country?.trim() || null,
        departure_days:
          ruleForm.departure_days?.length > 0 ? ruleForm.departure_days.join(',') : null,
        departure_time: ruleForm.departure_time?.trim() || null,
        cutoff_time: ruleForm.cutoff_time?.trim() || null,
        hall_location_id: ruleForm.hall_location_id?.trim() || null,
        valid_from: ruleForm.valid_from?.trim() || null,
        valid_to: ruleForm.valid_to?.trim() || null,
      };
      return api.post('/routing/rules', payload).then((r) => r.data);
    },
    onSuccess: async () => {
      setIsCreateOpen(false);
      setRuleForm(emptyRuleForm);
      await queryClient.invalidateQueries({ queryKey: ['routing', 'rules'] });
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return null;
      const payload: any = {
        ...ruleForm,
        zip_from: ruleForm.zip_from?.trim() || null,
        zip_to: ruleForm.zip_to?.trim() || null,
        zip_prefix: ruleForm.zip_prefix?.trim() || null,
        partner_id: ruleForm.delivery_type === 'OWN_NV' ? null : (ruleForm.partner_id || null),
        partner_name: ruleForm.partner_name?.trim() || null,
        gateway_name: ruleForm.gateway_name?.trim() || null,
        gateway_zip: ruleForm.gateway_zip?.trim() || null,
        gateway_city: ruleForm.gateway_city?.trim() || null,
        gateway_country: ruleForm.gateway_country?.trim() || null,
        departure_days:
          ruleForm.departure_days?.length > 0 ? ruleForm.departure_days.join(',') : null,
        departure_time: ruleForm.departure_time?.trim() || null,
        cutoff_time: ruleForm.cutoff_time?.trim() || null,
        hall_location_id: ruleForm.hall_location_id?.trim() || null,
        valid_from: ruleForm.valid_from?.trim() || null,
        valid_to: ruleForm.valid_to?.trim() || null,
      };

      return api.patch(`/routing/rules/${editingId}`, payload).then((r) => r.data);
    },
    onSuccess: async () => {
      setIsEditOpen(false);
      setIsCreateOpen(false);
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ['routing', 'rules'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!confirmDeleteId) return null;
      return api.delete(`/routing/rules/${confirmDeleteId}`).then((r) => r.data);
    },
    onSuccess: async () => {
      setConfirmDeleteId(null);
      setDeleteChecklist({ understandsDeactivate: false, understandsAutoRoutingBehavior: false });
      await queryClient.invalidateQueries({ queryKey: ['routing', 'rules'] });
    },
  });

  const openEdit = (rule: any) => {
    setEditingId(rule.id);
    setModalMode('edit');
    setRuleForm({
      ...emptyRuleForm,
      rule_name: rule.rule_name ?? '',
      direction: (rule.direction ?? 'OUTBOUND') as RoutingDirection,
      country_code: rule.country_code ?? country,
      zip_from: rule.zip_from ?? '',
      zip_to: rule.zip_to ?? '',
      zip_prefix: rule.zip_prefix ?? '',
      delivery_type: (rule.delivery_type ?? 'NETWORK_PARTNER') as DeliveryType,
      partner_id: rule.partner_id ?? '',
      partner_name: rule.partner_name ?? '',
      gateway_name: rule.gateway_name ?? '',
      gateway_zip: rule.gateway_zip ?? '',
      gateway_city: rule.gateway_city ?? '',
      gateway_country: rule.gateway_country ?? country,
      transit_days: rule.transit_days ?? 1,
      priority: rule.priority ?? 10,
      departure_days: rule.departure_days
        ? String(rule.departure_days)
            .split(',')
            .map((d: string) => d.trim())
            .filter(Boolean)
        : [],
      departure_time: rule.departure_time ? extractHHmm(rule.departure_time) : '',
      cutoff_time: rule.cutoff_time ? extractHHmm(rule.cutoff_time) : '',
      hall_location_id: rule.hall_location_id ?? '',
      is_active: rule.is_active ?? true,
      valid_from: rule.valid_from ? String(rule.valid_from).slice(0, 10) : '',
      valid_to: rule.valid_to ? String(rule.valid_to).slice(0, 10) : '',
    });
    setIsCreateOpen(false);
    setIsEditOpen(true);
  };

  const departureDaysChoices = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

  return (
    <main className="w-full flex-1 px-4 sm:px-6 py-4 bg-white min-h-full">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Routing</h1>

        {/* BEREICH 1: Routing Tester */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm mb-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="min-w-[10rem]">
              <label className="block text-xs text-gray-600 mb-1">PLZ</label>
              <input
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                placeholder=""
              />
            </div>

            <div className="min-w-[10rem]">
              <label className="block text-xs text-gray-600 mb-1">Land</label>
              <EUCountrySelect
                value={country}
                onChange={setCountry}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>

            <div className="min-w-[10rem]">
              <label className="block text-xs text-gray-600 mb-1">Richtung</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as RoutingDirection)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="INBOUND">INBOUND</option>
                <option value="OUTBOUND">OUTBOUND</option>
                <option value="BOTH">BOTH</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => void runTest()}
              disabled={testLoading}
              className="ml-auto rounded-md bg-[#1e40af] text-white px-3 py-2 text-sm disabled:opacity-60"
            >
              {testLoading ? 'Ermittele…' : 'Route ermitteln'}
            </button>
          </div>

          <div className="mt-4">
            {!testHasRun ? (
              <div className="text-sm text-gray-500">Ergebnis erscheint nach “Route ermitteln”.</div>
            ) : direction === 'BOTH' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {testResult?.inbound === null ? (
                  <div className="bg-orange-50 border border-orange-200 rounded p-3 text-xs text-orange-900">
                    ⚠ INBOUND: Keine Relation gefunden → Charter
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded p-3 text-xs text-gray-900">
                    <div className="font-semibold">🟢 INBOUND Route gefunden</div>
                    <div>Regel: {testResult.inbound.rule_name}</div>
                    <div>
                      Typ:{' '}
                      <span className={deliveryTypeColorClass(testResult.inbound.delivery_type)}>
                        {deliveryTypeLabel(testResult.inbound.delivery_type)}
                      </span>
                    </div>
                    <div>
                      Partner: {testResult.inbound.partner_name ? testResult.inbound.partner_name : '—'}
                    </div>
                    <div>
                      Gateway: {testResult.inbound.gateway_city ?? '—'}, {testResult.inbound.gateway_country ?? ''}
                    </div>
                    <div>{`Laufzeit: ${testResult.inbound.transit_days} Tag(e)`}</div>
                    <div>Hallenplatz: {testResult.inbound.hall_location_code ?? '—'}</div>
                    <div>
                      Abfahrt:{' '}
                      {formatDepartureDays(testResult.inbound.departure_days)} {testResult.inbound.departure_time ?? ''}
                    </div>
                  </div>
                )}

                {testResult?.outbound === null ? (
                  <div className="bg-orange-50 border border-orange-200 rounded p-3 text-xs text-orange-900">
                    ⚠ OUTBOUND: Keine Relation gefunden → Charter
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded p-3 text-xs text-gray-900">
                    <div className="font-semibold">🟢 OUTBOUND Route gefunden</div>
                    <div>Regel: {testResult.outbound.rule_name}</div>
                    <div>
                      Typ:{' '}
                      <span className={deliveryTypeColorClass(testResult.outbound.delivery_type)}>
                        {deliveryTypeLabel(testResult.outbound.delivery_type)}
                      </span>
                    </div>
                    <div>
                      Partner: {testResult.outbound.partner_name ? testResult.outbound.partner_name : '—'}
                    </div>
                    <div>
                      Gateway: {testResult.outbound.gateway_city ?? '—'}, {testResult.outbound.gateway_country ?? ''}
                    </div>
                    <div>{`Laufzeit: ${testResult.outbound.transit_days} Tag(e)`}</div>
                    <div>Hallenplatz: {testResult.outbound.hall_location_code ?? '—'}</div>
                    <div>
                      Abfahrt:{' '}
                      {formatDepartureDays(testResult.outbound.departure_days)} {testResult.outbound.departure_time ?? ''}
                    </div>
                  </div>
                )}
              </div>
            ) : testResult === null ? (
              <div className="bg-orange-50 border border-orange-200 rounded p-3 text-xs text-orange-900">
                ⚠ Keine Relation gefunden → Charter
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded p-3 text-xs text-gray-900">
                <div className="font-semibold">🟢 Route gefunden</div>
                <div>Regel: {testResult.rule_name}</div>
                <div>
                  Typ:{' '}
                  <span className={deliveryTypeColorClass(testResult.delivery_type)}>
                    {deliveryTypeLabel(testResult.delivery_type)}
                  </span>
                </div>
                <div>Partner: {testResult.partner_name ? testResult.partner_name : '—'}</div>
                <div>Gateway: {testResult.gateway_city ?? '—'}, {testResult.gateway_country ?? ''}</div>
                <div>{`Laufzeit: ${testResult.transit_days} Tag(e)`}</div>
                <div>Hallenplatz: {testResult.hall_location_code ?? '—'}</div>
                <div>
                  Abfahrt:{' '}
                  {formatDepartureDays(testResult.departure_days)} {testResult.departure_time ?? ''}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BEREICH 2: Regeln Tabelle */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="font-semibold text-gray-900">Routing-Regeln</div>
            <button
              type="button"
              onClick={() => {
                setRuleForm(emptyRuleForm);
                setModalMode('create');
                setIsCreateOpen(true);
                setIsEditOpen(false);
              }}
              className="rounded-md bg-[#1e40af] text-white px-3 py-2 text-sm"
            >
              Neue Regel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="text-gray-600">
                  <th
                    className="cursor-pointer select-none whitespace-nowrap border-b border-gray-200 py-2 pr-2"
                    onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                  >
                    Priorität {sortDir === 'desc' ? '↓' : '↑'}
                  </th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">Name</th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">Richtung</th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">Land</th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">PLZ von</th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">PLZ bis</th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">Prefix</th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">Typ</th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">Partner</th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">Gateway</th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">Laufzeit</th>
                  <th className="border-b border-gray-200 py-2 pr-2 whitespace-nowrap">Aktiv</th>
                  <th className="border-b border-gray-200 py-2 whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {sortedRules.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => openEdit(r)}
                  >
                    <td className="py-2 pr-2 whitespace-nowrap">{r.priority ?? ''}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.rule_name ?? '—'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.direction ?? '—'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.country_code ?? '—'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.zip_from ?? '—'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.zip_to ?? '—'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.zip_prefix ?? '—'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <span className={`font-semibold ${deliveryTypeColorClass(r.delivery_type)}`}>
                        {deliveryTypeLabel(r.delivery_type)}
                      </span>
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.partner_name ?? '—'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {r.gateway_city ?? '—'} {r.gateway_country ? `(${r.gateway_country})` : ''}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.transit_days ?? ''}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {r.is_active ? <span className="text-green-700 font-semibold">Ja</span> : <span className="text-gray-500">Nein</span>}
                    </td>
                    <td className="py-2 whitespace-nowrap text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(r);
                          }}
                          className="rounded-md border border-gray-200 px-2 py-1 text-[11px] bg-white hover:bg-gray-50"
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(r.id);
                            setDeleteChecklist({
                              understandsDeactivate: false,
                              understandsAutoRoutingBehavior: false,
                            });
                          }}
                          className="rounded-md border border-red-200 text-red-700 px-2 py-1 text-[11px] bg-white hover:bg-red-50"
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedRules.length === 0 && (
                  <tr>
                    <td colSpan={13} className="py-4 text-sm text-gray-500">
                      Keine Routing-Regeln vorhanden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl">
            <div className="p-4 border-b flex items-center justify-between gap-3">
              <div className="font-semibold text-gray-900">
                {modalMode === 'create' ? 'Neue Regel' : 'Regel bearbeiten'}
              </div>
              <button
                className="rounded-md border border-gray-200 px-2 py-1 text-sm"
                onClick={() => {
                  setIsCreateOpen(false);
                  setIsEditOpen(false);
                  setEditingId(null);
                  setModalMode('create');
                }}
              >
                Schließen
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              {[
                ['rule_name', 'Regelname'],
              ].map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs text-gray-600 mb-1">{label}</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm[k]}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, [k]: e.target.value }))}
                    placeholder=""
                  />
                </div>
              ))}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Richtung</label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.direction}
                    onChange={(e) =>
                      setRuleForm((f: any) => ({ ...f, direction: e.target.value }))
                    }
                  >
                    <option value="INBOUND">INBOUND</option>
                    <option value="OUTBOUND">OUTBOUND</option>
                    <option value="BOTH">BOTH</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Land</label>
                  <EUCountrySelect
                    value={ruleForm.country_code}
                    onChange={(v) => setRuleForm((f: any) => ({ ...f, country_code: v }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">PLZ von</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.zip_from}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, zip_from: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">PLZ bis</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.zip_to}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, zip_to: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Prefix</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.zip_prefix}
                    onChange={(e) =>
                      setRuleForm((f: any) => ({ ...f, zip_prefix: e.target.value }))
                    }
                    placeholder=""
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Zustelltyp</label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.delivery_type}
                    onChange={(e) =>
                      setRuleForm((f: any) => ({
                        ...f,
                        delivery_type: e.target.value,
                        partner_id: '',
                        partner_name: '',
                      }))
                    }
                  >
                    <option value="OWN_NV">OWN_NV</option>
                    <option value="NETWORK_PARTNER">NETWORK_PARTNER</option>
                    <option value="CHARTER">CHARTER</option>
                    <option value="COOPERATOR">COOPERATOR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Partner</label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.partner_id}
                    onChange={(e) => {
                      const id = e.target.value;
                      const p = partners.find((x) => x.id === id);
                      setRuleForm((f: any) => ({
                        ...f,
                        partner_id: id,
                        partner_name: p?.name ?? p?.partner_number ?? '',
                      }));
                    }}
                    disabled={ruleForm.delivery_type === 'OWN_NV' || ruleForm.delivery_type === 'CHARTER'}
                  >
                    <option value="">—</option>
                    {partners.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name ?? p.partner_number}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gateway Name</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.gateway_name}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, gateway_name: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gateway PLZ</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.gateway_zip}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, gateway_zip: e.target.value }))}
                    placeholder=""
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gateway Stadt</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.gateway_city}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, gateway_city: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gateway Land</label>
                  <EUCountrySelect
                    value={ruleForm.gateway_country}
                    onChange={(v) => setRuleForm((f: any) => ({ ...f, gateway_country: v }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Laufzeit Tage</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="number"
                    value={ruleForm.transit_days}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, transit_days: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Priorität</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="number"
                    value={ruleForm.priority}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, priority: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Hallenplatz</label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.hall_location_id}
                    onChange={(e) =>
                      setRuleForm((f: any) => ({ ...f, hall_location_id: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {hallLocations.map((h: any) => (
                      <option key={h.id} value={h.id}>
                        {h.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Abfahrtstage (Mo-Sa)</label>
                <div className="flex flex-wrap gap-2">
                  {departureDaysChoices.map((d) => {
                    const checked = ruleForm.departure_days.includes(d);
                    return (
                      <label
                        key={d}
                        className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer bg-white"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setRuleForm((f: any) => {
                              const next = new Set(f.departure_days);
                              if (e.target.checked) next.add(d);
                              else next.delete(d);
                              return { ...f, departure_days: Array.from(next) };
                            });
                          }}
                        />
                        {d}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Annahmeschluss Uhrzeit</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="time"
                    value={ruleForm.cutoff_time}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, cutoff_time: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Abfahrtszeit</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="time"
                    value={ruleForm.departure_time}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, departure_time: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gültig von</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="date"
                    value={ruleForm.valid_from}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, valid_from: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gültig bis</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="date"
                    value={ruleForm.valid_to}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, valid_to: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ruleForm.is_active}
                  onChange={(e) => setRuleForm((f: any) => ({ ...f, is_active: e.target.checked }))}
                />
                <span>Aktiv</span>
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setIsEditOpen(false);
                    setEditingId(null);
                    setModalMode('create');
                  }}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => (modalMode === 'create' ? createMutation.mutate() : editMutation.mutate())}
                  disabled={modalMode === 'create' ? createMutation.isPending : editMutation.isPending}
                  className="rounded-md bg-[#1e40af] text-white px-3 py-2 text-sm disabled:opacity-60"
                >
                  {modalMode === 'create'
                    ? createMutation.isPending
                      ? 'Speichere…'
                      : 'Speichern'
                    : editMutation.isPending
                      ? 'Speichere…'
                      : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl">
            <div className="p-4 border-b flex items-center justify-between gap-3">
              <div className="font-semibold text-gray-900">Regel bearbeiten</div>
              <button
                className="rounded-md border border-gray-200 px-2 py-1 text-sm"
                onClick={() => {
                  setIsEditOpen(false);
                  setEditingId(null);
                  setModalMode('create');
                }}
              >
                Schließen
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              {[
                ['rule_name', 'Regelname'],
              ].map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs text-gray-600 mb-1">{label}</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm[k]}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, [k]: e.target.value }))}
                    placeholder=""
                  />
                </div>
              ))}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Richtung</label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.direction}
                    onChange={(e) =>
                      setRuleForm((f: any) => ({ ...f, direction: e.target.value }))
                    }
                  >
                    <option value="INBOUND">INBOUND</option>
                    <option value="OUTBOUND">OUTBOUND</option>
                    <option value="BOTH">BOTH</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Land</label>
                  <EUCountrySelect
                    value={ruleForm.country_code}
                    onChange={(v) => setRuleForm((f: any) => ({ ...f, country_code: v }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">PLZ von</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.zip_from}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, zip_from: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">PLZ bis</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.zip_to}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, zip_to: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Prefix</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.zip_prefix}
                    onChange={(e) =>
                      setRuleForm((f: any) => ({ ...f, zip_prefix: e.target.value }))
                    }
                    placeholder=""
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Zustelltyp</label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.delivery_type}
                    onChange={(e) =>
                      setRuleForm((f: any) => ({
                        ...f,
                        delivery_type: e.target.value,
                        partner_id: '',
                        partner_name: '',
                      }))
                    }
                  >
                    <option value="OWN_NV">OWN_NV</option>
                    <option value="NETWORK_PARTNER">NETWORK_PARTNER</option>
                    <option value="CHARTER">CHARTER</option>
                    <option value="COOPERATOR">COOPERATOR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Partner</label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.partner_id}
                    onChange={(e) => {
                      const id = e.target.value;
                      const p = partners.find((x) => x.id === id);
                      setRuleForm((f: any) => ({
                        ...f,
                        partner_id: id,
                        partner_name: p?.name ?? p?.partner_number ?? '',
                      }));
                    }}
                    disabled={ruleForm.delivery_type === 'OWN_NV' || ruleForm.delivery_type === 'CHARTER'}
                  >
                    <option value="">—</option>
                    {partners.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name ?? p.partner_number}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gateway Name</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.gateway_name}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, gateway_name: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gateway PLZ</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.gateway_zip}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, gateway_zip: e.target.value }))}
                    placeholder=""
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gateway Stadt</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.gateway_city}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, gateway_city: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gateway Land</label>
                  <EUCountrySelect
                    value={ruleForm.gateway_country}
                    onChange={(v) => setRuleForm((f: any) => ({ ...f, gateway_country: v }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Laufzeit Tage</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="number"
                    value={ruleForm.transit_days}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, transit_days: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Priorität</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="number"
                    value={ruleForm.priority}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, priority: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Hallenplatz</label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    value={ruleForm.hall_location_id}
                    onChange={(e) =>
                      setRuleForm((f: any) => ({ ...f, hall_location_id: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {hallLocations.map((h: any) => (
                      <option key={h.id} value={h.id}>
                        {h.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Abfahrtstage (Mo-Sa)</label>
                <div className="flex flex-wrap gap-2">
                  {departureDaysChoices.map((d) => {
                    const checked = ruleForm.departure_days.includes(d);
                    return (
                      <label
                        key={d}
                        className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer bg-white"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setRuleForm((f: any) => {
                              const next = new Set(f.departure_days);
                              if (e.target.checked) next.add(d);
                              else next.delete(d);
                              return { ...f, departure_days: Array.from(next) };
                            });
                          }}
                        />
                        {d}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Annahmeschluss Uhrzeit</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="time"
                    value={ruleForm.cutoff_time}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, cutoff_time: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Abfahrtszeit</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="time"
                    value={ruleForm.departure_time}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, departure_time: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gültig von</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="date"
                    value={ruleForm.valid_from}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, valid_from: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Gültig bis</label>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5"
                    type="date"
                    value={ruleForm.valid_to}
                    onChange={(e) => setRuleForm((f: any) => ({ ...f, valid_to: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ruleForm.is_active}
                  onChange={(e) => setRuleForm((f: any) => ({ ...f, is_active: e.target.checked }))}
                />
                <span>Aktiv</span>
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditOpen(false);
                    setEditingId(null);
                    setModalMode('create');
                  }}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => editMutation.mutate()}
                  disabled={editMutation.isPending}
                  className="rounded-md bg-[#1e40af] text-white px-3 py-2 text-sm disabled:opacity-60"
                >
                  {editMutation.isPending ? 'Speichere…' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-4">
            <div className="font-semibold text-gray-900 mb-2">Regel deaktivieren?</div>
            <div className="text-sm text-gray-600 mb-4 space-y-2">
              <div>
                Diese Aktion setzt `is_active = false`. Die Regel bleibt in der DB erhalten.
              </div>
              <label className="flex items-start gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={deleteChecklist.understandsDeactivate}
                  onChange={(e) =>
                    setDeleteChecklist((c) => ({ ...c, understandsDeactivate: e.target.checked }))
                  }
                  className="mt-1"
                />
                Ich verstehe, dass die Regel dadurch für künftige Routing-Entscheidungen nicht mehr berücksichtigt wird.
              </label>
              <label className="flex items-start gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={deleteChecklist.understandsAutoRoutingBehavior}
                  onChange={(e) =>
                    setDeleteChecklist((c) => ({
                      ...c,
                      understandsAutoRoutingBehavior: e.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                Ich verstehe, dass bestehende Sendungen nur dann neu geroutet werden, wenn sie erneut gespeichert/geändert oder manuell geroutet werden.
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
                onClick={() => {
                  setConfirmDeleteId(null);
                  setDeleteChecklist({
                    understandsDeactivate: false,
                    understandsAutoRoutingBehavior: false,
                  });
                }}
              >
                Abbrechen
              </button>
              <button
                className="rounded-md bg-red-600 text-white px-3 py-2 text-sm"
                onClick={() => deleteMutation.mutate()}
                disabled={
                  deleteMutation.isPending ||
                  !deleteChecklist.understandsDeactivate ||
                  !deleteChecklist.understandsAutoRoutingBehavior
                }
              >
                {deleteMutation.isPending ? 'Deaktiviere…' : 'Deaktivieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


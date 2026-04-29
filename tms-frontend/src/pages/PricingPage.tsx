import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import CostsPage from './CostsPage';

type SubCondition = {
  id: string;
  subcontractor_id: string;
  condition_type: string;
  rate_per_stop?: string | number | null;
  rate_per_day?: string | number | null;
  rate_per_km?: string | number | null;
  min_stops?: number | null;
  max_stops?: number | null;
  rate_flat?: string | number | null;
  rate_per_ldm?: string | number | null;
  rate_per_kg?: string | number | null;
  min_ldm?: string | number | null;
  min_charge?: string | number | null;
  meeting_rate?: string | number | null;
  roundtrip_rate?: string | number | null;
  fuel_surcharge_pct?: string | number | null;
  valid_from?: string;
  valid_to?: string | null;
  is_active?: boolean | null;
  relation_id?: string | null;
  subcontractors?: { name: string };
  relations?: { code?: string; name?: string } | null;
};

type CustomerTariff = {
  id: string;
  customer_id?: string | null;
  partner_id?: string | null;
  origin_country?: string | null;
  origin_zip_prefix?: string | null;
  dest_country: string;
  dest_zip_prefix?: string | null;
  rate_type: string;
  rate: string | number;
  min_charge?: string | number | null;
  priority?: number | null;
  valid_from?: string;
  valid_to?: string | null;
  is_active?: boolean | null;
  customers?: { name: string } | null;
  business_partners?: { name: string } | null;
};

type PartnerRate = {
  id: string;
  partner_id: string;
  rate_type: string;
  zone_number?: number | null;
  zone_km_from?: number | null;
  zone_km_to?: number | null;
  zip_prefix?: string | null;
  country_code?: string | null;
  rate_per_shipment?: string | number | null;
  rate_per_100kg?: string | number | null;
  rate_per_ldm?: string | number | null;
  min_charge?: string | number | null;
  handling_fee?: string | number | null;
  business_partners?: { name: string };
};

type DailyConfigRow = {
  id: string;
  relation_id: string | null;
  base_margin_pct?: string | number | null;
  market_delta_factor?: string | number | null;
  manual_surcharge_pct?: string | number | null;
  timocom_weight?: string | number | null;
  dat_weight?: string | number | null;
  internal_weight?: string | number | null;
};

function n(v: unknown): number {
  if (v == null || v === '') return 0;
  return Number(v);
}

function fmtEur(v: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v);
}

function fmtDate(s?: string | null) {
  if (!s) return '–';
  try {
    return new Date(s).toLocaleDateString('de-DE');
  } catch {
    return s;
  }
}

function SubConditionEditDialog({
  condition,
  subcontractors,
  relations,
  onClose,
  onSave,
  pending,
}: {
  condition: SubCondition;
  subcontractors: { id: string; name: string }[];
  relations: { id: string; code?: string; name?: string }[];
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const isMain = condition.condition_type === 'MAIN_CARRIAGE';
  const [subId, setSubId] = useState(condition.subcontractor_id);
  const [relId, setRelId] = useState(condition.relation_id ?? '');
  const [f, setF] = useState<Record<string, string>>({});

  useEffect(() => {
    setSubId(condition.subcontractor_id);
    setRelId(condition.relation_id ?? '');
    setF({
      rate_per_stop: String(condition.rate_per_stop ?? ''),
      rate_per_day: String(condition.rate_per_day ?? ''),
      rate_per_km: String(condition.rate_per_km ?? ''),
      min_stops: String(condition.min_stops ?? ''),
      max_stops: String(condition.max_stops ?? ''),
      min_charge: String(condition.min_charge ?? ''),
      meeting_rate: String(condition.meeting_rate ?? ''),
      roundtrip_rate: String(condition.roundtrip_rate ?? ''),
      fuel_surcharge_pct: String(condition.fuel_surcharge_pct ?? ''),
      rate_flat: String(condition.rate_flat ?? ''),
      rate_per_ldm: String(condition.rate_per_ldm ?? ''),
      rate_per_kg: String(condition.rate_per_kg ?? ''),
      min_ldm: String(condition.min_ldm ?? ''),
      valid_from: condition.valid_from ? String(condition.valid_from).slice(0, 10) : '',
      valid_to: condition.valid_to ? String(condition.valid_to).slice(0, 10) : '',
      is_active: condition.is_active === false ? 'false' : 'true',
    });
  }, [condition]);

  function submit() {
    const base: Record<string, unknown> = {
      subcontractor_id: subId,
      relation_id: relId || null,
      is_active: f.is_active !== 'false',
      valid_from: f.valid_from || null,
      valid_to: f.valid_to || null,
      fuel_surcharge_pct: n(f.fuel_surcharge_pct) || 0,
      min_charge: n(f.min_charge) || 0,
    };
    if (isMain) {
      Object.assign(base, {
        rate_flat: f.rate_flat ? n(f.rate_flat) : null,
        rate_per_ldm: f.rate_per_ldm ? n(f.rate_per_ldm) : null,
        rate_per_kg: f.rate_per_kg ? n(f.rate_per_kg) : null,
        rate_per_km: f.rate_per_km ? n(f.rate_per_km) : null,
        min_ldm: f.min_ldm ? n(f.min_ldm) : null,
      });
    } else {
      Object.assign(base, {
        rate_per_stop: f.rate_per_stop ? n(f.rate_per_stop) : null,
        rate_per_day: f.rate_per_day ? n(f.rate_per_day) : null,
        rate_per_km: f.rate_per_km ? n(f.rate_per_km) : null,
        min_stops: Math.floor(n(f.min_stops)) || 1,
        max_stops: f.max_stops ? Math.floor(n(f.max_stops)) : null,
        meeting_rate: f.meeting_rate ? n(f.meeting_rate) : null,
        roundtrip_rate: f.roundtrip_rate ? n(f.roundtrip_rate) : null,
      });
    }
    onSave(base);
  }

  const field = (k: string, label: string) => (
    <label key={k} className="block">
      <span className="text-gray-600 text-sm">{label}</span>
      <input
        className="mt-0.5 w-full border rounded px-2 py-1 text-sm"
        value={f[k] ?? ''}
        onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900 mb-3">
          Kondition bearbeiten ({condition.condition_type})
        </h3>
        <div className="space-y-2 text-sm">
          <label className="block">
            <span className="text-gray-600">Subunternehmer *</span>
            <select
              className="mt-0.5 w-full border rounded px-2 py-1"
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
            >
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {isMain && (
            <label className="block">
              <span className="text-gray-600">Relation (optional)</span>
              <select
                className="mt-0.5 w-full border rounded px-2 py-1"
                value={relId}
                onChange={(e) => setRelId(e.target.value)}
              >
                <option value="">Alle Relationen</option>
                {relations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code ?? r.name ?? r.id}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!isMain && (
            <>
              {field('rate_per_stop', '€/Stopp')}
              {field('rate_per_day', '€/Tag')}
              {field('rate_per_km', '€/km')}
              {field('min_stops', 'Min. Stopps')}
              {field('max_stops', 'Max. Stopps')}
              {field('meeting_rate', 'Meeting €')}
              {field('roundtrip_rate', 'Roundtrip €')}
            </>
          )}
          {isMain && (
            <>
              {field('rate_flat', 'Pauschal €')}
              {field('rate_per_ldm', '€/ldm')}
              {field('rate_per_kg', '€/kg')}
              {field('rate_per_km', '€/km')}
              {field('min_ldm', 'Min. ldm')}
            </>
          )}
          {field('min_charge', 'Mindest €')}
          {field('fuel_surcharge_pct', 'Diesel %')}
          {field('valid_from', 'Gültig ab')}
          {field('valid_to', 'Gültig bis')}
          <label className="block">
            <span className="text-gray-600">Aktiv</span>
            <select
              className="mt-0.5 w-full border rounded px-2 py-1"
              value={f.is_active ?? 'true'}
              onChange={(e) => setF((p) => ({ ...p, is_active: e.target.value }))}
            >
              <option value="true">Ja</option>
              <option value="false">Nein</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="px-3 py-1.5 border rounded" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!subId || pending}
            className="px-3 py-1.5 bg-[#1e40af] text-white rounded disabled:opacity-50"
            onClick={submit}
          >
            {pending ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

function tariffRowClass(t: CustomerTariff): string {
  const cust = !!t.customer_id;
  const len = (t.dest_zip_prefix ?? '').trim().length;
  if (cust && len >= 3) return 'bg-blue-900 text-white';
  if (cust && len === 2) return 'bg-blue-600 text-white';
  if (!cust && len >= 3) return 'bg-gray-700 text-white';
  if (!cust && len === 2) return 'bg-gray-500 text-white';
  if (cust) return 'bg-blue-100';
  return 'bg-gray-100';
}

export default function PricingPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(0);
  const [editSub, setEditSub] = useState<SubCondition | null>(null);
  const [subModal, setSubModal] = useState<'pre' | 'main' | null>(null);
  const [tariffModal, setTariffModal] = useState(false);
  const [partnerRateModal, setPartnerRateModal] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<string[]>([]);
  const [tariffCustomerFilter, setTariffCustomerFilter] = useState<string>('');
  const [partnerFilter, setPartnerFilter] = useState<string>('');
  useEffect(() => {
    if (searchParams.get('kosten') === '1') {
      setTab(4);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [partnerImportResult, setPartnerImportResult] = useState<{
    imported: number;
    skipped: number;
    skippedEmpty?: number;
    skippedUnchanged?: number;
    skippedIrrelevant?: number;
    errors: string[];
  } | null>(null);

  const [calcOrigin, setCalcOrigin] = useState('DE');
  const [calcDest, setCalcDest] = useState('DE');
  const [calcLdm, setCalcLdm] = useState('13.6');
  const [calcKg, setCalcKg] = useState('1200');
  const [calcStops, setCalcStops] = useState('3');

  const { data: subConditions = [] } = useQuery({
    queryKey: ['pricing', 'sub-conditions'],
    queryFn: async () => {
      const { data } = await api.get<SubCondition[]>('/pricing/sub-conditions');
      return data;
    },
  });

  const { data: subcontractors = [] } = useQuery({
    queryKey: ['subcontractors'],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; name: string }[]>('/subcontractors');
      return data;
    },
  });

  const { data: relations = [] } = useQuery({
    queryKey: ['relations'],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; code?: string; name?: string }[]>('/relations');
      return data;
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'pricing'],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; name: string }[]>('/customers');
      return data;
    },
  });

  const { data: partners = [] } = useQuery({
    queryKey: ['masterdata-partners', 'pricing'],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; name: string }[]>('/masterdata/partners');
      return data;
    },
  });

  const tariffListKey =
    tariffCustomerFilter === '__all__' || !tariffCustomerFilter
      ? undefined
      : tariffCustomerFilter || undefined;

  const { data: customerTariffs = [] } = useQuery({
    queryKey: ['pricing', 'customer-tariffs', tariffListKey ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get<CustomerTariff[]>('/pricing/customer-tariffs', {
        params: tariffListKey ? { customerId: tariffListKey } : {},
      });
      return data;
    },
  });

  const { data: partnerRates = [] } = useQuery({
    queryKey: ['pricing', 'partner-rates', partnerFilter],
    queryFn: async () => {
      const { data } = await api.get<PartnerRate[]>('/pricing/partner-rates', {
        params: partnerFilter ? { partnerId: partnerFilter } : {},
      });
      return data;
    },
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['pricing', 'config'],
    queryFn: async () => {
      const { data } = await api.get<DailyConfigRow[]>('/pricing/config');
      return data;
    },
  });

  const globalConfig = useMemo(
    () => configs.find((c) => c.relation_id == null) ?? configs[0],
    [configs],
  );

  const { data: marketRates } = useQuery({
    queryKey: ['pricing', 'market-rates'],
    queryFn: async () => {
      const { data } = await api.get('/pricing/market-rates');
      return data as {
        timocom: { connected: boolean; hint: string };
        dat: { connected: boolean; hint: string };
        internal: { sampleShipmentsLast90Days: number; hint: string };
      };
    },
  });

  const { data: calcResult, isFetching: calcLoading } = useQuery({
    queryKey: ['pricing', 'daily-preview', calcOrigin, calcDest, calcLdm, calcKg, calcStops],
    queryFn: async () => {
      const { data } = await api.post('/pricing/daily-price/preview', {
        originCountry: calcOrigin,
        destCountry: calcDest,
        ldm: n(calcLdm),
        weightKg: n(calcKg),
        stopCount: Math.max(1, Math.floor(n(calcStops)) || 3),
      });
      return data as Record<string, unknown>;
    },
    enabled: tab === 3,
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (body: Record<string, number>) => {
      await api.patch('/pricing/config', body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing', 'config'] }),
  });

  const patchSubMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      await api.patch(`/pricing/sub-conditions/${id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing', 'sub-conditions'] });
      setEditSub(null);
    },
  });

  const [cfgLocal, setCfgLocal] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!globalConfig) return;
    const keys = [
      'base_margin_pct',
      'market_delta_factor',
      'manual_surcharge_pct',
      'timocom_weight',
      'dat_weight',
      'internal_weight',
    ] as const;
    const next: Record<string, string> = {};
    for (const k of keys) next[k] = String(n(globalConfig[k]));
    setCfgLocal(next);
  }, [globalConfig]);

  const preRows = subConditions.filter((c) =>
    ['PRE_CARRIAGE', 'MEETING', 'ROUNDTRIP'].includes(c.condition_type),
  );
  const mainRows = subConditions.filter((c) => c.condition_type === 'MAIN_CARRIAGE');

  function SubConditionForm({ kind }: { kind: 'pre' | 'main' }) {
    const [subId, setSubId] = useState('');
    const [relId, setRelId] = useState('');
    const [ctype, setCtype] = useState<'PRE_CARRIAGE' | 'MEETING' | 'ROUNDTRIP' | 'MAIN_CARRIAGE'>(
      kind === 'pre' ? 'PRE_CARRIAGE' : 'MAIN_CARRIAGE',
    );
    const [rateTypeFields, setRateTypeFields] = useState<Record<string, string>>({});

    const createMut = useMutation({
      mutationFn: async () => {
        const base: Record<string, unknown> = {
          subcontractor_id: subId,
          condition_type: ctype,
          relation_id: relId || null,
          is_active: true,
          valid_from: new Date().toISOString().slice(0, 10),
        };
        if (kind === 'pre') {
          Object.assign(base, {
            rate_per_stop: n(rateTypeFields.rate_per_stop) || null,
            rate_per_day: n(rateTypeFields.rate_per_day) || null,
            rate_per_km: n(rateTypeFields.rate_per_km) || null,
            min_stops: Math.floor(n(rateTypeFields.min_stops)) || 1,
            max_stops: rateTypeFields.max_stops ? Math.floor(n(rateTypeFields.max_stops)) : null,
            min_charge: n(rateTypeFields.min_charge) || 0,
            meeting_rate: n(rateTypeFields.meeting_rate) || null,
            roundtrip_rate: n(rateTypeFields.roundtrip_rate) || null,
            fuel_surcharge_pct: n(rateTypeFields.fuel_surcharge_pct) || 0,
          });
        } else {
          Object.assign(base, {
            rate_flat: n(rateTypeFields.rate_flat) || null,
            rate_per_ldm: n(rateTypeFields.rate_per_ldm) || null,
            rate_per_kg: n(rateTypeFields.rate_per_kg) || null,
            rate_per_km: n(rateTypeFields.rate_per_km) || null,
            min_ldm: n(rateTypeFields.min_ldm) || null,
            min_charge: n(rateTypeFields.min_charge) || 0,
            fuel_surcharge_pct: n(rateTypeFields.fuel_surcharge_pct) || 0,
          });
        }
        await api.post('/pricing/sub-conditions', base);
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['pricing', 'sub-conditions'] });
        setSubModal(null);
      },
    });

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSubModal(null)}>
        <div
          className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-semibold text-gray-900 mb-3">
            {kind === 'pre' ? 'Neue Vorlauf-Kondition' : 'Neue Hauptlauf-Kondition'}
          </h3>
          <div className="space-y-2 text-sm">
            <label className="block">
              <span className="text-gray-600">Subunternehmer *</span>
              <select
                className="mt-0.5 w-full border rounded px-2 py-1"
                value={subId}
                onChange={(e) => setSubId(e.target.value)}
              >
                <option value="">—</option>
                {subcontractors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {kind === 'pre' && (
              <label className="block">
                <span className="text-gray-600">Typ</span>
                <select
                  className="mt-0.5 w-full border rounded px-2 py-1"
                  value={ctype}
                  onChange={(e) =>
                    setCtype(e.target.value as 'PRE_CARRIAGE' | 'MEETING' | 'ROUNDTRIP' | 'MAIN_CARRIAGE')
                  }
                >
                  <option value="PRE_CARRIAGE">PRE_CARRIAGE</option>
                  <option value="MEETING">MEETING</option>
                  <option value="ROUNDTRIP">ROUNDTRIP</option>
                </select>
              </label>
            )}
            {kind === 'main' && (
              <label className="block">
                <span className="text-gray-600">Relation (optional)</span>
                <select
                  className="mt-0.5 w-full border rounded px-2 py-1"
                  value={relId}
                  onChange={(e) => setRelId(e.target.value)}
                >
                  <option value="">Alle Relationen</option>
                  {relations.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code ?? r.name ?? r.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {kind === 'pre' && ctype === 'PRE_CARRIAGE' && (
              <>
                {(['rate_per_stop', 'rate_per_day', 'rate_per_km', 'min_charge', 'max_stops', 'min_stops', 'fuel_surcharge_pct'] as const).map(
                  (k) => (
                    <label key={k} className="block">
                      <span className="text-gray-600">{k}</span>
                      <input
                        className="mt-0.5 w-full border rounded px-2 py-1"
                        value={rateTypeFields[k] ?? ''}
                        onChange={(e) => setRateTypeFields((p) => ({ ...p, [k]: e.target.value }))}
                      />
                    </label>
                  ),
                )}
              </>
            )}
            {kind === 'pre' && ctype === 'MEETING' && (
              <label className="block">
                <span className="text-gray-600">meeting_rate</span>
                <input
                  className="mt-0.5 w-full border rounded px-2 py-1"
                  value={rateTypeFields.meeting_rate ?? ''}
                  onChange={(e) => setRateTypeFields((p) => ({ ...p, meeting_rate: e.target.value }))}
                />
              </label>
            )}
            {kind === 'pre' && ctype === 'ROUNDTRIP' && (
              <label className="block">
                <span className="text-gray-600">roundtrip_rate</span>
                <input
                  className="mt-0.5 w-full border rounded px-2 py-1"
                  value={rateTypeFields.roundtrip_rate ?? ''}
                  onChange={(e) => setRateTypeFields((p) => ({ ...p, roundtrip_rate: e.target.value }))}
                />
              </label>
            )}
            {kind === 'main' && (
              <>
                {(['rate_flat', 'rate_per_ldm', 'rate_per_kg', 'rate_per_km', 'min_ldm', 'min_charge', 'fuel_surcharge_pct'] as const).map(
                  (k) => (
                    <label key={k} className="block">
                      <span className="text-gray-600">{k}</span>
                      <input
                        className="mt-0.5 w-full border rounded px-2 py-1"
                        value={rateTypeFields[k] ?? ''}
                        onChange={(e) => setRateTypeFields((p) => ({ ...p, [k]: e.target.value }))}
                      />
                    </label>
                  ),
                )}
              </>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="px-3 py-1.5 border rounded" onClick={() => setSubModal(null)}>
              Abbrechen
            </button>
            <button
              type="button"
              disabled={!subId || createMut.isPending}
              className="px-3 py-1.5 bg-[#1e40af] text-white rounded disabled:opacity-50"
              onClick={() => createMut.mutate()}
            >
              Speichern
            </button>
          </div>
        </div>
      </div>
    );
  }

  function TariffCreateModal() {
    const [f, setF] = useState<Record<string, string>>({ dest_country: 'DE', rate_type: 'PER_LDM' });
    const m = useMutation({
      mutationFn: async () => {
        await api.post('/pricing/customer-tariffs', {
          customer_id: f.customer_id || null,
          partner_id: f.partner_id || null,
          origin_country: f.origin_country || null,
          origin_zip_prefix: f.origin_zip_prefix || null,
          dest_country: f.dest_country,
          dest_zip_prefix: f.dest_zip_prefix || null,
          rate_type: f.rate_type,
          rate: n(f.rate),
          min_charge: n(f.min_charge),
          fuel_surcharge_pct: n(f.fuel_surcharge_pct),
          adr_surcharge: n(f.adr_surcharge),
          priority: Math.floor(n(f.priority)) || 10,
          valid_from: f.valid_from || new Date().toISOString().slice(0, 10),
          valid_to: f.valid_to || null,
          is_active: true,
        });
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['pricing', 'customer-tariffs'] });
        setTariffModal(false);
      },
    });
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setTariffModal(false)}>
        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-4 space-y-2 text-sm" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-semibold">Neuer Kundentarif</h3>
          {(
            [
              ['customer_id', 'Kunde UUID (optional)'],
              ['origin_country', 'Von-Land'],
              ['origin_zip_prefix', 'Von-PLZ Prefix'],
              ['dest_country', 'Nach-Land *'],
              ['dest_zip_prefix', 'Nach-PLZ Prefix'],
              ['rate_type', 'PER_100KG | PER_LDM | PER_SHIPMENT | FLAT'],
              ['rate', 'Rate *'],
              ['min_charge', 'Mindest'],
              ['fuel_surcharge_pct', 'Diesel %'],
              ['adr_surcharge', 'ADR €'],
              ['priority', 'Priorität'],
              ['valid_from', 'Gültig ab'],
              ['valid_to', 'Gültig bis'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="block">
              <span className="text-gray-600">{label}</span>
              <input
                className="mt-0.5 w-full border rounded px-2 py-1"
                value={f[k] ?? ''}
                onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))}
              />
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-3 py-1.5 border rounded" onClick={() => setTariffModal(false)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="px-3 py-1.5 bg-[#1e40af] text-white rounded"
              disabled={m.isPending}
              onClick={() => m.mutate()}
            >
              Anlegen
            </button>
          </div>
        </div>
      </div>
    );
  }

  function PartnerRateModal() {
    const [f, setF] = useState<Record<string, string>>({ rate_type: 'ZONE' });
    const m = useMutation({
      mutationFn: async () => {
        await api.post('/pricing/partner-rates', {
          partner_id: f.partner_id,
          rate_type: f.rate_type,
          zone_number: f.zone_number ? Math.floor(n(f.zone_number)) : null,
          zone_km_from: f.zone_km_from ? Math.floor(n(f.zone_km_from)) : null,
          zone_km_to: f.zone_km_to ? Math.floor(n(f.zone_km_to)) : null,
          zip_prefix: f.zip_prefix || null,
          country_code: f.country_code || null,
          rate_per_shipment: n(f.rate_per_shipment),
          rate_per_100kg: n(f.rate_per_100kg),
          rate_per_ldm: n(f.rate_per_ldm),
          min_charge: n(f.min_charge),
          handling_fee: n(f.handling_fee),
          is_active: true,
          valid_from: new Date().toISOString().slice(0, 10),
        });
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['pricing', 'partner-rates'] });
        setPartnerRateModal(false);
      },
    });
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={() => setPartnerRateModal(false)}
      >
        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-4 space-y-2 text-sm" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-semibold">Partner-Nachlauf</h3>
          <label className="block">
            Partner *
            <select
              className="mt-0.5 w-full border rounded px-2 py-1"
              value={f.partner_id ?? ''}
              onChange={(e) => setF((p) => ({ ...p, partner_id: e.target.value }))}
            >
              <option value="">—</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Typ
            <select
              className="mt-0.5 w-full border rounded px-2 py-1"
              value={f.rate_type}
              onChange={(e) => setF((p) => ({ ...p, rate_type: e.target.value }))}
            >
              <option value="ZONE">ZONE</option>
              <option value="PLZ">PLZ</option>
              <option value="FPG">FPG</option>
            </select>
          </label>
          {['zone_number', 'zone_km_from', 'zone_km_to', 'zip_prefix', 'country_code', 'rate_per_shipment', 'rate_per_100kg', 'rate_per_ldm', 'min_charge', 'handling_fee'].map(
            (k) => (
              <label key={k} className="block">
                {k}
                <input
                  className="mt-0.5 w-full border rounded px-2 py-1"
                  value={f[k] ?? ''}
                  onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))}
                />
              </label>
            ),
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-3 py-1.5 border rounded" onClick={() => setPartnerRateModal(false)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="px-3 py-1.5 bg-[#1e40af] text-white rounded"
              disabled={!f.partner_id || m.isPending}
              onClick={() => m.mutate()}
            >
              Speichern
            </button>
          </div>
        </div>
      </div>
    );
  }

  const partnerImportMut = useMutation({
    mutationFn: async ({ file, partnerId }: { file: File; partnerId: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('partnerId', partnerId);
      const { data } = await api.post<{
        imported: number;
        skipped: number;
        skippedEmpty?: number;
        skippedUnchanged?: number;
        skippedIrrelevant?: number;
        errors: string[];
      }>('/pricing/partner-rates/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (data) => {
      setPartnerImportResult(data);
      qc.invalidateQueries({ queryKey: ['pricing', 'partner-rates'] });
    },
  });

  async function downloadPartnerTemplate() {
    const { data } = await api.get<Blob>('/pricing/partner-rates/template', {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'partner-tarife-vorlage.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/pricing/customer-tariffs/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data as { imported: number; errors: string[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing', 'customer-tariffs'] });
      setImportOpen(false);
      setImportFile(null);
      setImportPreview([]);
    },
  });

  async function handleExport() {
    const params =
      tariffCustomerFilter && tariffCustomerFilter !== '__all__'
        ? { customerId: tariffCustomerFilter }
        : {};
    const { data } = await api.get<Blob>('/pricing/customer-tariffs/export', {
      params,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customer-tariffs.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs = [
    'SUB-Konditionen',
    'Kundentarife',
    'Partner-Nachlauf',
    'Tagespreis',
    'Interne Kosten',
  ] as const;

  return (
    <div className="min-h-full bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 py-4">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Preise & Konditionen</h1>
        <p className="text-sm text-gray-600 mb-4 max-w-3xl">
          <strong>Verkauf / Kunde:</strong> Kundentarife, Tagespreis, Partner-Nachlauf.{' '}
          <strong>SUB-Konditionen:</strong> vereinbarte Sätze mit Subunternehmern (Vorlauf/Hauptlauf) – Zeile anklicken zum
          Bearbeiten. <strong>Interne Kosten</strong> sind Einkaufs-/Plan-Kostensätze (kein Kundenpreis).
        </p>
        <div className="flex gap-1 border-b border-gray-200 mb-4">
          {tabs.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(i)}
              className={`px-3 py-2 text-sm font-medium rounded-t-md ${
                tab === i ? 'bg-white border border-b-0 border-gray-200 text-[#1e40af]' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 0 && (
          <div className="space-y-8">
            <section className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-medium text-gray-900">Vorlauf-Konditionen</h2>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-[#1e40af] text-white text-sm rounded-md"
                  onClick={() => setSubModal('pre')}
                >
                  Neue Vorlauf-Kondition
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">Tipp: Zeile anklicken, um die Kondition zu bearbeiten.</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-2">SUB</th>
                      <th className="py-2 pr-2">Typ</th>
                      <th className="py-2 pr-2">€/Stopp</th>
                      <th className="py-2 pr-2">€/Tag</th>
                      <th className="py-2 pr-2">€/km</th>
                      <th className="py-2 pr-2">Min.</th>
                      <th className="py-2 pr-2">Diesel%</th>
                      <th className="py-2 pr-2">Gültig</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preRows.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-gray-100 cursor-pointer hover:bg-blue-50/60"
                        onClick={() => setEditSub(c)}
                      >
                        <td className="py-1.5 pr-2">{c.subcontractors?.name ?? '–'}</td>
                        <td className="py-1.5 pr-2">{c.condition_type}</td>
                        <td className="py-1.5 pr-2">{c.rate_per_stop ?? '–'}</td>
                        <td className="py-1.5 pr-2">{c.rate_per_day ?? '–'}</td>
                        <td className="py-1.5 pr-2">{c.rate_per_km ?? '–'}</td>
                        <td className="py-1.5 pr-2">{c.min_charge ?? '–'}</td>
                        <td className="py-1.5 pr-2">{c.fuel_surcharge_pct ?? '–'}</td>
                        <td className="py-1.5 pr-2 text-xs">
                          {fmtDate(c.valid_from)} – {fmtDate(c.valid_to)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-medium text-gray-900">Hauptlauf-Konditionen</h2>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-[#1e40af] text-white text-sm rounded-md"
                  onClick={() => setSubModal('main')}
                >
                  Neue Hauptlauf-Kondition
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">Tipp: Zeile anklicken, um die Kondition zu bearbeiten.</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-2">SUB</th>
                      <th className="py-2 pr-2">Relation</th>
                      <th className="py-2 pr-2">Typ</th>
                      <th className="py-2 pr-2">Rate</th>
                      <th className="py-2 pr-2">Min</th>
                      <th className="py-2 pr-2">Diesel%</th>
                      <th className="py-2 pr-2">Gültig</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mainRows.map((c) => {
                      const rate =
                        c.rate_flat != null
                          ? `Pauschal ${c.rate_flat}`
                          : c.rate_per_ldm != null
                            ? `${c.rate_per_ldm}/ldm`
                            : c.rate_per_kg != null
                              ? `${c.rate_per_kg}/kg`
                              : c.rate_per_km != null
                                ? `${c.rate_per_km}/km`
                                : '–';
                      return (
                        <tr
                          key={c.id}
                          className="border-b border-gray-100 cursor-pointer hover:bg-blue-50/60"
                          onClick={() => setEditSub(c)}
                        >
                          <td className="py-1.5 pr-2">{c.subcontractors?.name ?? '–'}</td>
                          <td className="py-1.5 pr-2">{c.relations?.code ?? 'Alle'}</td>
                          <td className="py-1.5 pr-2">MAIN_CARRIAGE</td>
                          <td className="py-1.5 pr-2">{rate}</td>
                          <td className="py-1.5 pr-2">{c.min_charge ?? '–'}</td>
                          <td className="py-1.5 pr-2">{c.fuel_surcharge_pct ?? '–'}</td>
                          <td className="py-1.5 pr-2 text-xs">
                            {fmtDate(c.valid_from)} – {fmtDate(c.valid_to)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === 1 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="border rounded px-2 py-1.5 text-sm"
                value={tariffCustomerFilter}
                onChange={(e) => setTariffCustomerFilter(e.target.value)}
              >
                <option value="__all__">Alle Tarife</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="button" className="px-3 py-1.5 border rounded text-sm" onClick={() => setImportOpen(true)}>
                CSV Import
              </button>
              <button type="button" className="px-3 py-1.5 border rounded text-sm" onClick={handleExport}>
                CSV Export
              </button>
              <button
                type="button"
                className="px-3 py-1.5 bg-[#1e40af] text-white text-sm rounded-md ml-auto"
                onClick={() => setTariffModal(true)}
              >
                Neuer Tarif
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-2">Von</th>
                    <th className="py-2 pr-2">Nach</th>
                    <th className="py-2 pr-2">Typ</th>
                    <th className="py-2 pr-2">Rate</th>
                    <th className="py-2 pr-2">Min</th>
                    <th className="py-2 pr-2">Prio</th>
                    <th className="py-2 pr-2">Gültig</th>
                  </tr>
                </thead>
                <tbody>
                  {customerTariffs.map((t) => (
                    <tr key={t.id} className={`border-b border-gray-100 ${tariffRowClass(t)}`}>
                      <td className="py-1.5 pr-2">
                        {t.origin_country ?? '–'} {t.origin_zip_prefix ?? ''}
                      </td>
                      <td className="py-1.5 pr-2">
                        {t.dest_country} {t.dest_zip_prefix ?? '*'}
                      </td>
                      <td className="py-1.5 pr-2">{t.rate_type}</td>
                      <td className="py-1.5 pr-2">{String(t.rate)}</td>
                      <td className="py-1.5 pr-2">{t.min_charge ?? '–'}</td>
                      <td className="py-1.5 pr-2">{t.priority ?? '–'}</td>
                      <td className="py-1.5 pr-2 text-xs">
                        {fmtDate(t.valid_from)} – {fmtDate(t.valid_to)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 2 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="border rounded px-2 py-1.5 text-sm min-w-[200px]"
                value={partnerFilter}
                onChange={(e) => {
                  setPartnerFilter(e.target.value);
                  setPartnerImportResult(null);
                }}
              >
                <option value="">Alle Partner</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="px-3 py-1.5 bg-[#1e40af] text-white text-sm rounded-md"
                onClick={() => setPartnerRateModal(true)}
              >
                Neuer Tarif
              </button>
              <button
                type="button"
                className="px-3 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50"
                onClick={() => downloadPartnerTemplate()}
              >
                Import-Vorlage herunterladen
              </button>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
              <div className="text-4xl mb-3">📤</div>
              <div className="font-medium mb-2">Tarif-Datei hochladen</div>
              <div className="text-sm text-gray-500 mb-4">
                CSV oder Excel (.xlsx) – Import-Vorlage verwenden. Partner oben wählen (Pflicht für Import).
              </div>
              <label className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg cursor-pointer hover:bg-blue-700">
                Datei auswählen
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  disabled={!partnerFilter || partnerImportMut.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file || !partnerFilter) return;
                    setPartnerImportResult(null);
                    partnerImportMut.mutate({ file, partnerId: partnerFilter });
                  }}
                />
              </label>
              {partnerImportMut.isPending && (
                <div className="mt-4 flex flex-col items-center gap-2 text-sm text-gray-600">
                  <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                  Wird importiert…
                </div>
              )}
              {partnerImportResult && !partnerImportMut.isPending && (
                <div className="mt-6 text-left max-w-lg mx-auto space-y-2 text-sm">
                  <div className="text-emerald-700">✅ {partnerImportResult.imported} Tarife importiert</div>
                  {(partnerImportResult.skippedEmpty ?? 0) > 0 && (
                    <div className="text-amber-700">
                      ⚠️ {partnerImportResult.skippedEmpty} Zeilen ohne Tarif/Gebühr (Spaltenköpfe prüfen: z. B.{' '}
                      <span className="font-mono">tariff_type</span> / <span className="font-mono">fee_type</span>{' '}
                      oder deutsch <span className="font-mono">Tarifart</span>)
                    </div>
                  )}
                  {(partnerImportResult.skippedIrrelevant ?? 0) > 0 && (
                    <div className="text-slate-600">
                      ⏭ {partnerImportResult.skippedIrrelevant} ignoriert (Legende, Hauptlauf-Zeilen, kein Zahlenbetrag)
                    </div>
                  )}
                  {(partnerImportResult.skippedUnchanged ?? 0) > 0 && (
                    <div className="text-gray-600">
                      ⏭ {partnerImportResult.skippedUnchanged} unverändert (bereits identisch in der Datenbank)
                    </div>
                  )}
                  <div className={partnerImportResult.errors.length ? 'text-red-700' : 'text-gray-600'}>
                    ❌ {partnerImportResult.errors.length} Fehler
                  </div>
                  {partnerImportResult.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-100 p-3 rounded text-sm text-red-900 space-y-1">
                      {partnerImportResult.errors.map((err, i) => (
                        <div key={i}>{err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-2">Partner</th>
                    <th className="py-2 pr-2">Typ</th>
                    <th className="py-2 pr-2">Zone/PLZ</th>
                    <th className="py-2 pr-2">Land</th>
                    <th className="py-2 pr-2">€/Sendung</th>
                    <th className="py-2 pr-2">€/100kg</th>
                    <th className="py-2 pr-2">€/ldm</th>
                    <th className="py-2 pr-2">Handling</th>
                    <th className="py-2 pr-2">Min</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerRates.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100">
                      <td className="py-1.5 pr-2">{r.business_partners?.name ?? '–'}</td>
                      <td className="py-1.5 pr-2">{r.rate_type}</td>
                      <td className="py-1.5 pr-2">
                        {r.rate_type === 'ZONE'
                          ? `Z${r.zone_number ?? '?'} ${r.zone_km_from ?? ''}-${r.zone_km_to ?? ''} km`
                          : r.zip_prefix ?? '–'}
                      </td>
                      <td className="py-1.5 pr-2">{r.country_code ?? '–'}</td>
                      <td className="py-1.5 pr-2">{r.rate_per_shipment ?? '–'}</td>
                      <td className="py-1.5 pr-2">{r.rate_per_100kg ?? '–'}</td>
                      <td className="py-1.5 pr-2">{r.rate_per_ldm ?? '–'}</td>
                      <td className="py-1.5 pr-2">{r.handling_fee ?? '–'}</td>
                      <td className="py-1.5 pr-2">{r.min_charge ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 3 && (
          <div className="space-y-6">
            {globalConfig && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm max-w-xl">
              <h2 className="font-medium text-gray-900 mb-3">Tagespreis-Algorithmus</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(
                  [
                    ['base_margin_pct', 'Basismarge %'],
                    ['market_delta_factor', 'Marktdelta-Faktor'],
                    ['manual_surcharge_pct', 'Manueller Zuschlag %'],
                    ['timocom_weight', 'Timocom'],
                    ['dat_weight', 'DAT iQ'],
                    ['internal_weight', 'Intern'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="col-span-2 sm:col-span-1 flex flex-col">
                    <span className="text-gray-600">{label}</span>
                    <input
                      className="mt-0.5 border rounded px-2 py-1"
                      value={cfgLocal[k] ?? ''}
                      onChange={(e) => setCfgLocal((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="mt-4 px-4 py-2 bg-[#1e40af] text-white text-sm rounded-md"
                disabled={saveConfigMutation.isPending}
                onClick={() => {
                  const body: Record<string, number> = {
                    base_margin_pct: n(cfgLocal.base_margin_pct),
                    market_delta_factor: n(cfgLocal.market_delta_factor),
                    manual_surcharge_pct: n(cfgLocal.manual_surcharge_pct),
                    timocom_weight: n(cfgLocal.timocom_weight),
                    dat_weight: n(cfgLocal.dat_weight),
                    internal_weight: n(cfgLocal.internal_weight),
                  };
                  saveConfigMutation.mutate(body);
                }}
              >
                Speichern
              </button>
            </div>
            )}

            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm max-w-xl">
              <h2 className="font-medium text-gray-900 mb-2">Marktpreis-Status</h2>
              <ul className="text-sm space-y-2 text-gray-700">
                <li className="flex gap-2">
                  <span className="text-red-500">●</span>
                  Timocom API: Nicht verbunden – {marketRates?.timocom?.hint ?? 'API Key erforderlich'}
                </li>
                <li className="flex gap-2">
                  <span className="text-red-500">●</span>
                  DAT iQ API: Nicht verbunden – {marketRates?.dat?.hint ?? 'API Key erforderlich'}
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-500">●</span>
                  Interne Daten: {marketRates?.internal?.sampleShipmentsLast90Days ?? '…'} Sendungen (90 Tage)
                </li>
              </ul>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <h2 className="font-medium text-gray-900 mb-3">Tagespreis-Kalkulator</h2>
              <div className="flex flex-wrap gap-2 mb-4 text-sm">
                <input className="border rounded px-2 py-1 w-20" value={calcOrigin} onChange={(e) => setCalcOrigin(e.target.value)} title="Von-Land" />
                <input className="border rounded px-2 py-1 w-20" value={calcDest} onChange={(e) => setCalcDest(e.target.value)} title="Nach-Land" />
                <input className="border rounded px-2 py-1 w-24" value={calcLdm} onChange={(e) => setCalcLdm(e.target.value)} placeholder="ldm" />
                <input className="border rounded px-2 py-1 w-24" value={calcKg} onChange={(e) => setCalcKg(e.target.value)} placeholder="kg" />
                <input className="border rounded px-2 py-1 w-20" value={calcStops} onChange={(e) => setCalcStops(e.target.value)} placeholder="Stopps" />
              </div>
              {calcLoading && <p className="text-sm text-gray-500">Berechne…</p>}
              {calcResult && !calcLoading && (
                <div className="max-w-md border border-gray-200 rounded-md text-sm font-mono space-y-1 p-3 bg-gray-50">
                  <div className="flex justify-between">
                    <span>Vorlauf</span>
                    <span>{fmtEur(n((calcResult.costs as { preCarriage?: number })?.preCarriage))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hauptlauf</span>
                    <span>{fmtEur(n((calcResult.costs as { mainCarriage?: number })?.mainCarriage))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Nachlauf</span>
                    <span>{fmtEur(n((calcResult.costs as { onCarriage?: number })?.onCarriage))}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Gesamt Kosten</span>
                    <span>{fmtEur(n((calcResult.costs as { totalCost?: number })?.totalCost))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Basispreis</span>
                    <span>{fmtEur(n(calcResult.basePrice))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Markt gewichtet (€)</span>
                    <span>{fmtEur(n(calcResult.marketPrice))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Marktdelta</span>
                    <span>{fmtEur(n(calcResult.marketDelta))}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[#1e40af] border-t pt-1">
                    <span>TAGESPREIS</span>
                    <span>{fmtEur(n(calcResult.dailyPrice))}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 4 && <CostsPage embedded />}

        {editSub && (
          <SubConditionEditDialog
            condition={editSub}
            subcontractors={subcontractors}
            relations={relations}
            onClose={() => setEditSub(null)}
            onSave={(body) => patchSubMut.mutate({ id: editSub.id, body })}
            pending={patchSubMut.isPending}
          />
        )}

        {subModal && <SubConditionForm kind={subModal} />}
        {tariffModal && <TariffCreateModal />}
        {partnerRateModal && <PartnerRateModal />}
        {importOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setImportOpen(false)}>
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold mb-2">CSV Import</h3>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setImportFile(file ?? null);
                  if (file) {
                    file.text().then((t) => {
                      setImportPreview(t.split(/\r?\n/).filter(Boolean).slice(0, 5));
                    });
                  } else setImportPreview([]);
                }}
              />
              {importPreview.length > 0 && (
                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">{importPreview.join('\n')}</pre>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="px-3 py-1.5 border rounded" onClick={() => setImportOpen(false)}>
                  Schließen
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-[#1e40af] text-white rounded disabled:opacity-50"
                  disabled={!importFile || importMut.isPending}
                  onClick={() => importFile && importMut.mutate(importFile)}
                >
                  Import starten
                </button>
              </div>
              {importMut.data && (
                <p className="mt-2 text-sm text-gray-600">
                  Importiert: {(importMut.data as { imported: number }).imported}
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

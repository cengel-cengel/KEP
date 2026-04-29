import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

type PricingRuleRow = {
  id: string;
  rule_type: string;
  rule_name: string;
  description: string | null;
  customer_id: string | null;
  partner_id: string | null;
  subcontractor_id: string | null;
  relation_id: string | null;
  origin_country: string | null;
  origin_zip_prefix: string | null;
  dest_country: string | null;
  dest_zip_prefix: string | null;
  priority: number | null;
  rate_basis: string;
  rate: number | null;
  min_charge: number | null;
  max_charge: number | null;
  zones_json: string | null;
  tiers_json: string | null;
  fuel_surcharge_pct: number | null;
  adr_surcharge: number | null;
  timeslot_surcharge: number | null;
  b2c_surcharge: number | null;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean | null;
  source: string | null;
};

const RULE_TYPES: { id: string; label: string }[] = [
  { id: 'CUSTOMER_TARIFF', label: 'Kundenkonditionen' },
  { id: 'PARTNER_NACHLAUF', label: 'Partner-Nachlauf' },
  { id: 'SUB_VORLAUF', label: 'SUB-Vorlauf' },
  { id: 'SUB_HAUPTLAUF', label: 'SUB-Hauptlauf' },
  { id: 'CHARTER', label: 'Charter' },
  { id: 'OWN_NV', label: 'Eigener NV' },
];

export default function PricingHubPage() {
  const qc = useQueryClient();
  const [activeRuleType, setActiveRuleType] = useState(RULE_TYPES[0].id);
  const [search, setSearch] = useState('');

  const rulesQuery = useQuery({
    queryKey: ['pricing-hub', 'rules', activeRuleType, search],
    queryFn: async () => {
      const { data } = await api.get<PricingRuleRow[]>('/pricing-hub/rules', {
        params: {
          ruleType: activeRuleType,
          isActive: true,
          search: search || undefined,
        },
      });
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; body: Partial<PricingRuleRow> }) => {
      const { id, body } = payload;
      const res = await api.patch(`/pricing-hub/rules/${id}`, body);
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pricing-hub', 'rules', activeRuleType] });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/pricing-hub/rules/${id}`);
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pricing-hub', 'rules', activeRuleType] });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (payload: { file: File }) => {
      const fd = new FormData();
      fd.append('file', payload.file);
      const res = await api.post(`/pricing-hub/import/${activeRuleType}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as { imported: number; skipped: number; errors: string[]; batchId: string };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pricing-hub', 'rules', activeRuleType] });
      await qc.invalidateQueries({ queryKey: ['pricing-hub', 'import-history'] });
    },
  });

  const [editing, setEditing] = useState<
    Record<string, { rate?: string; min_charge?: string; fuel_surcharge_pct?: string; valid_to?: string }>
  >({});
  const [createOpen, setCreateOpen] = useState(false);
  const [create, setCreate] = useState({
    ruleName: '',
    originCountry: 'DE',
    destCountry: 'DE',
    originZipPrefix: '',
    destZipPrefix: '',
    rateBasis: 'PER_100KG',
    rate: '0',
    minCharge: '0',
    fuelSurchargePct: '0',
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: '',
    priority: '',
    customerId: '',
    partnerId: '',
    subcontractorId: '',
    relationId: '',
    zonesJson: '',
    tiersJson: '',
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        ruleType: activeRuleType,
        ruleName: create.ruleName,
        originCountry: create.originCountry,
        destCountry: create.destCountry,
        originZipPrefix: create.originZipPrefix || null,
        destZipPrefix: create.destZipPrefix || null,
        priority: create.priority ? Number(create.priority) : undefined,
        rateBasis: create.rateBasis,
        rate: Number(create.rate),
        minCharge: Number(create.minCharge),
        fuelSurchargePct: Number(create.fuelSurchargePct),
        validFrom: create.validFrom || undefined,
        validTo: create.validTo || null,
        customerId: create.customerId || null,
        partnerId: create.partnerId || null,
        subcontractorId: create.subcontractorId || null,
        relationId: create.relationId || null,
        zonesJson: create.zonesJson || null,
        tiersJson: create.tiersJson || null,
        isActive: true,
        maxCharge: 0,
      };
      const res = await api.post('/pricing-hub/rules', body);
      return res.data;
    },
    onSuccess: async () => {
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ['pricing-hub', 'rules', activeRuleType] });
    },
  });

  const templateDownload = async () => {
    const res = await api.get(`/pricing-hub/templates/${activeRuleType}`, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: (res.headers['content-type'] as string | undefined) ?? 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeRuleType}-template.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows = rulesQuery.data ?? [];
  const activeTab = useMemo(() => RULE_TYPES.find((t) => t.id === activeRuleType), [activeRuleType]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PRICING HUB</h1>
            <div className="text-sm text-gray-600">Regeln werden zentral gepflegt und beim Kalkulieren verwendet.</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="px-3 py-2 rounded-lg bg-[#1e40af] text-white text-sm" onClick={() => setCreateOpen(true)}>
              + Neue Regel
            </button>
            <button className="px-3 py-2 rounded-lg border border-gray-300 text-sm" onClick={templateDownload}>
              ↓ Template
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {RULE_TYPES.map((t) => (
            <button
              key={t.id}
              className={`px-3 py-2 rounded-lg text-sm border ${
                t.id === activeRuleType ? 'bg-[#1e40af] text-white border-[#1e40af]' : 'bg-white text-gray-700 border-gray-300'
              }`}
              onClick={() => setActiveRuleType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex gap-2 flex-wrap">
              <input
                className="border rounded-lg px-3 py-2 text-sm"
                placeholder="Suche…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex gap-2 flex-wrap items-center">
              <label className="px-3 py-2 rounded-lg border border-gray-300 text-sm cursor-pointer bg-gray-50">
                ↑ Import CSV/XLSX
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    importMutation.mutate({ file });
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {importMutation.isPending && <div className="mt-3 text-sm text-gray-600">Import läuft…</div>}
          {importMutation.isSuccess && (
            <div className="mt-3 text-sm text-gray-700 bg-green-50 border border-green-200 rounded-lg p-3">
              ✅ {importMutation.data.imported} importiert · ⚠️ {importMutation.data.skipped} übersprungen · Batch:{' '}
              {importMutation.data.batchId}
            </div>
          )}
          {importMutation.isError && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              Import fehlgeschlagen.
            </div>
          )}

          <div className="mt-4">
            <div className="text-sm text-gray-600 mb-2">
              Tab: <span className="font-semibold">{activeTab?.label}</span>
            </div>
            <div className="overflow-auto border rounded-lg">
              <table className="min-w-[980px] w-full text-[12px] border-collapse">
                <thead className="bg-gray-50">
                  <tr className="text-left text-gray-700">
                    <th className="p-2 border-b">Prio</th>
                    <th className="p-2 border-b">Name</th>
                    <th className="p-2 border-b">Von</th>
                    <th className="p-2 border-b">Nach</th>
                    <th className="p-2 border-b">Basis</th>
                    <th className="p-2 border-b">Rate</th>
                    <th className="p-2 border-b">Min</th>
                    <th className="p-2 border-b">Fuel%</th>
                    <th className="p-2 border-b">Gültig bis</th>
                    <th className="p-2 border-b">Aktiv</th>
                    <th className="p-2 border-b">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-3 text-gray-500">
                        Keine Regeln.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const ed = editing[r.id];
                      return (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="p-2 border-b">{r.priority ?? '–'}</td>
                          <td className="p-2 border-b font-medium">{r.rule_name}</td>
                          <td className="p-2 border-b">
                            {r.origin_country ?? '–'}
                            {r.origin_zip_prefix ? ` ${r.origin_zip_prefix}` : ''}
                          </td>
                          <td className="p-2 border-b">
                            {r.dest_country ?? '–'}
                            {r.dest_zip_prefix ? ` ${r.dest_zip_prefix}` : ''}
                          </td>
                          <td className="p-2 border-b">{r.rate_basis}</td>
                          <td className="p-2 border-b">
                            <input
                              className="w-24 border rounded px-2 py-1 text-xs"
                              value={ed?.rate ?? (r.rate ?? 0).toString()}
                              onChange={(e) => setEditing((p) => ({ ...p, [r.id]: { ...(p[r.id] ?? {}), rate: e.target.value } }))}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                const body = {
                                  rate: Number(ed?.rate ?? r.rate ?? 0),
                                } as any;
                                updateMutation.mutate({ id: r.id, body });
                              }}
                            />
                          </td>
                          <td className="p-2 border-b">
                            <input
                              className="w-24 border rounded px-2 py-1 text-xs"
                              value={ed?.min_charge ?? (r.min_charge ?? 0).toString()}
                              onChange={(e) =>
                                setEditing((p) => ({ ...p, [r.id]: { ...(p[r.id] ?? {}), min_charge: e.target.value } }))
                              }
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                const body = {
                                  minCharge: Number(ed?.min_charge ?? r.min_charge ?? 0),
                                } as any;
                                updateMutation.mutate({ id: r.id, body });
                              }}
                            />
                          </td>
                          <td className="p-2 border-b">
                            <input
                              className="w-20 border rounded px-2 py-1 text-xs"
                              value={ed?.fuel_surcharge_pct ?? (r.fuel_surcharge_pct ?? 0).toString()}
                              onChange={(e) =>
                                setEditing((p) => ({
                                  ...p,
                                  [r.id]: { ...(p[r.id] ?? {}), fuel_surcharge_pct: e.target.value },
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                const body = {
                                  fuelSurchargePct: Number(ed?.fuel_surcharge_pct ?? r.fuel_surcharge_pct ?? 0),
                                } as any;
                                updateMutation.mutate({ id: r.id, body });
                              }}
                            />
                          </td>
                          <td className="p-2 border-b">
                            <input
                              type="date"
                              className="w-32 border rounded px-2 py-1 text-xs"
                              value={ed?.valid_to ?? (r.valid_to ? r.valid_to.slice(0, 10) : '')}
                              onChange={(e) =>
                                setEditing((p) => ({
                                  ...p,
                                  [r.id]: { ...(p[r.id] ?? {}), valid_to: e.target.value },
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                const v = ed?.valid_to ?? (r.valid_to ? r.valid_to.slice(0, 10) : '');
                                updateMutation.mutate({ id: r.id, body: { validTo: v || null } as any });
                              }}
                            />
                          </td>
                          <td className="p-2 border-b">{r.is_active ? 'Ja' : 'Nein'}</td>
                          <td className="p-2 border-b">
                            <button
                              className="px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700 text-xs"
                              onClick={() => disableMutation.mutate(r.id)}
                            >
                              Deaktivieren
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              Hinweis: Für die exakte Spezifikationen (z. B. Zonen-/Staffel-Editor, pro-Spalte Sync, Preview) erweitern wir im nächsten Schritt.
            </div>
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-4 shadow-lg">
            <h3 className="font-semibold text-lg">Neue Regel ({activeRuleType})</h3>
            <div className="text-sm text-gray-600 mt-1">IDs/JSON können optional sein.</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="block text-sm text-gray-600">
                Name
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={create.ruleName}
                  onChange={(e) => setCreate((p) => ({ ...p, ruleName: e.target.value }))}
                />
              </label>
              <label className="block text-sm text-gray-600">
                Priorität (optional)
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  type="number"
                  value={create.priority}
                  onChange={(e) => setCreate((p) => ({ ...p, priority: e.target.value }))}
                />
              </label>
              <label className="block text-sm text-gray-600">
                Von-Land
                <select className="mt-1 w-full border rounded-lg px-3 py-2" value={create.originCountry} onChange={(e) => setCreate((p)=>({...p, originCountry:e.target.value}))}>
                  {['DE','GB','FR','NL','BE','ES','IT','PL','SE','NO','DK','IE','FI','CH','AT','LU'].map((c)=>(<option key={c} value={c}>{c}</option>))}
                </select>
              </label>
              <label className="block text-sm text-gray-600">
                Von-PLZ Prefix (optional)
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={create.originZipPrefix} onChange={(e)=>setCreate((p)=>({...p, originZipPrefix:e.target.value}))}/>
              </label>
              <label className="block text-sm text-gray-600">
                Nach-Land
                <select className="mt-1 w-full border rounded-lg px-3 py-2" value={create.destCountry} onChange={(e) => setCreate((p)=>({...p, destCountry:e.target.value}))}>
                  {['DE','GB'].map((c)=>(<option key={c} value={c}>{c}</option>))}
                </select>
              </label>
              <label className="block text-sm text-gray-600">
                Nach-PLZ Prefix (optional)
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={create.destZipPrefix} onChange={(e)=>setCreate((p)=>({...p, destZipPrefix:e.target.value}))}/>
              </label>

              <label className="block text-sm text-gray-600">
                Rate-Basis
                <select className="mt-1 w-full border rounded-lg px-3 py-2" value={create.rateBasis} onChange={(e)=>setCreate((p)=>({...p, rateBasis:e.target.value}))}>
                  {['PER_100KG','PER_LDM','PER_SHIPMENT','PER_STOP','PER_KM','PER_DAY','FLAT','ZONE','STAFFEL'].map((x)=>(
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-gray-600">
                Rate
                <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2" value={create.rate} onChange={(e)=>setCreate((p)=>({...p, rate:e.target.value}))}/>
              </label>
              <label className="block text-sm text-gray-600">
                Min Charge
                <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2" value={create.minCharge} onChange={(e)=>setCreate((p)=>({...p, minCharge:e.target.value}))}/>
              </label>
              <label className="block text-sm text-gray-600">
                Fuel Surcharge %
                <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2" value={create.fuelSurchargePct} onChange={(e)=>setCreate((p)=>({...p, fuelSurchargePct:e.target.value}))}/>
              </label>

              <label className="block text-sm text-gray-600">
                Gültig ab
                <input type="date" className="mt-1 w-full border rounded-lg px-3 py-2" value={create.validFrom} onChange={(e)=>setCreate((p)=>({...p, validFrom:e.target.value}))}/>
              </label>
              <label className="block text-sm text-gray-600">
                Gültig bis (optional)
                <input type="date" className="mt-1 w-full border rounded-lg px-3 py-2" value={create.validTo} onChange={(e)=>setCreate((p)=>({...p, validTo:e.target.value}))}/>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="block text-sm text-gray-600">
                customer_id (optional)
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={create.customerId} onChange={(e)=>setCreate((p)=>({...p, customerId:e.target.value}))} placeholder="UUID"/>
              </label>
              <label className="block text-sm text-gray-600">
                partner_id (optional)
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={create.partnerId} onChange={(e)=>setCreate((p)=>({...p, partnerId:e.target.value}))} placeholder="UUID"/>
              </label>
              <label className="block text-sm text-gray-600">
                subcontractor_id (optional)
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={create.subcontractorId} onChange={(e)=>setCreate((p)=>({...p, subcontractorId:e.target.value}))} placeholder="UUID"/>
              </label>
              <label className="block text-sm text-gray-600">
                relation_id (optional)
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={create.relationId} onChange={(e)=>setCreate((p)=>({...p, relationId:e.target.value}))} placeholder="UUID"/>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 mt-3">
              <label className="block text-sm text-gray-600">
                zones_json (optional, JSON)
                <textarea className="mt-1 w-full border rounded-lg px-3 py-2 h-24 font-mono text-xs" value={create.zonesJson} onChange={(e)=>setCreate((p)=>({...p, zonesJson:e.target.value}))} />
              </label>
              <label className="block text-sm text-gray-600">
                tiers_json (optional, JSON)
                <textarea className="mt-1 w-full border rounded-lg px-3 py-2 h-24 font-mono text-xs" value={create.tiersJson} onChange={(e)=>setCreate((p)=>({...p, tiersJson:e.target.value}))} />
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button className="px-3 py-2 border rounded-lg" onClick={() => setCreateOpen(false)}>
                Abbrechen
              </button>
              <button
                className="px-3 py-2 bg-[#1e40af] text-white rounded-lg disabled:opacity-50"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !create.ruleName.trim()}
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


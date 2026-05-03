import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { calculateChargeableWeight, calculateFreightCost } from '../costs/freight-weight.calculator';

type CostRate = {
  id: string;
  rate_type: string;
  name: string;
  relation_id: string | null;
  subcontractor_id: string | null;
  rate_per_100kg: number;
  min_charge: number | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean | null;
};

type Relation = {
  id: string;
  code?: string;
  name?: string;
};

type SubcontractorOption = { id: string; name: string };

type ShipmentRow = {
  id: string;
  shipment_number: string;
  status: string;
  customers?: { name: string } | null;
  ldm?: number | null;
  package_count?: number | null;
  weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  chargeable_weight?: number | null;
  fpg_method?: string | null;
  pre_carriage_cost?: number | null;
  main_carriage_cost?: number | null;
  on_carriage_cost?: number | null;
  total_cost?: number | null;
};

type PreCarriageShipment = {
  id: string;
  shipment_id: string;
  chargeable_weight: number | null;
  allocated_cost: number | null;
  shipments: ShipmentRow;
};

type PreCarriageTour = {
  id: string;
  tour_date: string;
  subcontractor_id: string | null;
  subcontractors?: { id: string; name: string } | null;
  total_cost: number | null;
  cost_rate_id: string | null;
  cost_rates?: { id: string; rate_type: string; name: string } | null;
  distance_km: number | null;
  notes: string | null;
  status: string | null;
  pre_carriage_shipments: PreCarriageShipment[];
};

function toNum(v: unknown): number {
  if (v == null) return 0;
  return Number(v);
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('de-DE');
  } catch {
    return s;
  }
}

type CostsPageProps = { embedded?: boolean };

export default function CostsPage({ embedded = false }: CostsPageProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<1 | 2 | 3>(1);

  // ─────────────────────────────────────────────
  // Tab 1 - cost rates
  // ─────────────────────────────────────────────
  const { data: costRates = [], isLoading: loadingRates } = useQuery({
    queryKey: ['cost_rates'],
    queryFn: async () => {
      const { data } = await api.get<CostRate[]>('/costs/rates');
      return data;
    },
  });

  const { data: relations = [] } = useQuery({
    queryKey: ['relations'],
    queryFn: async () => {
      const { data } = await api.get<Relation[]>('/relations');
      return data;
    },
  });

  const { data: subcontractors = [] } = useQuery({
    queryKey: ['subcontractors'],
    queryFn: async () => {
      const { data } = await api.get<SubcontractorOption[]>('/subcontractors');
      return data;
    },
  });

  const [newRateForm, setNewRateForm] = useState({
    rateType: 'PRE_CARRIAGE',
    name: '',
    relationId: null as string | null,
    subcontractorId: null as string | null,
    ratePer100kg: 9,
    minCharge: 0,
    validFrom: new Date().toISOString().slice(0, 10),
  });

  const createRateMutation = useMutation({
    mutationFn: async () => {
      await api.post('/costs/rates', {
        rateType: newRateForm.rateType,
        name: newRateForm.name,
        relationId: newRateForm.relationId,
        subcontractorId: newRateForm.subcontractorId,
        ratePer100kg: newRateForm.ratePer100kg,
        minCharge: newRateForm.minCharge,
        validFrom: newRateForm.validFrom,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost_rates'] });
      setNewRateForm((v) => ({ ...v, name: '' }));
    },
  });

  // ─────────────────────────────────────────────
  // Editing (Tab 1)
  // ─────────────────────────────────────────────
  const [isEditRateOpen, setIsEditRateOpen] = useState(false);
  const [editRateId, setEditRateId] = useState<string | null>(null);
  const [editRateForm, setEditRateForm] = useState({
    rateType: 'PRE_CARRIAGE',
    name: '',
    relationId: null as string | null,
    subcontractorId: null as string | null,
    ratePer100kg: 9,
    minCharge: 0,
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: '' as string,
    isActive: true,
  });

  const updateRateMutation = useMutation({
    mutationFn: async () => {
      if (!editRateId) throw new Error('editRateId fehlt');
      await api.patch(`/costs/rates/${editRateId}`, {
        rateType: editRateForm.rateType,
        name: editRateForm.name,
        relationId: editRateForm.relationId,
        subcontractorId: editRateForm.subcontractorId,
        ratePer100kg: editRateForm.ratePer100kg,
        minCharge: editRateForm.minCharge,
        validFrom: editRateForm.validFrom,
        validTo: editRateForm.validTo || undefined,
        isActive: editRateForm.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost_rates'] });
      setIsEditRateOpen(false);
      setEditRateId(null);
    },
  });

  // ─────────────────────────────────────────────
  // Tab 2 - FPG live
  // ─────────────────────────────────────────────
  const standardRates = useMemo(() => {
    const byType = (type: string) =>
      costRates.find((r) => r.rate_type === type && r.relation_id == null && r.subcontractor_id == null) ?? null;
    return {
      pre: byType('PRE_CARRIAGE'),
      main: byType('MAIN_CARRIAGE'),
      on: byType('ON_CARRIAGE'),
    };
  }, [costRates]);

  const [fpgInputs, setFpgInputs] = useState({
    weightKg: 500,
    lengthCm: 100,
    widthCm: 50,
    heightCm: 50,
    ldm: 2,
    packageCount: 1,
  });

  const fpg = useMemo(() => {
    const w = toNum(fpgInputs.weightKg);
    const l = toNum(fpgInputs.lengthCm);
    const b = toNum(fpgInputs.widthCm);
    const h = toNum(fpgInputs.heightCm);
    const m = toNum(fpgInputs.ldm);
    const pc = toNum(fpgInputs.packageCount);
    if (![w, l, b, h, m, pc].every((x) => Number.isFinite(x))) return null;
    return calculateChargeableWeight({
      weightKg: w,
      lengthCm: l,
      widthCm: b,
      heightCm: h,
      ldm: m,
      packageCount: pc,
    });
  }, [fpgInputs]);

  const fpgCosts = useMemo(() => {
    if (!fpg) return null;
    const preRatePer = standardRates.pre?.rate_per_100kg ?? 9;
    const preMin = standardRates.pre?.min_charge ?? 0;
    const mainRatePer = standardRates.main?.rate_per_100kg ?? 9;
    const mainMin = standardRates.main?.min_charge ?? 0;
    const onRatePer = standardRates.on?.rate_per_100kg ?? 0;
    const onMin = standardRates.on?.min_charge ?? 0;

    const pre = Math.max(calculateFreightCost(fpg.chargeableWeight, preRatePer), preMin);
    const main = Math.max(calculateFreightCost(fpg.chargeableWeight, mainRatePer), mainMin);
    const on = Math.max(calculateFreightCost(fpg.chargeableWeight, onRatePer), onMin);

    const total = Math.round((pre + main + on) * 100) / 100;

    return { pre, main, on, total, preRatePer, mainRatePer, onRatePer };
  }, [fpg, standardRates]);

  // ─────────────────────────────────────────────
  // Tab 3 - pre-carriage tours
  // ─────────────────────────────────────────────
  const { data: preTours = [], isLoading: loadingPreTours } = useQuery({
    queryKey: ['pre_carriage_tours'],
    queryFn: async () => {
      const { data } = await api.get<PreCarriageTour[]>('/costs/pre-carriage-tours');
      return data;
    },
  });

  const [isCreateTourOpen, setIsCreateTourOpen] = useState(false);
  const [newPreTourForm, setNewPreTourForm] = useState({
    tourDate: new Date().toISOString().slice(0, 10),
    subcontractorId: null as string | null,
    totalCost: 0,
    costRateId: null as string | null,
    distanceKm: null as number | null,
    notes: '',
  });

  const createPreTourMutation = useMutation({
    mutationFn: async () => {
      await api.post('/costs/pre-carriage-tours', {
        tourDate: newPreTourForm.tourDate,
        subcontractorId: newPreTourForm.subcontractorId,
        totalCost: newPreTourForm.totalCost,
        costRateId: newPreTourForm.costRateId,
        distanceKm: newPreTourForm.distanceKm,
        notes: newPreTourForm.notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre_carriage_tours'] });
      setIsCreateTourOpen(false);
    },
  });

  const distributeMutation = useMutation({
    mutationFn: async (tourId: string) => {
      await api.post(`/costs/pre-carriage-tours/${tourId}/distribute`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre_carriage_tours'] });
    },
  });

  const addShipmentMutation = useMutation({
    mutationFn: async ({ tourId, shipmentId }: { tourId: string; shipmentId: string }) => {
      await api.post(`/costs/pre-carriage-tours/${tourId}/add-shipment`, { shipmentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre_carriage_tours'] });
    },
  });

  const [shipmentSearch, setShipmentSearch] = useState('');
  const [activeTourIdForAdd, setActiveTourIdForAdd] = useState<string | null>(null);

  const { data: addableShipments = [], isLoading: loadingAddable } = useQuery({
    queryKey: ['shipments', 'addable', shipmentSearch],
    enabled: tab === 3 && !!activeTourIdForAdd && shipmentSearch.trim().length >= 2,
    queryFn: async () => {
      const { data } = await api.get<ShipmentRow[]>('/shipments', {
        params: {
          status: 'new',
          tourId: 'null',
          search: shipmentSearch.trim(),
        },
      });
      return data;
    },
  });

  const body = (
    <>
      {!embedded && (
        <div className="py-4">
          <h1 className="text-2xl font-semibold text-gray-900 pl-4 sm:pl-6">Kosten</h1>
        </div>
      )}
      {embedded && (
        <p className="text-sm text-gray-600 mb-3">
          Interne Kostensätze und Vorlaufkalkulation (Einkauf / Planung). Kundenpreise und Konditionen pflegen Sie
          unter den anderen Registerkarten.
        </p>
      )}

      <div className={embedded ? '' : 'px-4 sm:px-6 pb-8'}>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                tab === 1 ? 'bg-[#1e40af] text-white border-[#1e3a8a]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => setTab(1)}
            >
              Kostensätze
            </button>
            <button
              type="button"
              className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                tab === 2 ? 'bg-[#1e40af] text-white border-[#1e3a8a]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => setTab(2)}
            >
              FPG Kalkulator
            </button>
            <button
              type="button"
              className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                tab === 3 ? 'bg-[#1e40af] text-white border-[#1e3a8a]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => setTab(3)}
            >
              Vorlauftouren
            </button>
          </div>

          {tab === 1 && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="font-medium">Kostensätze verwalten</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <label className="text-sm text-gray-600">
                    Typ
                    <select
                      value={newRateForm.rateType}
                      onChange={(e) => setNewRateForm((v) => ({ ...v, rateType: e.target.value }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                    >
                      <option value="PRE_CARRIAGE">PRE_CARRIAGE</option>
                      <option value="MAIN_CARRIAGE">MAIN_CARRIAGE</option>
                      <option value="ON_CARRIAGE">ON_CARRIAGE</option>
                    </select>
                  </label>
                  <label className="text-sm text-gray-600">
                    Name
                    <input
                      value={newRateForm.name}
                      onChange={(e) => setNewRateForm((v) => ({ ...v, name: e.target.value }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                      placeholder="z.B. Standard Vorlauf"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    Relation (optional)
                    <select
                      value={newRateForm.relationId ?? ''}
                      onChange={(e) => setNewRateForm((v) => ({ ...v, relationId: e.target.value || null }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                    >
                      <option value="">Alle Relationen</option>
                      {relations.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code ?? r.id} {r.name ? `- ${r.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-gray-600">
                    SUB (optional)
                    <select
                      value={newRateForm.subcontractorId ?? ''}
                      onChange={(e) => setNewRateForm((v) => ({ ...v, subcontractorId: e.target.value || null }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                    >
                      <option value="">Alle SUBs</option>
                      {subcontractors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-600">
                    €/100kg
                    <input
                      type="number"
                      value={newRateForm.ratePer100kg}
                      onChange={(e) => setNewRateForm((v) => ({ ...v, ratePer100kg: Number(e.target.value) }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                      step="0.01"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    Mindest €
                    <input
                      type="number"
                      value={newRateForm.minCharge}
                      onChange={(e) => setNewRateForm((v) => ({ ...v, minCharge: Number(e.target.value) }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                      step="0.01"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    Gültig ab
                    <input
                      type="date"
                      value={newRateForm.validFrom}
                      onChange={(e) => setNewRateForm((v) => ({ ...v, validFrom: e.target.value }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={createRateMutation.isPending}
                      onClick={() => createRateMutation.mutate()}
                      className="w-full px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {createRateMutation.isPending ? 'Wird erstellt…' : 'Neuer Kostensatz'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded overflow-hidden">
                <div className="p-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-900">
                  Bestehende Kostensätze {loadingRates ? '…' : ''}
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-3 py-2">Typ</th>
                        <th className="text-left px-3 py-2">Name</th>
                        <th className="text-left px-3 py-2">Relation</th>
                        <th className="text-left px-3 py-2">SUB</th>
                        <th className="text-left px-3 py-2">€/100kg</th>
                        <th className="text-left px-3 py-2">Mindest</th>
                        <th className="text-left px-3 py-2">Gültig ab</th>
                        <th className="text-left px-3 py-2">Aktiv</th>
                        <th className="text-left px-3 py-2">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costRates.map((r) => (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-medium">{r.rate_type}</td>
                          <td className="px-3 py-2">{r.name}</td>
                          <td className="px-3 py-2">{r.relation_id ?? '—'}</td>
                          <td className="px-3 py-2">{r.subcontractor_id ?? '—'}</td>
                          <td className="px-3 py-2">{Number(r.rate_per_100kg).toFixed(2)}</td>
                          <td className="px-3 py-2">{Number(r.min_charge ?? 0).toFixed(2)} €</td>
                          <td className="px-3 py-2">{r.valid_from ? formatDate(r.valid_from) : '—'}</td>
                          <td className="px-3 py-2">{r.is_active ? '✓' : '—'}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-800 text-xs"
                              onClick={() => {
                                setEditRateId(r.id);
                                setEditRateForm({
                                  rateType: r.rate_type,
                                  name: r.name,
                                  relationId: r.relation_id,
                                  subcontractorId: r.subcontractor_id,
                                  ratePer100kg: Number(r.rate_per_100kg),
                                  minCharge: Number(r.min_charge ?? 0),
                                  validFrom: r.valid_from ? String(r.valid_from).slice(0, 10) : new Date().toISOString().slice(0, 10),
                                  validTo: r.valid_to ? String(r.valid_to).slice(0, 10) : '',
                                  isActive: !!r.is_active,
                                });
                                setIsEditRateOpen(true);
                              }}
                            >
                              Bearbeiten
                            </button>
                          </td>
                        </tr>
                      ))}
                      {costRates.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-6 text-gray-500">
                            Keine Kostensätze vorhanden.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 2 && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-sm text-gray-600">
                    Gewicht (kg)
                    <input
                      type="number"
                      value={fpgInputs.weightKg}
                      onChange={(e) => setFpgInputs((v) => ({ ...v, weightKg: Number(e.target.value) }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      step="0.01"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    Länge (cm)
                    <input
                      type="number"
                      value={fpgInputs.lengthCm}
                      onChange={(e) => setFpgInputs((v) => ({ ...v, lengthCm: Number(e.target.value) }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      step="1"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    Breite (cm)
                    <input
                      type="number"
                      value={fpgInputs.widthCm}
                      onChange={(e) => setFpgInputs((v) => ({ ...v, widthCm: Number(e.target.value) }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      step="1"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    Höhe (cm)
                    <input
                      type="number"
                      value={fpgInputs.heightCm}
                      onChange={(e) => setFpgInputs((v) => ({ ...v, heightCm: Number(e.target.value) }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      step="1"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    LDM
                    <input
                      type="number"
                      value={fpgInputs.ldm}
                      onChange={(e) => setFpgInputs((v) => ({ ...v, ldm: Number(e.target.value) }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      step="0.01"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    Packstücke
                    <input
                      type="number"
                      value={fpgInputs.packageCount}
                      onChange={(e) => setFpgInputs((v) => ({ ...v, packageCount: Number(e.target.value) }))}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      step="1"
                    />
                  </label>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded overflow-hidden">
                <div className="p-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-900">
                  FPG Berechnung
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-gray-200 rounded p-3">
                      <div className="text-sm font-medium text-gray-900 mb-2">FPG</div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Tatsächliches Gewicht</span>
                          <span>{fpg ? `${fpg.actualWeight} kg` : '–'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">CBM</span>
                          <span>{fpg ? `${fpg.cbm} m³` : '–'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Volumengewicht (CBM)</span>
                          <span>{fpg ? `${fpg.volumeWeightCbm} kg` : '–'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Volumengewicht (ldm)</span>
                          <span>{fpg ? `${fpg.volumeWeightLdm} kg` : '–'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">FPG</span>
                          <span className="font-medium">
                            {fpg ? `${fpg.chargeableWeight} kg` : '–'}{' '}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Berechnungsmethode</span>
                          <span>{fpg ? fpg.calculationMethod : '–'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="text-sm font-medium text-gray-900 mb-2">Kosten</div>
                      {fpgCosts ? (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              Vorlauf ({standardRates.pre ? `${standardRates.pre.rate_per_100kg}€/100kg` : '9€/100kg'})
                            </span>
                            <span>{fpgCosts.pre.toFixed(2)} €</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              Hauptlauf ({standardRates.main ? `${standardRates.main.rate_per_100kg}€/100kg` : '9€/100kg'})
                            </span>
                            <span>{fpgCosts.main.toFixed(2)} €</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              Nachlauf ({standardRates.on ? `${standardRates.on.rate_per_100kg}€/100kg` : '0€/100kg'})
                            </span>
                            <span>{fpgCosts.on.toFixed(2)} €</span>
                          </div>
                          <div className="border-t pt-2 flex justify-between font-medium">
                            <span>GESAMT KOSTEN</span>
                            <span>{fpgCosts.total.toFixed(2)} €</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">Bitte gültige Eingaben machen.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-gray-900">Vorlauftouren</div>
                <button
                  type="button"
                  onClick={() => setIsCreateTourOpen(true)}
                  className="px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a]"
                >
                  Neue Vorlauftour
                </button>
              </div>

              {loadingPreTours ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                </div>
              ) : preTours.length === 0 ? (
                <div className="text-sm text-gray-500">Keine Vorlauftouren vorhanden.</div>
              ) : (
                <div className="space-y-4">
                  {preTours.map((tour) => (
                    <PreCarriageTourCard
                      key={tour.id}
                      tour={tour}
                      costRates={costRates}
                      relations={relations}
                      subcontractors={subcontractors}
                      shipmentSearch={shipmentSearch}
                      setShipmentSearch={setShipmentSearch}
                      setActiveTourIdForAdd={setActiveTourIdForAdd}
                      activeTourIdForAdd={activeTourIdForAdd}
                      addableShipments={addableShipments}
                      loadingAddable={loadingAddable}
                      onAddShipment={(shipmentId) => addShipmentMutation.mutate({ tourId: tour.id, shipmentId })}
                      onDistribute={() => distributeMutation.mutate(tour.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      {isCreateTourOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
              <div className="font-medium">Neue Vorlauftour</div>
              <button
                type="button"
                onClick={() => setIsCreateTourOpen(false)}
                className="px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm text-gray-600">
                  Datum
                  <input
                    type="date"
                    value={newPreTourForm.tourDate}
                    onChange={(e) => setNewPreTourForm((v) => ({ ...v, tourDate: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                  />
                </label>
                <label className="text-sm text-gray-600">
                  SUB
                  <select
                    value={newPreTourForm.subcontractorId ?? ''}
                    onChange={(e) => setNewPreTourForm((v) => ({ ...v, subcontractorId: e.target.value || null }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                  >
                    <option value="">—</option>
                    {subcontractors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-gray-600">
                  Gesamtkosten €
                  <input
                    type="number"
                    value={newPreTourForm.totalCost}
                    onChange={(e) => setNewPreTourForm((v) => ({ ...v, totalCost: Number(e.target.value) }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    step="0.01"
                  />
                </label>
                <label className="text-sm text-gray-600">
                  Kostensatz (Rate)
                  <select
                    value={newPreTourForm.costRateId ?? ''}
                    onChange={(e) => setNewPreTourForm((v) => ({ ...v, costRateId: e.target.value || null }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                  >
                    <option value="">—</option>
                    {costRates
                      .filter((r) => r.rate_type === 'PRE_CARRIAGE')
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({Number(r.rate_per_100kg).toFixed(2)}€/100kg)
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-sm text-gray-600">
                  Distanz km (optional)
                  <input
                    type="number"
                    value={newPreTourForm.distanceKm ?? ''}
                    onChange={(e) => setNewPreTourForm((v) => ({ ...v, distanceKm: e.target.value ? Number(e.target.value) : null }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    step="0.01"
                  />
                </label>
                <label className="text-sm text-gray-600">
                  Notizen (optional)
                  <input
                    value={newPreTourForm.notes}
                    onChange={(e) => setNewPreTourForm((v) => ({ ...v, notes: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    placeholder="z.B. Spediteur, etc."
                  />
                </label>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                  onClick={() => setIsCreateTourOpen(false)}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={createPreTourMutation.isPending}
                  className="px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => createPreTourMutation.mutate()}
                >
                  {createPreTourMutation.isPending ? 'Wird erstellt…' : 'Vorlauftour anlegen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditRateOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
              <div className="font-medium">Kostensatz bearbeiten</div>
              <button
                type="button"
                onClick={() => {
                  setIsEditRateOpen(false);
                  setEditRateId(null);
                }}
                className="px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm text-gray-600">
                  Typ
                  <select
                    value={editRateForm.rateType}
                    onChange={(e) => setEditRateForm((v) => ({ ...v, rateType: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                  >
                    <option value="PRE_CARRIAGE">PRE_CARRIAGE</option>
                    <option value="MAIN_CARRIAGE">MAIN_CARRIAGE</option>
                    <option value="ON_CARRIAGE">ON_CARRIAGE</option>
                  </select>
                </label>

                <label className="text-sm text-gray-600">
                  Name
                  <input
                    value={editRateForm.name}
                    onChange={(e) => setEditRateForm((v) => ({ ...v, name: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                  />
                </label>

                <label className="text-sm text-gray-600">
                  Relation (optional)
                  <select
                    value={editRateForm.relationId ?? ''}
                    onChange={(e) => setEditRateForm((v) => ({ ...v, relationId: e.target.value || null }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                  >
                    <option value="">Alle Relationen</option>
                    {relations.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code ?? r.id} {r.name ? `- ${r.name}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-gray-600">
                  SUB (optional)
                  <select
                    value={editRateForm.subcontractorId ?? ''}
                    onChange={(e) =>
                      setEditRateForm((v) => ({ ...v, subcontractorId: e.target.value || null }))
                    }
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                  >
                    <option value="">Alle SUBs</option>
                    {subcontractors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-gray-600">
                  €/100kg
                  <input
                    type="number"
                    value={editRateForm.ratePer100kg}
                    onChange={(e) =>
                      setEditRateForm((v) => ({ ...v, ratePer100kg: Number(e.target.value) }))
                    }
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    step="0.01"
                  />
                </label>

                <label className="text-sm text-gray-600">
                  Mindest €
                  <input
                    type="number"
                    value={editRateForm.minCharge}
                    onChange={(e) =>
                      setEditRateForm((v) => ({ ...v, minCharge: Number(e.target.value) }))
                    }
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    step="0.01"
                  />
                </label>

                <label className="text-sm text-gray-600">
                  Gültig ab
                  <input
                    type="date"
                    value={editRateForm.validFrom}
                    onChange={(e) => setEditRateForm((v) => ({ ...v, validFrom: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                  />
                </label>

                <label className="text-sm text-gray-600">
                  Gültig bis (optional)
                  <input
                    type="date"
                    value={editRateForm.validTo}
                    onChange={(e) => setEditRateForm((v) => ({ ...v, validTo: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                  />
                </label>

                <label className="text-sm text-gray-600">
                  Aktiv
                  <select
                    value={editRateForm.isActive ? 'true' : 'false'}
                    onChange={(e) => setEditRateForm((v) => ({ ...v, isActive: e.target.value === 'true' }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                  >
                    <option value="true">Ja</option>
                    <option value="false">Nein</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                  onClick={() => {
                    setIsEditRateOpen(false);
                    setEditRateId(null);
                  }}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={updateRateMutation.isPending}
                  className="px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => updateRateMutation.mutate()}
                >
                  {updateRateMutation.isPending ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">{body}</div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-white flex flex-col">
      <main className="w-full flex-1">{body}</main>
    </div>
  );
}

function PreCarriageTourCard({
  tour,
  addableShipments,
  loadingAddable,
  onAddShipment,
  onDistribute,
  activeTourIdForAdd,
  setActiveTourIdForAdd,
  shipmentSearch,
  setShipmentSearch,
}: {
  tour: PreCarriageTour;
  costRates: CostRate[];
  relations: Relation[];
  subcontractors: SubcontractorOption[];
  addableShipments: ShipmentRow[];
  loadingAddable: boolean;
  onAddShipment: (shipmentId: string) => void;
  onDistribute: () => void;
  activeTourIdForAdd: string | null;
  setActiveTourIdForAdd: (tourId: string | null) => void;
  shipmentSearch: string;
  setShipmentSearch: (value: string) => void;
}) {
  const status = tour.status ?? 'open';
  const totalCost = toNum(tour.total_cost);
  const sumFpg = useMemo(() => {
    return tour.pre_carriage_shipments.reduce((acc, s) => acc + toNum(s.chargeable_weight), 0);
  }, [tour.pre_carriage_shipments]);

  const showAdd = activeTourIdForAdd === tour.id;

  return (
    <div className="border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden">
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900">
            Vorlauftour {formatDate(tour.tour_date)}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            SUB: {tour.subcontractors?.name ?? '—'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Gesamtkosten: {totalCost.toFixed(2)} € · Rate: {tour.cost_rates?.name ?? '—'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              status === 'distributed' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {status === 'distributed' ? 'Verteilt' : 'Offen'}
          </span>
          {status === 'open' ? (
            <button
              type="button"
              onClick={onDistribute}
              className="px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a]"
            >
              Kosten verteilen
            </button>
          ) : null}
          <button
            type="button"
            className="px-3 py-2 bg-white border border-gray-300 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-50"
            onClick={() => setActiveTourIdForAdd(showAdd ? null : tour.id)}
          >
            Sendungen {showAdd ? 'einklappen' : 'bearbeiten'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="p-4 space-y-3">
          <div className="flex gap-2 items-center">
            <input
              value={shipmentSearch}
              onChange={(e) => setShipmentSearch(e.target.value)}
              placeholder="Sendungsnummer / Kunde suchen…"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
            />
          </div>

          {loadingAddable ? (
            <div className="text-sm text-gray-500">Suche läuft…</div>
          ) : (
            shipmentSearch.trim().length >= 2 && (
              <div className="max-h-40 overflow-auto border border-gray-200 rounded">
                {addableShipments.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50"
                    onClick={() => onAddShipment(s.id)}
                  >
                    <div className="font-medium text-gray-900">{s.shipment_number ?? s.id}</div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      Kunde: {s.customers?.name ?? '—'} · LDM: {s.ldm ?? '–'}
                    </div>
                  </button>
                ))}
                {addableShipments.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-gray-500">Keine Treffer.</div>
                ) : null}
              </div>
            )
          )}
        </div>
      )}

      <div className="p-4">
        <div className="text-sm font-medium text-gray-900 mb-2">Sendungen</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Sendung</th>
                <th className="text-left px-3 py-2">FPG</th>
                <th className="text-left px-3 py-2">Anteil %</th>
                <th className="text-left px-3 py-2">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {tour.pre_carriage_shipments.map((s) => {
                const fpg = toNum(s.chargeable_weight);
                const Anteil = sumFpg > 0 ? (fpg / sumFpg) * 100 : 0;
                const kosten = toNum(s.allocated_cost);
                return (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{s.shipments.shipment_number}</td>
                    <td className="px-3 py-2">{s.chargeable_weight != null ? `${fpg.toFixed(1)} kg` : '–'}</td>
                    <td className="px-3 py-2">{s.chargeable_weight != null ? Anteil.toFixed(1) : '–'}%</td>
                    <td className="px-3 py-2">{s.allocated_cost != null ? `${kosten.toFixed(2)} €` : '–'}</td>
                  </tr>
                );
              })}
              {tour.pre_carriage_shipments.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-gray-500" colSpan={4}>
                    Keine Sendungen in dieser Vorlauftour.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


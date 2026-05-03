import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

type HallLocation = {
  id: string;
  code: string;
  type: string;
  zone: string | null;
  capacity: number;
  description: string | null;
  is_active: boolean;
  stock: Array<{
    id: string;
    shipmentId: string;
    shipment_number: string | null;
    status: string | null;
    customer_name: string | null;
    from_city: string | null;
    from_zip: string | null;
    to_city: string | null;
    to_zip: string | null;
    placed_at: string;
    is_hazmat: boolean | null;
  }>;
};

type HallStockItem = {
  id: string;
  shipmentId: string;
  shipment_number: string;
  status: string;
  location_code: string;
  location_type: string;
  placed_at: string;
  customer_name: string | null;
  from_city: string | null;
  from_zip: string | null;
  to_city: string | null;
  to_zip: string | null;
  is_hazmat: boolean;
};

type HallMovement = {
  id: string;
  shipmentId: string;
  shipment_number: string;
  action: string;
  from_location_code: string | null;
  to_location_code: string | null;
  performed_at: string;
  performed_by_name: string | null;
  notes: string | null;
};

type HallAlert = {
  severity: 'red' | 'orange' | 'yellow';
  message: string;
  shipmentId?: string;
};

type HallCheck = {
  id: string;
  check_date: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  discrepancies: number;
  items: Array<{
    id: string;
    shipmentId: string;
    shipment_number: string;
    expected_status: string | null;
    actual_status: string | null;
    is_ok: boolean | null;
    hall_location_code: string | null;
    hall_location_type: string | null;
    notes: string | null;
  }>;
};

function pinColorsByType(type: string) {
  // NORMAL=weiss, ADR=orange, ZOLL=gelb, AVIS=blau, UEBERHANG=lila, KLAERPLATZ=rot
  switch (type) {
    case 'ADR':
      return { bgFree: 'bg-orange-50', bgOccupied: 'bg-orange-200', border: 'border-orange-300', text: 'text-orange-900' };
    case 'ZOLL':
      return { bgFree: 'bg-yellow-50', bgOccupied: 'bg-yellow-200', border: 'border-yellow-300', text: 'text-yellow-900' };
    case 'AVIS':
      return { bgFree: 'bg-blue-50', bgOccupied: 'bg-blue-200', border: 'border-blue-300', text: 'text-blue-900' };
    case 'UEBERHANG':
      return { bgFree: 'bg-purple-50', bgOccupied: 'bg-purple-200', border: 'border-purple-300', text: 'text-purple-900' };
    case 'KLAERPLATZ':
      return { bgFree: 'bg-red-50', bgOccupied: 'bg-red-200', border: 'border-red-300', text: 'text-red-900' };
    default:
      return { bgFree: 'bg-white', bgOccupied: 'bg-gray-200', border: 'border-gray-200', text: 'text-gray-900' };
  }
}

function formatAction(action: string) {
  return action;
}

export default function HallPage() {
  const queryClient = useQueryClient();

  const {
    data: locations = [],
    isLoading: loadingLocations,
  } = useQuery({
    queryKey: ['hall', 'locations'],
    queryFn: async () => api.get<HallLocation[]>('/hall/locations').then((r) => r.data),
  });

  const {
    data: stock = [],
  } = useQuery({
    queryKey: ['hall', 'stock'],
    queryFn: async () => api.get<HallStockItem[]>('/hall/stock').then((r) => r.data),
  });

  const {
    data: movements = [],
    isLoading: loadingMovements,
  } = useQuery({
    queryKey: ['hall', 'movements'],
    queryFn: async () => api.get<HallMovement[]>('/hall/movements').then((r) => r.data),
  });

  const {
    data: alerts = [],
    isLoading: loadingAlerts,
  } = useQuery({
    queryKey: ['hall', 'alerts'],
    queryFn: async () => api.get<HallAlert[]>('/hall/alerts').then((r) => r.data),
  });

  const {
    data: hallCheck,
    isLoading: loadingCheck,
  } = useQuery({
    queryKey: ['hall', 'check'],
    queryFn: async () => api.get<HallCheck | null>('/hall/check').then((r) => r.data),
  });

  // For dropdowns: all shipments
  const { data: allShipments = [], isLoading: loadingShipments } = useQuery({
    queryKey: ['shipments', 'hall'],
    queryFn: async () => api.get<any[]>('/shipments').then((r) => r.data),
  });

  const activeStockShipmentIds = useMemo(() => new Set(stock.map((s) => s.shipmentId)), [stock]);

  const availableShipments = useMemo(() => {
    return (allShipments ?? []).filter((s: any) => !activeStockShipmentIds.has(s.id));
  }, [allShipments, activeStockShipmentIds]);

  const freeLocations = useMemo(() => {
    const occupiedCodes = new Set(locations.filter((l) => l.stock.length > 0).map((l) => l.code));
    return locations.filter((l) => !occupiedCodes.has(l.code));
  }, [locations]);

  const occupiedLocations = useMemo(() => {
    return locations.filter((l) => l.stock.length > 0);
  }, [locations]);

  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(null);

  const selectedLocation = useMemo(() => {
    if (!selectedLocationCode) return null;
    return locations.find((l) => l.code === selectedLocationCode) ?? null;
  }, [locations, selectedLocationCode]);

  const [einlagerShipmentId, setEinlagerShipmentId] = useState<string>('');
  const [einlagerLocationCode, setEinlagerLocationCode] = useState<string>('');

  const [auslagerShipmentId, setAuslagerShipmentId] = useState<string>('');

  const [moveFromLocationCode, setMoveFromLocationCode] = useState<string>('');
  const [moveShipmentId, setMoveShipmentId] = useState<string>('');
  const [moveToLocationCode, setMoveToLocationCode] = useState<string>('');

  const [scanShipmentNumber, setScanShipmentNumber] = useState<string>('');
  const [scanLocationCode, setScanLocationCode] = useState<string>('');

  const placeMutation = useMutation({
    mutationFn: async ({ shipmentId, locationCode }: { shipmentId: string; locationCode: string }) => {
      return api.post('/hall/place', { shipmentId, locationCode });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hall', 'locations'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'stock'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'movements'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'check'] }),
      ]);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ shipmentId }: { shipmentId: string }) => api.post('/hall/remove', { shipmentId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hall', 'locations'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'stock'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'movements'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'check'] }),
      ]);
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ shipmentId, toLocationCode }: { shipmentId: string; toLocationCode: string }) =>
      api.post('/hall/move', { shipmentId, toLocationCode }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hall', 'locations'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'stock'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'movements'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'check'] }),
      ]);
    },
  });

  const startCheckMutation = useMutation({
    mutationFn: async () => api.post('/hall/check/start'),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hall', 'check'] }),
        queryClient.invalidateQueries({ queryKey: ['hall', 'alerts'] }),
      ]);
    },
  });

  const lastMovements = useMemo(() => (movements ?? []).slice(0, 10), [movements]);

  const moveShipmentOptions = useMemo(() => {
    if (!moveFromLocationCode) return [];
    return stock.filter((s) => s.location_code === moveFromLocationCode);
  }, [stock, moveFromLocationCode]);

  return (
    <div className="w-full min-h-screen bg-white flex flex-col">

      <main className="w-full flex-1 px-4 sm:px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Hallenmanagement</h1>

        {/* Bereich 1: Hallenplan */}
        <section className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">Hallenplan (Stellplätze)</div>
            <div className="text-xs text-gray-500">
              {loadingLocations ? 'Lade…' : `${locations.length} Stellplätze`}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {loadingLocations ? (
              <div className="col-span-full flex items-center justify-center py-10">
                <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
              </div>
            ) : (
              locations.map((loc) => {
                const color = pinColorsByType(loc.type);
                const occupied = loc.stock.length > 0;
                const shipmentNumber = loc.stock[0]?.shipment_number;
                const isSelected = selectedLocationCode === loc.code;
                return (
                  <button
                    key={loc.code}
                    type="button"
                    onClick={() => setSelectedLocationCode(loc.code)}
                    className={[
                      'text-left rounded-md border p-2 transition',
                      color.border,
                      occupied ? color.bgOccupied : color.bgFree,
                      isSelected ? 'ring-2 ring-[#1e40af]' : '',
                    ].join(' ')}
                  >
                    <div className={`font-semibold text-sm ${color.text}`}>{loc.code}</div>
                    <div className="mt-1 text-[11px] text-gray-700">
                      {occupied ? (
                        <span>
                          Belegt: <span className="font-semibold">{shipmentNumber ?? '—'}</span>
                        </span>
                      ) : (
                        <span>Frei</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {selectedLocation && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-sm font-semibold text-gray-900">Sendungsdetails</div>
              {selectedLocation.stock.length > 0 ? (
                <div className="text-sm text-gray-700 mt-1">
                  <div>
                    Sendung: <span className="font-semibold">{selectedLocation.stock[0]?.shipment_number ?? '—'}</span>
                  </div>
                  <div className="text-gray-600">
                    Kunde: {selectedLocation.stock[0]?.customer_name ?? '—'}
                  </div>
                  <div className="text-gray-600">
                    Von: {selectedLocation.stock[0]?.from_zip ?? ''} {selectedLocation.stock[0]?.from_city ?? ''} → Nach:{' '}
                    {selectedLocation.stock[0]?.to_zip ?? ''} {selectedLocation.stock[0]?.to_city ?? ''}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-600 mt-1">Dieser Platz ist frei.</div>
              )}
            </div>
          )}
        </section>

        {/* Bereich 2: Aktionen + Scanner */}
        <section className="mb-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-gray-900">Aktionen</div>
                  <div className="text-sm text-gray-600">Einlagerung / Auslagerung / Umlagerung</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Einlagern / Auslagern */}
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="font-medium text-gray-900 mb-2">Links – Einlagern / Auslagern</div>

                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">Sendung wählen (ohne Stellplatz)</div>
                    <select
                      value={einlagerShipmentId}
                      onChange={(e) => setEinlagerShipmentId(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      disabled={loadingShipments}
                    >
                      <option value="">—</option>
                      {availableShipments.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.shipment_number ?? s.shipmentNumber ?? s.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">Stellplatz wählen (frei)</div>
                    <select
                      value={einlagerLocationCode}
                      onChange={(e) => setEinlagerLocationCode(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    >
                      <option value="">—</option>
                      {freeLocations.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.code} ({l.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      disabled={!einlagerShipmentId || !einlagerLocationCode || placeMutation.isPending}
                      onClick={() => placeMutation.mutate({ shipmentId: einlagerShipmentId, locationCode: einlagerLocationCode })}
                      className="flex-1 px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50"
                    >
                      Einlagern
                    </button>
                  </div>

                  <hr className="my-3 border-gray-200" />

                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">Sendung wählen (belegt)</div>
                    <select
                      value={auslagerShipmentId}
                      onChange={(e) => setAuslagerShipmentId(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    >
                      <option value="">—</option>
                      {stock.map((s) => (
                        <option key={s.shipmentId} value={s.shipmentId}>
                          {s.shipment_number} ({s.location_code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      disabled={!auslagerShipmentId || removeMutation.isPending}
                      onClick={() => removeMutation.mutate({ shipmentId: auslagerShipmentId })}
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      Auslagern
                    </button>
                  </div>

                  {/* Umlagern */}
                  <hr className="my-3 border-gray-200" />

                  <div className="mb-2 font-medium text-gray-900">Umlagern</div>

                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">Von Stellplatz</div>
                    <select
                      value={moveFromLocationCode}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMoveFromLocationCode(v);
                        setMoveShipmentId('');
                      }}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    >
                      <option value="">—</option>
                      {occupiedLocations.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.code} ({l.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">Sendung (von)</div>
                    <select
                      value={moveShipmentId}
                      onChange={(e) => setMoveShipmentId(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      disabled={!moveFromLocationCode}
                    >
                      <option value="">—</option>
                      {moveShipmentOptions.map((s) => (
                        <option key={s.shipmentId} value={s.shipmentId}>
                          {s.shipment_number}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">Zu Stellplatz</div>
                    <select
                      value={moveToLocationCode}
                      onChange={(e) => setMoveToLocationCode(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      disabled={freeLocations.length === 0}
                    >
                      <option value="">—</option>
                      {freeLocations.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.code} ({l.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!moveShipmentId || !moveToLocationCode || moveMutation.isPending}
                      onClick={() => moveMutation.mutate({ shipmentId: moveShipmentId, toLocationCode: moveToLocationCode })}
                      className="flex-1 px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50"
                    >
                      Umlagern
                    </button>
                  </div>
                </div>

                {/* Scanner Simulation */}
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="font-medium text-gray-900 mb-2">Rechts – Scanner Simulation</div>

                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">Sendungsnummer scannen</div>
                    <input
                      value={scanShipmentNumber}
                      onChange={(e) => setScanShipmentNumber(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      placeholder="z.B. S26-000123"
                    />
                  </div>

                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">Stellplatz scannen</div>
                    <input
                      value={scanLocationCode}
                      onChange={(e) => setScanLocationCode(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                      placeholder="z.B. SE-01"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={placeMutation.isPending || !scanShipmentNumber || !scanLocationCode}
                    onClick={() => {
                      const hit = (allShipments ?? []).find((s: any) => (s.shipment_number ?? s.shipmentNumber) === scanShipmentNumber);
                      if (!hit) return;
                      placeMutation.mutate({ shipmentId: hit.id, locationCode: scanLocationCode });
                    }}
                    className="w-full px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50"
                  >
                    Einbuchen
                  </button>

                  {(() => {
                    const hit = (allShipments ?? []).find(
                      (s: any) =>
                        (s.shipment_number ?? s.shipmentNumber) === scanShipmentNumber,
                    );
                    if (!hit) return null;
                    const pos = hit.tour_position ?? hit.tourPosition;
                    return (
                      <div className="mt-2 text-xs text-gray-600">
                        Hinweis: Sendung {scanShipmentNumber} → Stellplatz{' '}
                        {scanLocationCode || '…'} → Ladereihenfolge:{' '}
                        {pos ?? '—'}
                      </div>
                    );
                  })()}

                  <hr className="my-3 border-gray-200" />

                  <div className="font-medium text-gray-900 mb-2">Bewegungslog (letzte 10)</div>
                  {loadingMovements ? (
                    <div className="text-sm text-gray-600">Lade…</div>
                  ) : movements.length === 0 ? (
                    <div className="text-sm text-gray-600">Keine Bewegungen.</div>
                  ) : (
                    <div className="max-h-[260px] overflow-y-auto space-y-2">
                      {lastMovements.map((m) => (
                        <div key={m.id} className="rounded border border-gray-200 bg-white p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{m.shipment_number}</span>
                            <span className="text-gray-500">{new Date(m.performed_at).toLocaleString('de-DE')}</span>
                          </div>
                          <div className="text-gray-700">
                            {formatAction(m.action)}: {m.from_location_code ?? '—'} → {m.to_location_code ?? '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bereich 3: Alerts & Hallencheck */}
        <section className="mt-2">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="font-semibold text-gray-900 mb-2">Anomalie-Alerts</div>
              {loadingAlerts ? (
                <div className="text-sm text-gray-600">Lade…</div>
              ) : alerts.length === 0 ? (
                <div className="text-sm text-gray-600">Keine offenen Anomalien.</div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a, idx) => {
                    const style =
                      a.severity === 'red'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : a.severity === 'orange'
                          ? 'bg-orange-50 border-orange-200 text-orange-800'
                          : 'bg-yellow-50 border-yellow-200 text-yellow-800';
                    return (
                      <div key={idx} className={`rounded border p-3 ${style}`}>
                        <div className="text-sm font-semibold">
                          {a.severity === 'red' ? 'ROT' : a.severity === 'orange' ? 'ORANGE' : 'GELB'}
                        </div>
                        <div className="text-sm">{a.message}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-semibold text-gray-900">Hallencheck</div>
                  <div className="text-sm text-gray-600">Soll vs. Ist Bestand</div>
                </div>
                <div>
                  {loadingCheck ? (
                    <div className="text-xs text-gray-500">Lade…</div>
                  ) : hallCheck ? (
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                        hallCheck.status === 'completed'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      Heute: {hallCheck.status === 'completed' ? 'Ja' : 'Offen'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-50 text-gray-700 border border-gray-200 px-3 py-1 text-xs font-medium">
                      Heute: Nein
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={startCheckMutation.isPending}
                onClick={() => startCheckMutation.mutate()}
                className="w-full px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50 mb-3"
              >
                Hallencheck starten
              </button>

              {loadingCheck ? (
                <div className="text-sm text-gray-600">Lade…</div>
              ) : !hallCheck ? (
                <div className="text-sm text-gray-600">Kein Hallencheck vorhanden.</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-gray-600">
                    Abweichungen: <span className="font-semibold text-gray-900">{hallCheck.discrepancies}</span>
                  </div>

                  <div className="max-h-[320px] overflow-y-auto space-y-2">
                    {hallCheck.items.map((it) => {
                      const mismatch = it.is_ok === false;
                      return (
                        <div
                          key={it.id}
                          className={`rounded border p-3 text-sm ${
                            mismatch ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold">
                              {it.shipment_number} <span className="text-gray-500 font-normal">({it.hall_location_code ?? '—'})</span>
                            </div>
                            <div className={`text-xs font-semibold ${mismatch ? 'text-red-700' : 'text-green-700'}`}>
                              {mismatch ? 'Abweichung' : 'OK'}
                            </div>
                          </div>
                          <div className="text-gray-700 mt-1">
                            Soll: <span className="font-semibold">{it.expected_status ?? '—'}</span> · Ist:{' '}
                            <span className="font-semibold">{it.actual_status ?? '—'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}


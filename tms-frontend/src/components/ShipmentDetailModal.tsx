import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { X, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Shipment } from '../types/shipment';
import { transportTypeLabel } from '../constants/transportTypes';
import { api } from '../lib/api';
import CostDrillDownModal from './nv/CostDrillDownModal';
import type { CostComponent } from './nv/CostDrillDownModal';

interface Props {
  shipmentId: string | null;
  shipments: Shipment[];
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  showEditButton?: boolean;
}

const FREIGHT_PAYER_LABEL: Record<string, string> = {
  sender: 'Absender (Frei)',
  recipient: 'Empfänger (Unfrei)',
  third_party: 'Dritter',
};

function fmtDate(s?: string | null): string {
  if (!s) return '–';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function pickAddr(
  obj: Record<string, unknown>,
  longKey: string,
  shortKey: string,
): { name?: string; street?: string; zip?: string; city?: string; country_code?: string } | null {
  const a =
    (obj[shortKey] as Record<string, unknown> | undefined) ??
    (obj[longKey] as Record<string, unknown> | undefined);
  if (!a) return null;
  return {
    name: (a.name as string) ?? '',
    street: (a.street as string) ?? '',
    zip: (a.zip as string) ?? '',
    city: (a.city as string) ?? '',
    country_code: ((a.country_code as string) ?? (a.countryCode as string) ?? '').toUpperCase(),
  };
}

function fmtMoney(v: unknown): string {
  if (v == null) return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `€ ${n.toFixed(2)}`;
}

function fmtPct(v: unknown): string {
  if (v == null) return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)} %`;
}

export default function ShipmentDetailModal({
  shipmentId,
  shipments,
  isOpen,
  onClose,
  onEdit,
  onNavigate,
  showEditButton = true,
}: Props) {
  const baseShipment = useMemo(
    () => shipments.find((s) => s.id === shipmentId) ?? null,
    [shipments, shipmentId],
  );
  const detailQ = useQuery<Shipment>({
    queryKey: ['shipments', 'detail', shipmentId],
    queryFn: async () =>
      (await api.get<Shipment>(`/shipments/${shipmentId}`)).data,
    enabled: isOpen && !!shipmentId,
    staleTime: 30_000,
  });
  const shipment = (detailQ.data ?? baseShipment) as Shipment | null;

  // Keyboard-Shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'e' || e.key === 'E') && showEditButton) {
        e.preventDefault();
        onEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNavigate('next');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNavigate('prev');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onEdit, onClose, onNavigate, showEditButton]);

  if (!shipment) return null;
  const r = shipment as unknown as Record<string, unknown>;
  const loadAddr = pickAddr(r, 'addresses_shipments_loading_address_idToaddresses', 'loadingAddress');
  const delivAddr = pickAddr(r, 'addresses_shipments_delivery_address_idToaddresses', 'deliveryAddress');
  const items = (shipment.shipment_package_items ?? []) as Array<{
    package_type?: string;
    quantity?: number;
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
    weight_kg?: number | string;
    stackable?: boolean;
  }>;
  const tt = transportTypeLabel(
    (shipment.transport_type as string) ?? ((r.transportType as string) || ''),
  );
  const fp = (r.freight_payer as string) ?? (r.freightPayer as string) ?? '';
  const status = String(shipment.status ?? '–');

  return (
    <Dialog.Root open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[1000]" />
        <Dialog.Content
          onClick={(e) => e.stopPropagation()}
          className="fixed left-1/2 top-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2 w-[min(680px,95vw)] max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl"
        >
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <Dialog.Title className="text-base font-semibold flex items-center gap-2">
              {shipment.shipment_number ?? shipment.id}
              <span className="text-xs rounded bg-gray-100 text-gray-700 px-2 py-0.5 uppercase">
                {status}
              </span>
              {shipment.classification === 'CHARTER_UMSCHLAG' && (
                <span
                  className="text-[10px] rounded bg-amber-100 text-amber-800 px-2 py-0.5 uppercase font-medium"
                  title="Charter-Umschlag: NV-Vorholung → Umschlag-Lager → FV-Hauptlauf"
                >
                  Charter-Umschlag
                </span>
              )}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-500 hover:text-gray-700" aria-label="Schließen">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="p-5 space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Section title="Versender">
                <div>{loadAddr?.name ?? '–'}</div>
                <div className="text-gray-600">{loadAddr?.street ?? ''}</div>
                <div className="text-gray-600">
                  {loadAddr?.zip ?? ''} {loadAddr?.city ?? ''} · {loadAddr?.country_code ?? ''}
                </div>
              </Section>
              <Section title="Empfänger">
                <div>{delivAddr?.name ?? '–'}</div>
                <div className="text-gray-600">{delivAddr?.street ?? ''}</div>
                <div className="text-gray-600">
                  {delivAddr?.zip ?? ''} {delivAddr?.city ?? ''} · {delivAddr?.country_code ?? ''}
                </div>
              </Section>
            </div>

            <Section title="Wirtschaftlichkeit">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <KV label="Erlös" value={fmtMoney(r.freight_revenue)} />
                <KV
                  label="Vorlauf"
                  value={fmtMoney(r.pre_carriage_cost)}
                />
                <KV
                  label="Hauptlauf"
                  value={fmtMoney(r.main_carriage_cost)}
                />
                <KV
                  label="Nachlauf"
                  value={fmtMoney(r.on_carriage_cost)}
                />
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 grid grid-cols-2 gap-x-4 gap-y-1.5">
                <KV
                  label="DB"
                  value={fmtMoney(r.contribution_margin)}
                />
                <KV label="DB %" value={fmtPct(r.cm_percent)} />
              </div>
            </Section>

            <Section title={`Packstücke (${items.length})`}>
              {items.length === 0 ? (
                <div className="text-gray-500 italic">Keine Packstücke.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-1 pr-2">Typ</th>
                      <th className="py-1 pr-2">Anz.</th>
                      <th className="py-1 pr-2">L×B×H cm</th>
                      <th className="py-1 pr-2">kg</th>
                      <th className="py-1 pr-2">Stapel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className="border-t border-gray-200">
                        <td className="py-1 pr-2">{it.package_type ?? '–'}</td>
                        <td className="py-1 pr-2">{it.quantity ?? 1}</td>
                        <td className="py-1 pr-2 font-mono">
                          {it.length_cm ?? '–'}×{it.width_cm ?? '–'}×{it.height_cm ?? '–'}
                        </td>
                        <td className="py-1 pr-2">
                          {it.weight_kg !== undefined ? Number(it.weight_kg).toFixed(0) : '–'}
                        </td>
                        <td className="py-1 pr-2">
                          {it.stackable === false ? '🔴' : '🔵'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title="Sendungsdaten">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <KV label="Verkehrsart" value={tt} />
                <KV label="Frankatur" value={FREIGHT_PAYER_LABEL[fp] ?? fp ?? '–'} />
                <KV label="Ladedatum" value={fmtDate((r.loading_date ?? r.loadingDate) as string)} />
                <KV label="Lieferdatum" value={fmtDate((r.delivery_date ?? r.deliveryDate) as string)} />
                <KV label="LDM" value={String(shipment.ldm ?? '–')} />
                <KV label="Gewicht (kg)" value={String((r.weight_kg ?? r.weightKg) ?? '–')} />
                <KV label="Packstücke" value={String((r.package_count ?? r.packageCount) ?? '–')} />
                <KV label="Volumen (m³)" value={String((r.volume_m3 ?? r.volumeM3) ?? '–')} />
                <KV label="Kundenref" value={String((r.customer_ref ?? r.customerRef) ?? '–')} />
                <KV label="Relation" value={shipment.relation ? `${shipment.relation.code}` : '–'} />
              </div>
              {((r.customer_note ?? r.customerNote) as string) && (
                <div className="mt-2">
                  <div className="text-[11px] uppercase text-gray-500">Notiz</div>
                  <div className="text-gray-800 whitespace-pre-wrap">
                    {(r.customer_note ?? r.customerNote) as string}
                  </div>
                </div>
              )}
              {(r.comment as string) && (
                <div className="mt-2">
                  <div className="text-[11px] uppercase text-gray-500">Bemerkung (intern)</div>
                  <div className="text-gray-800 whitespace-pre-wrap">{r.comment as string}</div>
                </div>
              )}
            </Section>
            <TourAssignmentSection shipment={shipment} />
            <CostsBreakdownSection shipmentId={shipment.id} />
          </div>

          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <button
                type="button"
                onClick={() => onNavigate('prev')}
                className="p-1 rounded hover:bg-gray-200"
                aria-label="Vorherige"
                title="Vorherige (←)"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('next')}
                className="p-1 rounded hover:bg-gray-200"
                aria-label="Nächste"
                title="Nächste (→)"
              >
                <ChevronRight size={16} />
              </button>
              <span className="ml-2 hidden sm:inline">
                E zum Bearbeiten · ESC zum Schließen
              </span>
            </div>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 text-sm">
                  Schließen
                </button>
              </Dialog.Close>
              {showEditButton && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="px-3 py-1.5 rounded bg-[#1e40af] text-white hover:bg-[#1e3a8a] text-sm inline-flex items-center gap-1"
                >
                  <Pencil size={14} />
                  Bearbeiten (E)
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-2">
      <div className="text-[11px] font-semibold uppercase text-gray-500 mb-1">{title}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="text-gray-800">{value || '–'}</div>
    </div>
  );
}

/**
 * R2.3: 2-Tour-Sicht für CHARTER_UMSCHLAG (NV-Vorholung + FV-Hauptlauf).
 * Auch sichtbar für nicht-Charter-Sendungen die genau eine Tour haben.
 * Touren sind klickbar (Link-Card mit Status + Datum).
 */
function TourAssignmentSection({ shipment }: { shipment: Shipment }) {
  // NV-Vorhol-Stops (kann mehrere PICKUP-Stops haben falls
  // re-disponiert wurde; meist 1).
  const nvStops = (shipment.nv_tour_stops ?? []).filter(
    (s) => s.nv_tour != null,
  );
  const fvTour = shipment.tours;
  if (nvStops.length === 0 && !fvTour) return null;

  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        Tour-Zuordnung
      </h3>
      <div className="space-y-2">
        {nvStops.map((s) => {
          const t = s.nv_tour!;
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 text-sm rounded-md border border-gray-100 bg-blue-50/40 px-3 py-1.5"
            >
              <span className="text-[10px] uppercase text-blue-700 font-medium">
                NV-Vorholung
              </span>
              <span className="font-mono text-xs">
                {t.nv_stamm_tour?.code ?? '—'}
              </span>
              <span className="text-xs text-gray-500">
                {t.datum?.slice(0, 10) ?? ''}
              </span>
              <span
                className={`ml-auto text-[10px] uppercase rounded px-1.5 py-0.5 ${
                  t.status === 'COMPLETED'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {t.status ?? '—'}
              </span>
              {s.stop_type && (
                <span className="text-[10px] text-gray-500 font-mono">
                  {s.stop_type}
                </span>
              )}
            </div>
          );
        })}
        {fvTour && (
          <div className="flex items-center gap-2 text-sm rounded-md border border-gray-100 bg-emerald-50/40 px-3 py-1.5">
            <span className="text-[10px] uppercase text-emerald-700 font-medium">
              FV-Hauptlauf
            </span>
            <span className="font-mono text-xs">
              {fvTour.tour_number ?? fvTour.id.slice(0, 8)}
            </span>
            <span className="text-xs text-gray-500">
              {fvTour.tour_date?.slice(0, 10) ?? ''}
            </span>
            {fvTour.subcontractors && (
              <span className="text-xs text-gray-600">
                · {fvTour.subcontractors.name}
              </span>
            )}
            <span
              className={`ml-auto text-[10px] uppercase rounded px-1.5 py-0.5 ${
                fvTour.status === 'planned'
                  ? 'bg-amber-100 text-amber-700'
                  : fvTour.status === 'dispatched'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
              }`}
            >
              {fvTour.status ?? '—'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * R2.3: Kosten-Breakdown — VORLAUF + HAUPTLAUF separat.
 * Konsumiert /shipments/:id/cost-components (liefert beide phases).
 */
function CostsBreakdownSection({ shipmentId }: { shipmentId: string }) {
  const [openCC, setOpenCC] = useState<CostComponent | null>(null);
  const q = useQuery<CostComponent[]>({
    queryKey: ['shipment-cost-comp', shipmentId],
    queryFn: async () =>
      (await api.get<CostComponent[]>(`/shipments/${shipmentId}/cost-components`))
        .data,
    enabled: !!shipmentId,
    staleTime: 30_000,
  });
  const vorlauf = (q.data ?? []).filter((c) => c.phase === 'VORLAUF');
  const hauptlauf = (q.data ?? []).filter((c) => c.phase === 'HAUPTLAUF');
  const total =
    vorlauf.reduce((a, c) => a + Number(c.total_eur ?? 0), 0) +
    hauptlauf.reduce((a, c) => a + Number(c.total_eur ?? 0), 0);

  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Kosten-Komponenten
        </h3>
        <span className="text-xs font-mono text-emerald-700">
          Σ € {total.toFixed(2)}
        </span>
      </div>
      {q.isLoading && <div className="text-sm text-gray-500">Lade...</div>}
      {!q.isLoading && vorlauf.length === 0 && hauptlauf.length === 0 && (
        <p className="text-sm text-gray-500">
          Noch keiner Tour zugeordnet.
        </p>
      )}

      {vorlauf.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] uppercase text-blue-700 font-medium mb-1">
            Vorlauf (NV)
          </div>
          <ul className="divide-y divide-gray-100">
            {vorlauf.map((c) => {
              const tour = (c as unknown as {
                nv_tour?: {
                  id: string;
                  datum: string;
                  nv_stamm_tour?: { code: string };
                };
              }).nv_tour;
              return (
                <li
                  key={c.id}
                  className="py-2 flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                  onClick={() => setOpenCC(c)}
                >
                  <span className="font-mono text-xs">
                    {tour?.nv_stamm_tour?.code ?? '—'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {tour?.datum?.slice(0, 10) ?? ''}
                  </span>
                  <span className="ml-auto font-mono text-emerald-700">
                    € {Number(c.total_eur ?? 0).toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hauptlauf.length > 0 && (
        <div>
          <div className="text-[10px] uppercase text-emerald-700 font-medium mb-1">
            Hauptlauf (FV)
          </div>
          <ul className="divide-y divide-gray-100">
            {hauptlauf.map((c) => {
              const faktoren = (c as unknown as {
                faktoren?: { tour_id?: string; source?: string };
              }).faktoren;
              return (
                <li
                  key={c.id}
                  className="py-2 flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                  onClick={() => setOpenCC(c)}
                >
                  <span className="font-mono text-xs text-gray-600">
                    {faktoren?.tour_id?.slice(0, 8) ?? '—'}
                  </span>
                  {faktoren?.source === 'auto_consolidate' && (
                    <span className="text-[10px] rounded bg-emerald-100 text-emerald-700 px-1.5 py-0.5">
                      auto
                    </span>
                  )}
                  <span className="ml-auto font-mono text-emerald-700">
                    € {Number(c.total_eur ?? 0).toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {openCC && (
        <CostDrillDownModal
          shipmentId={shipmentId}
          component={openCC}
          tourId={openCC.nv_tour_id ?? undefined}
          onClose={() => setOpenCC(null)}
        />
      )}
    </section>
  );
}

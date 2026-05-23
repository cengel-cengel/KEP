import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { TIER_OPTIONS } from '../../lib/customerTier';
import InlineEdit from './InlineEdit';
import ShipmentEditModal from '../ShipmentEditModal';
import StickyHead, { type QuickAction } from './StickyHead';
import AcuteSection, { type AcuteItem } from './AcuteSection';
import CollapsibleSection from './CollapsibleSection';
import {
  getShipmentSeverity,
  severityRank,
  type SeverityLevel,
} from '../../lib/severity';

interface ShipmentDetail {
  id: string;
  shipment_number?: string | null;
  status?: string | null;
  transport_type?: string | null;
  customer_ref?: string | null;
  comment?: string | null;
  customer_note?: string | null;
  freight_revenue?: string | number | null;
  weight_kg?: string | number | null;
  ldm?: string | number | null;
  loading_date?: string | null;
  delivery_date?: string | null;
  is_hazmat?: boolean | null;
  /** Persisted Risk-Severity (NV oder FV). */
  risk_severity?: string | null;
  risk_severity_fv?: string | null;
  /** M-1: priority_tier wird inline via Customer-Section editierbar. */
  customers?: {
    id: string;
    name: string;
    priority_tier?: 'VIP' | 'A' | 'B' | 'C' | string | null;
  } | null;
  addresses_shipments_loading_address_idToaddresses?: {
    name?: string | null;
    zip?: string | null;
    city?: string | null;
    street?: string | null;
  } | null;
  addresses_shipments_delivery_address_idToaddresses?: {
    name?: string | null;
    zip?: string | null;
    city?: string | null;
    street?: string | null;
  } | null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1 text-xs">
      <div className="text-gray-500">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function addrLine(
  a?: {
    name?: string | null;
    zip?: string | null;
    city?: string | null;
    street?: string | null;
  } | null,
): string {
  if (!a) return '—';
  const parts = [a.name, a.street, [a.zip, a.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return parts || '—';
}

export default function ShipmentDetailsTab({ shipmentId }: { shipmentId: string }) {
  const qc = useQueryClient();
  const [showEditModal, setShowEditModal] = useState(false);

  const detailQ = useQuery<ShipmentDetail>({
    queryKey: ['shipments', 'detail', shipmentId],
    queryFn: async () =>
      (await api.get<ShipmentDetail>(`/shipments/${shipmentId}`)).data,
    staleTime: 30_000,
  });

  const patchMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/shipments/${shipmentId}`, body);
      return data;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['shipments', 'detail', shipmentId] });
      const prev = qc.getQueryData<ShipmentDetail>([
        'shipments',
        'detail',
        shipmentId,
      ]);
      qc.setQueryData<ShipmentDetail>(
        ['shipments', 'detail', shipmentId],
        (old) => (old ? { ...old, ...vars } : old),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(['shipments', 'detail', shipmentId], ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['shipments', 'detail', shipmentId] });
    },
  });

  const severity = useMemo<SeverityLevel>(() => {
    if (!detailQ.data) return null;
    return getShipmentSeverity({
      loading_date: detailQ.data.loading_date,
      status: detailQ.data.status,
      risk_severity: detailQ.data.risk_severity,
      risk_severity_fv: detailQ.data.risk_severity_fv,
      customer: detailQ.data.customers,
    });
  }, [detailQ.data]);

  // P0-10: useMemo MUSS vor early-returns aufgerufen werden.
  // Daten-Refs intern aus detailQ.data, null-safe.
  const acuteItems: AcuteItem[] = useMemo(() => {
    const d = detailQ.data;
    if (!d) return [];
    if (!severity || severityRank(severity) === 0) return [];
    const label =
      severity === 'L1'
        ? 'Lade-Datum überschritten — Sendung noch nicht disponiert'
        : severity === 'L2'
          ? d.risk_severity === 'critical' || d.risk_severity_fv === 'critical'
            ? 'Stop außerhalb Zeitfenster (kritisch)'
            : 'Lade-Datum heute'
          : 'VIP-Kunde oder hohe Priorität';
    return [
      {
        id: 'shipment-sev',
        severity,
        icon: 'alert',
        label,
        primaryAction: {
          label: 'Edit',
          onClick: () => setShowEditModal(true),
        },
      },
    ];
  }, [detailQ.data, severity]);

  const s = detailQ.data;
  if (detailQ.isLoading) {
    return <div className="p-3 text-xs text-gray-400">Lädt…</div>;
  }
  if (!s) {
    return <div className="p-3 text-xs text-gray-400">Sendung nicht gefunden.</div>;
  }

  const titleStr = s.shipment_number ?? s.id.slice(0, 8);
  const subLabel = [s.status, s.transport_type, s.customers?.name]
    .filter(Boolean)
    .join(' · ');

  const quickActions: QuickAction[] = [
    {
      label: 'Vollständig bearbeiten…',
      icon: <Pencil size={11} />,
      onClick: () => setShowEditModal(true),
    },
  ];

  return (
    <>
      <StickyHead
        title={titleStr}
        subLabel={subLabel || undefined}
        severity={severity}
        quickActions={quickActions}
      />
      <div className="p-3 space-y-3">
        <AcuteSection items={acuteItems} />

        <BestTourSection shipmentId={shipmentId} />

        <section>
          <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
            Adressen
          </h3>
          <Row label="Versender">
            <span className="text-gray-700 text-xs">
              {addrLine(s.addresses_shipments_loading_address_idToaddresses)}
            </span>
          </Row>
          <Row label="Empfänger">
            <span className="text-gray-700 text-xs">
              {addrLine(s.addresses_shipments_delivery_address_idToaddresses)}
            </span>
          </Row>
        </section>

        <CollapsibleSection
          title="Priorität & Tier"
          defaultOpen={severity === 'L3'}
          storageKey="shipment.prio"
        >
          {s.customers?.id && (
            <CustomerTierRow
              customerId={s.customers.id}
              tier={s.customers.priority_tier ?? null}
              shipmentId={shipmentId}
            />
          )}
          {!s.customers?.id && (
            <div className="text-[11px] text-gray-400 italic px-1">
              Kein Customer-Tier (keine Stammdaten verknüpft).
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Stammdaten"
          storageKey="shipment.stamm"
        >
          <Row label="Nummer">
            <span className="font-mono text-gray-800">
              {s.shipment_number ?? '—'}
            </span>
          </Row>
          <Row label="Status">
            <span className="text-gray-700">{s.status ?? '—'}</span>
          </Row>
          <Row label="Transport">
            <span className="text-gray-700">{s.transport_type ?? '—'}</span>
          </Row>
          <Row label="Kunde">
            <span className="text-gray-700">{s.customers?.name ?? '—'}</span>
          </Row>
          <Row label="Kunden-Ref">
            <InlineEdit
              value={s.customer_ref}
              onSave={(v) => patchMut.mutateAsync({ customer_ref: v || null })}
              type="text"
              label="Kunden-Ref"
            />
          </Row>
        </CollapsibleSection>

        <CollapsibleSection
          title="Fracht-Details"
          storageKey="shipment.fracht"
        >
          <Row label="Gewicht">
            <span className="text-gray-700">
              {s.weight_kg != null ? `${Number(s.weight_kg).toFixed(0)} kg` : '—'}
            </span>
          </Row>
          <Row label="LDM">
            <span className="text-gray-700">
              {s.ldm != null ? `${Number(s.ldm).toFixed(1)}` : '—'}
            </span>
          </Row>
          <Row label="Lade-Datum">
            <span className="text-gray-700">
              {s.loading_date ? s.loading_date.slice(0, 10) : '—'}
            </span>
          </Row>
          <Row label="Liefer-Datum">
            <span className="text-gray-700">
              {s.delivery_date ? s.delivery_date.slice(0, 10) : '—'}
            </span>
          </Row>
        </CollapsibleSection>

        <section>
          <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
            Notizen
          </h3>
          <Row label="Dispo-Notiz">
            <InlineEdit
              value={s.comment}
              onSave={(v) => patchMut.mutateAsync({ comment: v || null })}
              type="textarea"
              placeholder="Klick zum Editieren…"
              label="Dispo-Notiz"
            />
          </Row>
          <Row label="Kunden-Notiz">
            <InlineEdit
              value={s.customer_note}
              onSave={(v) => patchMut.mutateAsync({ customer_note: v || null })}
              type="textarea"
              placeholder="Klick zum Editieren…"
              label="Kunden-Notiz"
            />
          </Row>
        </section>
      </div>

      {showEditModal && s && (
        <ShipmentEditModal
          shipment={s as any}
          open={showEditModal}
          onOpenChange={(o) => {
            setShowEditModal(o);
            if (!o) {
              qc.invalidateQueries({
                queryKey: ['shipments', 'detail', shipmentId],
              });
            }
          }}
        />
      )}
    </>
  );
}

/**
 * M-1: Customer-Tier-Inline-Edit. Schreibt auf PATCH /customers/:id,
 * invalidiert shipments-detail + eligible-trees + best-match.
 */
function CustomerTierRow({
  customerId,
  tier,
  shipmentId,
}: {
  customerId: string;
  tier: string | null;
  shipmentId: string;
}) {
  const qc = useQueryClient();
  const tierMut = useMutation({
    mutationFn: async (next: string) => {
      const body: Record<string, unknown> = {
        priorityTier: next === '' ? null : next,
      };
      const { data } = await api.patch(`/customers/${customerId}`, body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipments', 'detail', shipmentId] });
      qc.invalidateQueries({ queryKey: ['fv-eligible'] });
      qc.invalidateQueries({ queryKey: ['nv-elig'] });
      qc.invalidateQueries({ queryKey: ['shipment-best-match'] });
    },
  });
  return (
    <Row label="Tier">
      <InlineEdit
        value={tier ?? ''}
        options={[...TIER_OPTIONS]}
        onSave={(v) => tierMut.mutateAsync(v)}
        type="select"
        label="Customer-Tier"
      />
    </Row>
  );
}

interface BestTourMatch {
  tour_id: string;
  mode: 'nv' | 'fv';
  tour_number?: string | null;
  score: number;
  reason: string;
  /** B1: Tour-Identitaet fuer die Empfehlungs-Card. */
  datum?: string | null;
  subunternehmer_name?: string | null;
  stops_count?: number | null;
  last_stop_city?: string | null;
  used_ldm?: number | null;
  max_ldm?: number | null;
}

interface AssignFeedback {
  kind: 'ok' | 'err';
  msg: string;
}

/**
 * B1: Tour-Anzeige fuer die Empfehlungs-Card.
 * Prioritaet: tour_number (FV) -> Subunternehmer-Name (NV) -> UUID-Prefix.
 * Bewusst kein "NV"/"FV" davor in Bold, die mode-Badge steht links daneben.
 */
function tourDisplayName(m: BestTourMatch): string {
  if (m.tour_number) return m.tour_number;
  if (m.subunternehmer_name) return m.subunternehmer_name;
  return m.tour_id.slice(0, 8);
}

function formatDatum(iso?: string | null): string | null {
  if (!iso) return null;
  // ISO "2026-05-23T…" → "23.05."
  const d = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const parts = d.split('-');
  if (parts.length !== 3) return null;
  return `${parts[2]}.${parts[1]}.`;
}

function BestTourSection({ shipmentId }: { shipmentId: string }) {
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState<AssignFeedback | null>(null);
  const matchQ = useQuery<BestTourMatch[]>({
    queryKey: ['shipment-best-match', shipmentId],
    queryFn: async () =>
      (
        await api.get<BestTourMatch[]>('/tours/best-match', {
          params: { shipment_id: shipmentId },
        })
      ).data,
    staleTime: 30_000,
  });

  const assignMut = useMutation({
    mutationFn: async (vars: {
      tour_id: string;
      mode: 'nv' | 'fv';
      label: string;
    }) => {
      const url =
        vars.mode === 'fv'
          ? `/tours/${vars.tour_id}/batch-stops`
          : `/nv-touren/${vars.tour_id}/batch-stops`;
      await api.post(url, { adds: [shipmentId], removes: [] });
      return { label: vars.label };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['fv-touren'] });
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
      qc.invalidateQueries({ queryKey: ['fv-eligible'] });
      qc.invalidateQueries({ queryKey: ['nv-elig'] });
      qc.invalidateQueries({ queryKey: ['shipment-best-match', shipmentId] });
      // B1: Sichtbares Success-Feedback (5s lokal — ContextPanel hat
      // keinen globalen Toast-Layer ueber AppLayout).
      setFeedback({ kind: 'ok', msg: `Zugeordnet zu ${res.label}.` });
      window.setTimeout(() => setFeedback(null), 5000);
    },
    onError: (e: any) => {
      // BE liefert NestJS-Standard { message: '…' } in error.response.data.
      const beMsg = e?.response?.data?.message;
      const msg = Array.isArray(beMsg)
        ? beMsg.join(', ')
        : typeof beMsg === 'string'
          ? beMsg
          : 'Zuordnen fehlgeschlagen.';
      setFeedback({ kind: 'err', msg });
    },
  });

  if (matchQ.isLoading) return null;
  const matches = matchQ.data ?? [];
  if (matches.length === 0 && !feedback) return null;

  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1 flex items-center gap-1">
        <Sparkles size={11} />
        Empfehlungen
      </h3>
      {feedback && (
        <div
          onClick={() => setFeedback(null)}
          className={`mb-1.5 cursor-pointer rounded border px-2 py-1 text-[11px] ${
            feedback.kind === 'ok'
              ? 'bg-green-50 border-green-300 text-green-800'
              : 'bg-red-50 border-red-300 text-red-800'
          }`}
          title="Schliessen"
        >
          {feedback.msg}
        </div>
      )}
      <div className="space-y-1.5">
        {matches.map((m) => {
          const col =
            m.score >= 70
              ? 'border-green-300 bg-green-50'
              : m.score >= 40
                ? 'border-amber-300 bg-amber-50'
                : 'border-gray-300 bg-gray-50';
          const datum = formatDatum(m.datum);
          const ldmRatio =
            m.max_ldm != null && m.max_ldm > 0 && m.used_ldm != null
              ? Math.round((m.used_ldm / m.max_ldm) * 100)
              : null;
          const subRow = [
            m.stops_count != null ? `${m.stops_count} Stops` : null,
            m.last_stop_city ? `zuletzt ${m.last_stop_city}` : null,
            ldmRatio != null ? `${ldmRatio}% ldm` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div
              key={m.tour_id}
              className={`border ${col} rounded px-2 py-1.5 text-xs`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase text-gray-500">
                  {m.mode}
                </span>
                <span className="font-semibold truncate" title={m.tour_id}>
                  {tourDisplayName(m)}
                </span>
                {datum && (
                  <span className="text-[10px] text-gray-600">{datum}</span>
                )}
                <span className="ml-auto text-[10px] font-mono text-gray-700">
                  Score {m.score}
                </span>
              </div>
              {subRow && (
                <div className="text-[10px] text-gray-600 mt-0.5">{subRow}</div>
              )}
              <div className="text-[10px] text-gray-600 mt-0.5">
                {m.reason}
              </div>
              <button
                onClick={() =>
                  assignMut.mutate({
                    tour_id: m.tour_id,
                    mode: m.mode,
                    label: tourDisplayName(m),
                  })
                }
                disabled={assignMut.isPending}
                className="mt-1 px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {assignMut.isPending ? 'Ordne zu…' : 'Zuordnen'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

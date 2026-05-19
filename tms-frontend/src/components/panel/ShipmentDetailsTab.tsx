import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { api } from '../../lib/api';
import InlineEdit from './InlineEdit';
import ShipmentEditModal from '../ShipmentEditModal';

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
  customers?: { id: string; name: string } | null;
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

  // Generischer PATCH-Mutation für Inline-Edits.
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

  const s = detailQ.data;
  if (detailQ.isLoading) {
    return <div className="p-3 text-xs text-gray-400">Lädt…</div>;
  }
  if (!s) {
    return <div className="p-3 text-xs text-gray-400">Sendung nicht gefunden.</div>;
  }

  return (
    <div className="p-3 space-y-3">
      <section>
        <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
          Stammdaten
        </h3>
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
      </section>

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

      <section>
        <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
          Fracht
        </h3>
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
      </section>

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

      <div className="pt-2 border-t">
        <button
          onClick={() => setShowEditModal(true)}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:bg-blue-50 py-1.5 rounded"
        >
          <Pencil size={12} />
          Vollständig bearbeiten…
        </button>
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
    </div>
  );
}

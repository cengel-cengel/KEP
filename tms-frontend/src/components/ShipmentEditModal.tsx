import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import type { Shipment } from '../types/shipment';
import {
  TRANSPORT_TYPE_OPTIONS,
  TRANSPORT_TYPE_DEFAULT,
} from '../constants/transportTypes';

const FREIGHT_PAYER_OPTIONS = [
  { value: 'sender',      label: 'Absender (Frei)' },
  { value: 'recipient',   label: 'Empfänger (Unfrei)' },
  { value: 'third_party', label: 'Dritter' },
] as const;

interface Props {
  shipment: Shipment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  transportType: string;
  freightPayer: string;
  customerRef: string;
  customerNote: string;
  comment: string;
  loadingDate: string;
  deliveryDate: string;
  packageCount: string;
  weightKg: string;
  ldm: string;
  volumeM3: string;
}

function isoDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function buildInitial(s: Shipment): FormState {
  const r = s as unknown as Record<string, unknown>;
  return {
    transportType: (s.transport_type ?? (r.transportType as string) ?? TRANSPORT_TYPE_DEFAULT) as string,
    freightPayer: (r.freight_payer as string) ?? (r.freightPayer as string) ?? 'sender',
    customerRef: (r.customer_ref as string) ?? (r.customerRef as string) ?? '',
    customerNote: (r.customer_note as string) ?? (r.customerNote as string) ?? '',
    comment: (r.comment as string) ?? '',
    loadingDate: isoDate((r.loading_date ?? r.loadingDate) as string),
    deliveryDate: isoDate((r.delivery_date ?? r.deliveryDate) as string),
    packageCount: String((r.package_count ?? r.packageCount ?? '') as string),
    weightKg: String((r.weight_kg ?? r.weightKg ?? '') as string),
    ldm: String(s.ldm ?? ''),
    volumeM3: String((r.volume_m3 ?? r.volumeM3 ?? '') as string),
  };
}

export default function ShipmentEditModal({ shipment, open, onOpenChange }: Props) {
  const [form, setForm] = useState<FormState>(() => buildInitial(shipment));
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setForm(buildInitial(shipment));
      setError(null);
    }
  }, [open, shipment]);

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      await api.patch(`/shipments/${shipment.id}`, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shipments'] });
      void queryClient.invalidateQueries({ queryKey: ['tours'] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Speichern fehlgeschlagen.';
      setError(typeof msg === 'string' ? msg : 'Speichern fehlgeschlagen.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));
    const payload: Record<string, unknown> = {
      transportType: form.transportType,
      freightPayer: form.freightPayer || null,
      customerRef: form.customerRef || undefined,
      customerNote: form.customerNote || null,
      comment: form.comment || null,
      loadingDate: form.loadingDate || undefined,
      deliveryDate: form.deliveryDate || undefined,
      packageCount: num(form.packageCount),
      weightKg: num(form.weightKg),
      ldm: num(form.ldm),
      volumeM3: num(form.volumeM3),
    };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) delete payload[k];
    });
    mutation.mutate(payload);
  }

  const r = shipment as unknown as Record<string, unknown>;
  const loadAddr =
    (r.loadingAddress as { name?: string; city?: string; zip?: string; country_code?: string } | undefined) ??
    (r.addresses_shipments_loading_address_idToaddresses as { name?: string; city?: string; zip?: string; country_code?: string } | undefined);
  const delivAddr =
    (r.deliveryAddress as { name?: string; city?: string; zip?: string; country_code?: string } | undefined) ??
    (r.addresses_shipments_delivery_address_idToaddresses as { name?: string; city?: string; zip?: string; country_code?: string } | undefined);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content
          onClick={(e) => e.stopPropagation()}
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(680px,95vw)] max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl"
        >
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <Dialog.Title className="text-base font-semibold">
              Sendung bearbeiten · {shipment.shipment_number ?? shipment.id}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-500 hover:text-gray-700" aria-label="Schließen">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-gray-200 bg-gray-50 p-2">
                <div className="text-[11px] font-semibold uppercase text-gray-500 mb-1">Versender (read-only)</div>
                <div>{loadAddr?.name ?? '–'}</div>
                <div className="text-gray-600">{loadAddr?.zip ?? ''} {loadAddr?.city ?? ''} · {loadAddr?.country_code ?? ''}</div>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 p-2">
                <div className="text-[11px] font-semibold uppercase text-gray-500 mb-1">Empfänger (read-only)</div>
                <div>{delivAddr?.name ?? '–'}</div>
                <div className="text-gray-600">{delivAddr?.zip ?? ''} {delivAddr?.city ?? ''} · {delivAddr?.country_code ?? ''}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase text-gray-600">Verkehrsart</span>
                <select
                  value={form.transportType}
                  onChange={(e) => set('transportType', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 bg-white"
                >
                  {TRANSPORT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase text-gray-600">Frankatur</span>
                <select
                  value={form.freightPayer}
                  onChange={(e) => set('freightPayer', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 bg-white"
                >
                  {FREIGHT_PAYER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase text-gray-600">Packstücke</span>
                <input type="number" min="0" value={form.packageCount}
                  onChange={(e) => set('packageCount', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase text-gray-600">Gewicht (kg)</span>
                <input type="number" min="0" step="0.01" value={form.weightKg}
                  onChange={(e) => set('weightKg', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase text-gray-600">LDM</span>
                <input type="number" min="0" step="0.01" value={form.ldm}
                  onChange={(e) => set('ldm', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase text-gray-600">Volumen (m³)</span>
                <input type="number" min="0" step="0.001" value={form.volumeM3}
                  onChange={(e) => set('volumeM3', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase text-gray-600">Ladedatum</span>
                <input type="date" value={form.loadingDate}
                  onChange={(e) => set('loadingDate', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase text-gray-600">Lieferdatum</span>
                <input type="date" value={form.deliveryDate}
                  onChange={(e) => set('deliveryDate', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase text-gray-600">Kundenreferenz</span>
              <input type="text" value={form.customerRef}
                onChange={(e) => set('customerRef', e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase text-gray-600">Notiz / Kundenhinweis</span>
              <textarea rows={2} value={form.customerNote}
                onChange={(e) => set('customerNote', e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase text-gray-600">Bemerkung (intern)</span>
              <textarea rows={2} value={form.comment}
                onChange={(e) => set('comment', e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5" />
            </label>

            {error && (
              <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-xs border border-red-200">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Dialog.Close asChild>
                <button type="button" className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50">
                  Abbrechen
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="px-4 py-1.5 rounded bg-[#1e40af] text-white hover:bg-[#1e3a8a] disabled:opacity-50"
              >
                {mutation.isPending ? 'Speichere…' : 'Speichern'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

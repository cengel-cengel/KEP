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

interface AddressForm {
  id: string | null;
  name: string;
  street: string;
  zip: string;
  city: string;
  countryCode: string;
}

interface FormState {
  // Sendungsdaten
  transportType: string;
  freightPayer: string;
  customerRef: string;
  customerNote: string;
  comment: string;
  loadingDate: string;
  deliveryDate: string;
  packageCount: string;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  ldm: string;
  volumeM3: string;
  // Adressen
  loading: AddressForm;
  delivery: AddressForm;
}

function isoDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function pickAddr(
  obj: Record<string, unknown>,
  longKey: string,
  shortKey: string,
): AddressForm {
  const a =
    (obj[shortKey] as Record<string, unknown> | undefined) ??
    (obj[longKey] as Record<string, unknown> | undefined);
  return {
    id: (a?.id as string) ?? null,
    name: (a?.name as string) ?? '',
    street: (a?.street as string) ?? '',
    zip: (a?.zip as string) ?? '',
    city: (a?.city as string) ?? '',
    countryCode: ((a?.country_code as string) ?? (a?.countryCode as string) ?? 'DE').toUpperCase(),
  };
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
    lengthCm: String((r.length_cm ?? r.lengthCm ?? '') as string),
    widthCm: String((r.width_cm ?? r.widthCm ?? '') as string),
    heightCm: String((r.height_cm ?? r.heightCm ?? '') as string),
    ldm: String(s.ldm ?? ''),
    volumeM3: String((r.volume_m3 ?? r.volumeM3 ?? '') as string),
    loading: pickAddr(r, 'addresses_shipments_loading_address_idToaddresses', 'loadingAddress'),
    delivery: pickAddr(r, 'addresses_shipments_delivery_address_idToaddresses', 'deliveryAddress'),
  };
}

function num(s: string): number | undefined {
  if (s.trim() === '') return undefined;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Liefert nur die Felder die sich geaendert haben (Diff). */
function diffShipment(form: FormState, init: FormState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (form.transportType !== init.transportType) out.transportType = form.transportType;
  if (form.freightPayer !== init.freightPayer) out.freightPayer = form.freightPayer || null;
  if (form.customerRef !== init.customerRef) out.customerRef = form.customerRef || undefined;
  if (form.customerNote !== init.customerNote) out.customerNote = form.customerNote || null;
  if (form.comment !== init.comment) out.comment = form.comment || null;
  if (form.loadingDate !== init.loadingDate && form.loadingDate) out.loadingDate = form.loadingDate;
  if (form.deliveryDate !== init.deliveryDate && form.deliveryDate) out.deliveryDate = form.deliveryDate;
  if (form.packageCount !== init.packageCount) out.packageCount = num(form.packageCount);
  if (form.weightKg !== init.weightKg) out.weightKg = num(form.weightKg);
  if (form.lengthCm !== init.lengthCm) out.lengthCm = num(form.lengthCm);
  if (form.widthCm !== init.widthCm) out.widthCm = num(form.widthCm);
  if (form.heightCm !== init.heightCm) out.heightCm = num(form.heightCm);
  if (form.ldm !== init.ldm) out.ldm = num(form.ldm);
  if (form.volumeM3 !== init.volumeM3) out.volumeM3 = num(form.volumeM3);
  // undefined-Eintraege entfernen
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function diffAddress(form: AddressForm, init: AddressForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (form.name !== init.name) out.name = form.name;
  if (form.street !== init.street) out.street = form.street;
  if (form.zip !== init.zip) out.zip = form.zip;
  if (form.city !== init.city) out.city = form.city;
  if (form.countryCode !== init.countryCode) out.countryCode = form.countryCode;
  return out;
}

export default function ShipmentEditModal({ shipment, open, onOpenChange }: Props) {
  const [form, setForm] = useState<FormState>(() => buildInitial(shipment));
  const [initial, setInitial] = useState<FormState>(() => buildInitial(shipment));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      const init = buildInitial(shipment);
      setForm(init);
      setInitial(init);
      setError(null);
    }
  }, [open, shipment]);

  const mutation = useMutation({
    mutationFn: async () => {
      const shipDiff = diffShipment(form, initial);
      const loadDiff = diffAddress(form.loading, initial.loading);
      const delivDiff = diffAddress(form.delivery, initial.delivery);
      const tasks: Promise<unknown>[] = [];
      if (Object.keys(shipDiff).length > 0) {
        tasks.push(api.patch(`/shipments/${shipment.id}`, shipDiff));
      }
      if (form.loading.id && Object.keys(loadDiff).length > 0) {
        tasks.push(api.patch(`/addresses/${form.loading.id}`, loadDiff));
      }
      if (form.delivery.id && Object.keys(delivDiff).length > 0) {
        tasks.push(api.patch(`/addresses/${form.delivery.id}`, delivDiff));
      }
      if (tasks.length === 0) return { noop: true };
      await Promise.all(tasks);
      return { noop: false };
    },
    onMutate: () => setPending(true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shipments'] });
      void queryClient.invalidateQueries({ queryKey: ['tours'] });
      setPending(false);
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Speichern fehlgeschlagen.';
      setError(typeof msg === 'string' ? msg : 'Speichern fehlgeschlagen.');
      setPending(false);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function setAddr(which: 'loading' | 'delivery', patch: Partial<AddressForm>) {
    setForm((prev) => ({ ...prev, [which]: { ...prev[which], ...patch } }));
  }

  const hasShipDiff = Object.keys(diffShipment(form, initial)).length > 0;
  const hasAddrDiff =
    Object.keys(diffAddress(form.loading, initial.loading)).length > 0 ||
    Object.keys(diffAddress(form.delivery, initial.delivery)).length > 0;
  const dirty = hasShipDiff || hasAddrDiff;

  function renderAddressSection(label: string, which: 'loading' | 'delivery') {
    const a = form[which];
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-2 space-y-1.5">
        <div className="text-[11px] font-semibold uppercase text-gray-500">{label}</div>
        <input type="text" placeholder="Name"
          value={a.name}
          onChange={(e) => setAddr(which, { name: e.target.value })}
          className="w-full rounded border border-gray-300 px-2 py-1 bg-white" />
        <input type="text" placeholder="Straße"
          value={a.street}
          onChange={(e) => setAddr(which, { street: e.target.value })}
          className="w-full rounded border border-gray-300 px-2 py-1 bg-white" />
        <div className="grid grid-cols-3 gap-1.5">
          <input type="text" placeholder="PLZ"
            value={a.zip}
            onChange={(e) => setAddr(which, { zip: e.target.value })}
            className="col-span-1 rounded border border-gray-300 px-2 py-1 bg-white" />
          <input type="text" placeholder="Ort"
            value={a.city}
            onChange={(e) => setAddr(which, { city: e.target.value })}
            className="col-span-2 rounded border border-gray-300 px-2 py-1 bg-white" />
        </div>
        <input type="text" placeholder="Land (ISO)" maxLength={2}
          value={a.countryCode}
          onChange={(e) => setAddr(which, { countryCode: e.target.value.toUpperCase() })}
          className="w-20 rounded border border-gray-300 px-2 py-1 bg-white uppercase" />
      </div>
    );
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {renderAddressSection('Versender', 'loading')}
              {renderAddressSection('Empfänger', 'delivery')}
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

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-600">Stk</span>
                <input type="number" min="0" value={form.packageCount}
                  onChange={(e) => set('packageCount', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-600">Gewicht kg</span>
                <input type="number" min="0" step="0.01" value={form.weightKg}
                  onChange={(e) => set('weightKg', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-600">Länge cm</span>
                <input type="number" min="0" value={form.lengthCm}
                  onChange={(e) => set('lengthCm', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-600">Breite cm</span>
                <input type="number" min="0" value={form.widthCm}
                  onChange={(e) => set('widthCm', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-600">Höhe cm</span>
                <input type="number" min="0" value={form.heightCm}
                  onChange={(e) => set('heightCm', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-600">LDM</span>
                <input type="number" min="0" step="0.01" value={form.ldm}
                  onChange={(e) => set('ldm', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-600">Volumen m³</span>
                <input type="number" min="0" step="0.001" value={form.volumeM3}
                  onChange={(e) => set('volumeM3', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-600">Ladedatum</span>
                <input type="date" value={form.loadingDate}
                  onChange={(e) => set('loadingDate', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-gray-600">Lieferdatum</span>
                <input type="date" value={form.deliveryDate}
                  onChange={(e) => set('deliveryDate', e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase text-gray-600">Kundenreferenz</span>
              <input type="text" value={form.customerRef}
                onChange={(e) => set('customerRef', e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase text-gray-600">Notiz / Kundenhinweis</span>
              <textarea rows={2} value={form.customerNote}
                onChange={(e) => set('customerNote', e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase text-gray-600">Bemerkung (intern)</span>
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
                disabled={pending || !dirty}
                className="px-4 py-1.5 rounded bg-[#1e40af] text-white hover:bg-[#1e3a8a] disabled:opacity-50"
              >
                {pending ? 'Speichere…' : dirty ? 'Speichern' : 'Keine Änderungen'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

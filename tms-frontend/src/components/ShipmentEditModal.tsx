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

interface PackageItemForm {
  /** Echte DB-uuid, oder Marker "new-<n>" fuer noch nicht persistierte Items. */
  id: string;
  /** TRUE wenn neu hinzugefuegt (kein Server-id). */
  isNew: boolean;
  packageType: string;
  quantity: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightKg: string;
  stackable: boolean;
}

const PACKAGE_TYPE_OPTIONS = [
  { value: 'pallet_euro',     label: 'Euro-Pal' },
  { value: 'pallet_one_way',  label: 'Einweg-Pal' },
  { value: 'box',             label: 'Karton' },
  { value: 'drum',            label: 'Fass' },
  { value: 'bulk',            label: 'Bulk' },
  { value: 'coil',            label: 'Coil' },
  { value: 'container',       label: 'Container' },
  { value: 'other',           label: 'Sonstige' },
] as const;

interface FormState {
  // Sendungsdaten (Aggregat-Mengen sind nicht mehr editierbar —
  // werden im Backend aus items berechnet).
  transportType: string;
  freightPayer: string;
  customerRef: string;
  customerNote: string;
  comment: string;
  loadingDate: string;
  deliveryDate: string;
  // Adressen
  loading: AddressForm;
  delivery: AddressForm;
  // Pro-Item Maße (Single-Source-of-Truth)
  items: PackageItemForm[];
  /** Bei Save zu loeschende DB-Items (echte ids). */
  deletedItemIds: string[];
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
    loading: pickAddr(r, 'addresses_shipments_loading_address_idToaddresses', 'loadingAddress'),
    delivery: pickAddr(r, 'addresses_shipments_delivery_address_idToaddresses', 'deliveryAddress'),
    items: ((s.shipment_package_items ?? []) as Array<{
      id?: string;
      package_type?: string;
      quantity?: number;
      length_cm?: number;
      width_cm?: number;
      height_cm?: number;
      weight_kg?: number | string;
      stackable?: boolean;
    }>).map((it) => ({
      id: it.id ?? `existing-${Math.random().toString(36).slice(2)}`,
      isNew: false,
      packageType: it.package_type ?? 'pallet_euro',
      quantity: String(it.quantity ?? 1),
      lengthCm: String(it.length_cm ?? ''),
      widthCm: String(it.width_cm ?? ''),
      heightCm: String(it.height_cm ?? ''),
      weightKg: String(it.weight_kg ?? ''),
      stackable: it.stackable !== false,
    })),
    deletedItemIds: [],
  };
}

let newItemCounter = 0;
function makeNewItem(): PackageItemForm {
  newItemCounter++;
  return {
    id: `new-${newItemCounter}`,
    isNew: true,
    packageType: 'pallet_euro',
    quantity: '1',
    lengthCm: '120',
    widthCm: '80',
    heightCm: '100',
    weightKg: '',
    stackable: true,
  };
}

function num(s: string): number | undefined {
  if (s.trim() === '') return undefined;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
function numInt(s: string): number | undefined {
  const n = num(s);
  return n === undefined ? undefined : Math.round(n);
}
function numFloat(s: string): number | undefined {
  return num(s);
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
  // Aggregat-Mengen werden im Backend aus items berechnet — kein Diff hier.
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
      // Package-Items: DELETE / POST / PATCH
      for (const id of form.deletedItemIds) {
        tasks.push(api.delete(`/shipment-package-items/${id}`));
      }
      const initialItemsById = new Map(
        initial.items.map((i) => [i.id, i] as const),
      );
      for (const it of form.items) {
        if (it.isNew) {
          tasks.push(
            api.post(`/shipment-package-items`, {
              shipmentId: shipment.id,
              packageType: it.packageType,
              quantity: numInt(it.quantity) ?? 1,
              lengthCm: numInt(it.lengthCm),
              widthCm: numInt(it.widthCm),
              heightCm: numInt(it.heightCm),
              weightKg: numFloat(it.weightKg) ?? 0,
              stackable: it.stackable,
            }),
          );
        } else {
          const init = initialItemsById.get(it.id);
          if (!init) continue;
          const itemDiff: Record<string, unknown> = {};
          if (it.packageType !== init.packageType) itemDiff.packageType = it.packageType;
          if (it.quantity !== init.quantity) itemDiff.quantity = numInt(it.quantity);
          if (it.lengthCm !== init.lengthCm) itemDiff.lengthCm = numInt(it.lengthCm);
          if (it.widthCm !== init.widthCm) itemDiff.widthCm = numInt(it.widthCm);
          if (it.heightCm !== init.heightCm) itemDiff.heightCm = numInt(it.heightCm);
          if (it.weightKg !== init.weightKg) itemDiff.weightKg = numFloat(it.weightKg);
          if (it.stackable !== init.stackable) itemDiff.stackable = it.stackable;
          Object.keys(itemDiff).forEach((k) => itemDiff[k] === undefined && delete itemDiff[k]);
          if (Object.keys(itemDiff).length > 0) {
            tasks.push(api.patch(`/shipment-package-items/${it.id}`, itemDiff));
          }
        }
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

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function setAddr(which: 'loading' | 'delivery', patch: Partial<AddressForm>) {
    setForm((prev) => ({ ...prev, [which]: { ...prev[which], ...patch } }));
  }
  function setItem(id: string, patch: Partial<PackageItemForm>) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  }
  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, makeNewItem()] }));
  }
  function removeItem(id: string) {
    setForm((prev) => {
      const target = prev.items.find((i) => i.id === id);
      const items = prev.items.filter((i) => i.id !== id);
      const deletedItemIds =
        target && !target.isNew ? [...prev.deletedItemIds, target.id] : prev.deletedItemIds;
      return { ...prev, items, deletedItemIds };
    });
  }

  const hasShipDiff = Object.keys(diffShipment(form, initial)).length > 0;
  const hasAddrDiff =
    Object.keys(diffAddress(form.loading, initial.loading)).length > 0 ||
    Object.keys(diffAddress(form.delivery, initial.delivery)).length > 0;
  const hasItemDiff = (() => {
    if (form.deletedItemIds.length > 0) return true;
    if (form.items.some((i) => i.isNew)) return true;
    const initById = new Map(initial.items.map((i) => [i.id, i] as const));
    return form.items.some((it) => {
      const init = initById.get(it.id);
      if (!init) return true;
      return (
        it.packageType !== init.packageType ||
        it.quantity !== init.quantity ||
        it.lengthCm !== init.lengthCm ||
        it.widthCm !== init.widthCm ||
        it.heightCm !== init.heightCm ||
        it.weightKg !== init.weightKg ||
        it.stackable !== init.stackable
      );
    });
  })();
  const dirty = hasShipDiff || hasAddrDiff || hasItemDiff;

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!dirty) return;
    mutation.mutate();
  }

  // Keyboard-Shortcuts: Esc schliesst (mit Confirm wenn dirty),
  // Cmd/Ctrl+S speichert (auch bei Input-Fokus — Standard-Verhalten).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (!pending && dirty) handleSubmit();
        return;
      }
      if (e.key === 'Escape') {
        if (dirty) {
          if (window.confirm('Ungespeicherte Änderungen verwerfen?')) {
            onOpenChange(false);
          }
        } else {
          onOpenChange(false);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty, pending]);

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

            <div className="rounded border border-gray-200 bg-gray-50 p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase text-gray-500">
                  Packstücke ({form.items.length})
                </span>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-xs rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50"
                >
                  + Packstück
                </button>
              </div>
              {form.items.length === 0 && (
                <div className="text-[11px] text-gray-500 italic">Keine Packstücke. Klick + Packstück.</div>
              )}
              {form.items.map((it) => (
                <div
                  key={it.id}
                  className="grid grid-cols-2 sm:grid-cols-7 gap-1.5 items-end bg-white rounded border border-gray-200 p-2"
                >
                  <label className="flex flex-col gap-0.5 col-span-2 sm:col-span-2">
                    <span className="text-[10px] uppercase text-gray-500">Typ</span>
                    <select
                      value={it.packageType}
                      onChange={(e) => setItem(it.id, { packageType: e.target.value })}
                      className="rounded border border-gray-300 px-1.5 py-1 text-xs"
                    >
                      {PACKAGE_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase text-gray-500">Anz.</span>
                    <input type="number" min="1" value={it.quantity}
                      onChange={(e) => setItem(it.id, { quantity: e.target.value })}
                      className="rounded border border-gray-300 px-1.5 py-1 text-xs" />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase text-gray-500">L cm</span>
                    <input type="number" min="1" value={it.lengthCm}
                      onChange={(e) => setItem(it.id, { lengthCm: e.target.value })}
                      className="rounded border border-gray-300 px-1.5 py-1 text-xs" />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase text-gray-500">B cm</span>
                    <input type="number" min="1" value={it.widthCm}
                      onChange={(e) => setItem(it.id, { widthCm: e.target.value })}
                      className="rounded border border-gray-300 px-1.5 py-1 text-xs" />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase text-gray-500">H cm</span>
                    <input type="number" min="1" value={it.heightCm}
                      onChange={(e) => setItem(it.id, { heightCm: e.target.value })}
                      className="rounded border border-gray-300 px-1.5 py-1 text-xs" />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase text-gray-500">kg</span>
                    <input type="number" min="0" step="0.01" value={it.weightKg}
                      onChange={(e) => setItem(it.id, { weightKg: e.target.value })}
                      className="rounded border border-gray-300 px-1.5 py-1 text-xs" />
                  </label>
                  <div className="flex items-center justify-between sm:justify-start gap-2 col-span-2 sm:col-span-1">
                    <label className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={it.stackable}
                        onChange={(e) => setItem(it.id, { stackable: e.target.checked })}
                      />
                      Stapelbar
                    </label>
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                      title="Packstück entfernen"
                      aria-label="Packstück entfernen"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
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

            <div className="flex justify-between items-center gap-2 pt-2 border-t">
              <span className="text-[11px] text-gray-500 hidden sm:inline">
                Cmd/Ctrl+S: Speichern · ESC: Schließen
              </span>
              <div className="flex gap-2 ml-auto">
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
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

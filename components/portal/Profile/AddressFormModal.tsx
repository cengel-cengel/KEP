'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { AddressBookEntry } from '@/types/addressBook';

const COUNTRY_KEYS = ['de', 'at', 'ch', 'fr', 'it', 'nl', 'be', 'lu', 'pl', 'gb'] as const;

export type AddressDraft = Omit<AddressBookEntry, 'id'> & { id?: string };

const EMPTY: AddressDraft = {
  company: '',
  contact: '',
  street: '',
  addressAddition: '',
  zip: '',
  city: '',
  country: 'DE',
  phone: '',
  email: '',
  notes: '',
};

interface ModalProps {
  open: boolean;
  initial?: AddressDraft;
  onClose: () => void;
  onSaved: (entry: AddressBookEntry) => void;
}

export function AddressFormModal({ open, initial, onClose, onSaved }: ModalProps) {
  const t = useTranslations('PortalProfile.section_address_book');
  const tForm = useTranslations('PortalNewShipment.step1_recipient');
  const [draft, setDraft] = useState<AddressDraft>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(initial ?? EMPTY);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const isEdit = Boolean(initial?.id);

  async function save() {
    setSaving(true);
    try {
      const url = isEdit
        ? `/api/portal/address-book/${initial?.id}`
        : '/api/portal/address-book';
      const method = isEdit ? 'PATCH' : 'POST';
      const { id: _ignored, ...payload } = draft;
      void _ignored;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { success: boolean; entry?: AddressBookEntry };
      if (!res.ok || !data.success) {
        setSaving(false);
        return;
      }
      const saved: AddressBookEntry = data.entry ?? { id: initial!.id!, ...payload } as AddressBookEntry;
      onSaved(saved);
    } catch {
      // ignore - keep modal open
    } finally {
      setSaving(false);
    }
  }

  const countryOptions = COUNTRY_KEYS.map((k) => ({
    value: k.toUpperCase(),
    label: tForm(`country_${k}`),
  }));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="addr-modal-title" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand/60" onClick={onClose} aria-hidden="true" />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="addr-modal-title" className="text-base font-semibold text-brand">
            {isEdit ? t('modal_edit_title') : t('modal_new_title')}
          </h2>
          <button
            type="button"
            aria-label={t('edit')}
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <Input label={tForm('company')} required value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
          <Input label={tForm('contact')} required value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} />
          <Input className="sm:col-span-2" label={tForm('street')} required value={draft.street} onChange={(e) => setDraft({ ...draft, street: e.target.value })} />
          <Input className="sm:col-span-2" label={tForm('address_addition')} value={draft.addressAddition ?? ''} onChange={(e) => setDraft({ ...draft, addressAddition: e.target.value })} />
          <Input label={tForm('zip')} required value={draft.zip} onChange={(e) => setDraft({ ...draft, zip: e.target.value })} />
          <Input label={tForm('city')} required value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
          <Select label={tForm('country')} required value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} options={countryOptions} />
          <Input label={tForm('phone')} type="tel" value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <Input className="sm:col-span-2" label={tForm('email')} type="email" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <Textarea className="sm:col-span-2" label={tForm('notes')} rows={2} value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            {tForm('toggle_address_book')}
          </Button>
          <Button onClick={save} loading={saving}>
            {tForm('save_to_address_book')}
          </Button>
        </div>
      </div>
    </div>
  );
}

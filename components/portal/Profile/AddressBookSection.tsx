'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AddressFormModal, type AddressDraft } from './AddressFormModal';
import type { AddressBookEntry } from '@/types/addressBook';

export function AddressBookSection({ initial }: { initial: ReadonlyArray<AddressBookEntry> }) {
  const t = useTranslations('PortalProfile.section_address_book');
  const [entries, setEntries] = useState<AddressBookEntry[]>([...initial]);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AddressDraft | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.company, e.contact, e.city, e.country, e.zip].join(' ').toLowerCase().includes(q),
    );
  }, [entries, query]);

  function openNew() {
    setEditing(undefined);
    setModalOpen(true);
  }

  function openEdit(entry: AddressBookEntry) {
    setEditing(entry);
    setModalOpen(true);
  }

  function onSaved(entry: AddressBookEntry) {
    setEntries((prev) => {
      const existing = prev.findIndex((e) => e.id === entry.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = entry;
        return next;
      }
      return [entry, ...prev];
    });
    setModalOpen(false);
  }

  async function confirmDelete(id: string) {
    try {
      const res = await fetch(`/api/portal/address-book/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
      }
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-brand">{t('title')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <Button onClick={openNew} leftIcon={<Plus className="h-4 w-4" />}>
          {t('new_address')}
        </Button>
      </header>

      <div className="mt-6">
        <Input
          leftSlot={<Search className="h-4 w-4" aria-hidden="true" />}
          placeholder={t('search_placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('search_placeholder')}
        />
      </div>

      {entries.length === 0 ? (
        <p className="mt-6 rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-600 ring-1 ring-slate-200">
          {t('no_entries')}
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-600 ring-1 ring-slate-200">
          {t('no_results')}
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {filtered.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"
            >
              <div className="min-w-0">
                <p className="font-medium text-brand">{e.company}</p>
                <p className="truncate text-xs text-slate-600">{e.contact}</p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {e.street} · {e.zip} {e.city}, {e.country}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(e)}
                  aria-label={t('edit')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(e.id)}
                  aria-label={t('delete')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-white"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddressFormModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={onSaved}
      />

      {deleteId && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand/60" onClick={() => setDeleteId(null)} aria-hidden="true" />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-brand">{t('delete_confirm_title')}</h3>
            <p className="mt-2 text-sm text-slate-600">{t('delete_confirm_text')}</p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteId(null)}>
                {t('edit')}
              </Button>
              <Button
                onClick={() => confirmDelete(deleteId)}
                className="bg-red-600 hover:bg-red-700"
              >
                {t('delete_confirm_button')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

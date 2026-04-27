'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import type { AddressBookEntry } from '@/types/addressBook';

interface AddressBookPickerProps {
  entries: ReadonlyArray<AddressBookEntry>;
  selectedId?: string;
  onSelect: (entry: AddressBookEntry) => void;
}

export function AddressBookPicker({ entries, selectedId, onSelect }: AddressBookPickerProps) {
  const t = useTranslations('PortalNewShipment.step1_recipient');
  const [query, setQuery] = useState('');

  const filtered = entries.filter((e) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [e.company, e.contact, e.city, e.country, e.zip]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  if (entries.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        {t('empty_address_book')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        leftSlot={<Search className="h-4 w-4" aria-hidden="true" />}
        placeholder={t('search_placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('search_placeholder')}
      />

      {filtered.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
          {t('no_results')}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((e) => {
            const isSelected = e.id === selectedId;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e)}
                  aria-pressed={isSelected}
                  className={cn(
                    'block w-full rounded-xl bg-white p-4 text-left transition ring-1',
                    isSelected
                      ? 'ring-2 ring-accent shadow-[0_0_0_4px_rgba(59,130,246,0.1)]'
                      : 'ring-slate-200 hover:ring-slate-300',
                  )}
                >
                  {isSelected && (
                    <span className="mb-1 inline-block text-[10px] font-semibold uppercase tracking-wider text-accent">
                      {t('selected_label')}
                    </span>
                  )}
                  <p className="font-medium text-brand">{e.company}</p>
                  <p className="text-sm text-slate-600">{e.contact}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {e.zip} {e.city}, {e.country}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

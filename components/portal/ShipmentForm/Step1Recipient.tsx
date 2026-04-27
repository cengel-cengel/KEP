'use client';

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import { AddressBookPicker } from './AddressBookPicker';
import type { AddressBookEntry } from '@/types/addressBook';
import type { NewShipmentInput } from '@/lib/validators';

const COUNTRY_KEYS = ['de', 'at', 'ch', 'fr', 'it', 'nl', 'be', 'lu', 'pl', 'gb'] as const;

export function Step1Recipient({ addressBook }: { addressBook: ReadonlyArray<AddressBookEntry> }) {
  const t = useTranslations('PortalNewShipment.step1_recipient');
  const tValidation = useTranslations('PortalNewShipment.validation');
  const { register, setValue, watch, formState: { errors } } = useFormContext<NewShipmentInput>();

  const [mode, setMode] = useState<'book' | 'new'>(
    watch('recipient.addressBookId') ? 'book' : 'new',
  );

  const selectedId = watch('recipient.addressBookId');
  const recipientErrors = errors.recipient;

  function selectFromBook(entry: AddressBookEntry) {
    setValue('recipient', {
      addressBookId: entry.id,
      company: entry.company,
      contact: entry.contact,
      street: entry.street,
      addressAddition: entry.addressAddition ?? '',
      zip: entry.zip,
      city: entry.city,
      country: entry.country,
      phone: entry.phone ?? '',
      email: entry.email ?? '',
      notes: entry.notes ?? '',
      saveToBook: false,
    }, { shouldDirty: true, shouldValidate: true });
  }

  const countryOptions = COUNTRY_KEYS.map((k) => ({
    value: k.toUpperCase(),
    label: t(`country_${k}`),
  }));

  return (
    <section>
      <h2 className="text-lg font-semibold text-brand">{t('title')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>

      <div role="tablist" className="mt-5 inline-flex rounded-md bg-slate-100 p-1">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'book'}
          onClick={() => setMode('book')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === 'book' ? 'bg-white text-brand shadow-sm' : 'text-slate-600'
          }`}
        >
          {t('toggle_address_book')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'new'}
          onClick={() => {
            setMode('new');
            setValue('recipient.addressBookId', undefined);
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === 'new' ? 'bg-white text-brand shadow-sm' : 'text-slate-600'
          }`}
        >
          {t('toggle_new_address')}
        </button>
      </div>

      <div className="mt-6">
        {mode === 'book' ? (
          <AddressBookPicker
            entries={addressBook}
            selectedId={selectedId}
            onSelect={selectFromBook}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label={t('company')} required {...register('recipient.company')} error={recipientErrors?.company && tValidation('required')} />
            <Input label={t('contact')} required {...register('recipient.contact')} error={recipientErrors?.contact && tValidation('required')} />
            <Input className="sm:col-span-2" label={t('street')} required {...register('recipient.street')} error={recipientErrors?.street && tValidation('required')} />
            <Input className="sm:col-span-2" label={t('address_addition')} {...register('recipient.addressAddition')} />
            <Input label={t('zip')} required {...register('recipient.zip')} error={recipientErrors?.zip && tValidation('required')} />
            <Input label={t('city')} required {...register('recipient.city')} error={recipientErrors?.city && tValidation('required')} />
            <Select label={t('country')} required options={countryOptions} {...register('recipient.country')} error={recipientErrors?.country && tValidation('required')} />
            <Input label={t('phone')} type="tel" {...register('recipient.phone')} />
            <Input className="sm:col-span-2" label={t('email')} type="email" {...register('recipient.email')} error={recipientErrors?.email && tValidation('email_invalid')} />
            <Textarea className="sm:col-span-2" label={t('notes')} rows={2} {...register('recipient.notes')} />
            <div className="sm:col-span-2">
              <Checkbox
                label={t('save_to_address_book')}
                {...register('recipient.saveToBook')}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

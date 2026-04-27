'use client';

import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import type { NewShipmentInput } from '@/lib/validators';

export function Step4Options() {
  const t = useTranslations('PortalNewShipment.step4_options');
  const tValidation = useTranslations('PortalNewShipment.validation');
  const { register, control, formState: { errors } } = useFormContext<NewShipmentInput>();
  const adrEnabled = useWatch({ control, name: 'options.adr' });

  return (
    <section>
      <h2 className="text-lg font-semibold text-brand">{t('title')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>

      <div className="mt-6 space-y-5 rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t('options_title')}
        </h3>

        <Checkbox label={t('adr_label')} {...register('options.adr')} />

        {adrEnabled && (
          <div className="grid gap-4 rounded-lg bg-amber-50 p-4 sm:grid-cols-3 ring-1 ring-amber-200">
            <Input label={t('adr_un')} placeholder="0000" {...register('options.adrUnNumber')} />
            <Input label={t('adr_class')} placeholder="1–9" {...register('options.adrClass')} />
            <Select
              label={t('adr_packing')}
              options={[
                { value: '', label: '—' },
                { value: 'I', label: 'I' },
                { value: 'II', label: 'II' },
                { value: 'III', label: 'III' },
              ]}
              {...register('options.adrPackingGroup')}
            />
            <p className="text-xs text-amber-900 sm:col-span-3">{t('adr_hint')}</p>
          </div>
        )}

        <Checkbox label={t('express')} {...register('options.express')} />
        <Checkbox label={t('notify')} {...register('options.notify')} />
        <Checkbox label={t('timeslot_mandatory')} {...register('options.fixedTimeWindow')} />
        <Checkbox label={t('liftgate')} {...register('options.liftgate')} />
        <Checkbox label={t('no_truck_inside')} {...register('options.noTruckInside')} />
      </div>

      <fieldset className="mt-6 rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <legend className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t('freight_terms_label')}
        </legend>
        <div className="mt-4 space-y-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="radio" value="prepaid" {...register('freightTerms')} className="h-4 w-4 text-accent" />
            {t('freight_terms_prepaid')}
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="radio" value="collect" {...register('freightTerms')} className="h-4 w-4 text-accent" />
            {t('freight_terms_collect')}
          </label>
        </div>
      </fieldset>

      <div className="mt-6 grid gap-5 rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <Input
          label={t('reference_label')}
          placeholder={t('reference_placeholder')}
          {...register('reference')}
        />
        <Textarea
          label={t('notes_label')}
          rows={3}
          placeholder={t('notes_placeholder')}
          {...register('notes')}
        />
      </div>

      <div className="mt-6 space-y-3">
        <Checkbox
          required
          {...register('acceptTerms')}
          label={
            <>
              {t.rich('accept_terms', {
                link: (chunks) => (
                  <Link href="/agb" className="font-medium text-accent underline">
                    {chunks}
                  </Link>
                ),
              })}
            </>
          }
          error={errors.acceptTerms ? tValidation('accept_terms_required') : undefined}
        />
        <Checkbox
          required
          {...register('confirmCorrect')}
          label={t('confirm_correct')}
          error={errors.confirmCorrect ? tValidation('confirm_correct_required') : undefined}
        />
      </div>
    </section>
  );
}

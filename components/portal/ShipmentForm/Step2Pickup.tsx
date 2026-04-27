'use client';

import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import type { NewShipmentInput } from '@/lib/validators';

function getMinPickupDate(): string {
  // morgen, falls Wochenende: nächster Montag
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getMaxPickupDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export function Step2Pickup() {
  const t = useTranslations('PortalNewShipment.step2_pickup');
  const tValidation = useTranslations('PortalNewShipment.validation');
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<NewShipmentInput>();

  const pickupDate = watch('pickup.date');
  const dateObj = pickupDate ? new Date(pickupDate) : null;
  const isWeekend = dateObj ? [0, 6].includes(dateObj.getDay()) : false;

  const minDate = getMinPickupDate();
  const maxDate = getMaxPickupDate();

  return (
    <section>
      <h2 className="text-lg font-semibold text-brand">{t('title')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Input
          label={t('pickup_date')}
          type="date"
          required
          min={minDate}
          max={maxDate}
          {...register('pickup.date')}
          error={errors.pickup?.date && tValidation('required')}
          hint={isWeekend ? t('no_weekend_warning') : undefined}
        />
        <Select
          label={t('time_window_label')}
          required
          options={[
            { value: 'morning', label: t('time_morning') },
            { value: 'afternoon', label: t('time_afternoon') },
            { value: 'allday', label: t('time_allday') },
          ]}
          {...register('pickup.timeWindow')}
        />
      </div>

      <div className="mt-6">
        <Checkbox
          label={t('different_pickup_address')}
          {...register('pickup.differentPickupAddress')}
        />
      </div>

      <div className="mt-8 rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200">
        <h3 className="text-sm font-semibold text-brand">
          {t('delivery_request_optional')}
        </h3>
        <p className="mt-1 flex items-start gap-2 text-xs text-slate-600">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          {t('delivery_disclaimer')}
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Input
            label={t('delivery_date')}
            type="date"
            min={pickupDate || minDate}
            {...register('pickup.deliveryDate')}
          />
          <Select
            label={t('delivery_time_window')}
            options={[
              { value: '', label: t('delivery_time_none') },
              { value: 'morning', label: t('time_morning') },
              { value: 'afternoon', label: t('time_afternoon') },
              { value: 'allday', label: t('time_allday') },
            ]}
            {...register('pickup.deliveryTimeWindow')}
          />
        </div>
      </div>
    </section>
  );
}

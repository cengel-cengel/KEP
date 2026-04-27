'use client';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { formatNumber, formatWeight } from '@/lib/format';
import { PACKAGE_TYPES, type NewShipmentInput, type PackageType } from '@/lib/validators';

export function Step3Packages() {
  const t = useTranslations('PortalNewShipment.step3_packages');
  const tValidation = useTranslations('PortalNewShipment.validation');
  const { control, register, formState: { errors } } = useFormContext<NewShipmentInput>();
  const { fields, append, remove } = useFieldArray({ control, name: 'packages' });
  const watched = useWatch({ control, name: 'packages' }) ?? [];

  const totalCount = watched.reduce((a, p) => a + (Number(p?.count) || 0), 0);
  const totalWeight = watched.reduce(
    (a, p) => a + (Number(p?.count) || 0) * (Number(p?.weightKgPerUnit) || 0),
    0,
  );
  const totalCbm = watched.reduce((a, p) => {
    const c = Number(p?.count) || 0;
    const l = Number(p?.lengthCm) || 0;
    const w = Number(p?.widthCm) || 0;
    const h = Number(p?.heightCm) || 0;
    return a + (c * l * w * h) / 1_000_000;
  }, 0);
  const totalLdm = watched.reduce((a, p) => {
    const c = Number(p?.count) || 0;
    const l = Number(p?.lengthCm) || 0;
    const w = Number(p?.widthCm) || 0;
    return a + (c * l * w) / 24000;
  }, 0);

  const typeOptions = PACKAGE_TYPES.map((tp) => ({
    value: tp,
    label: t(`types.${tp}` as `types.${PackageType}`),
  }));

  return (
    <section>
      <h2 className="text-lg font-semibold text-brand">{t('title')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>

      {errors.packages?.root?.message && (
        <p className="mt-3 text-sm text-red-600">
          {tValidation('min_one_package')}
        </p>
      )}

      <ul className="mt-5 space-y-4">
        {fields.map((field, idx) => (
          <li
            key={field.id}
            className="rounded-xl bg-white p-4 ring-1 ring-slate-200"
          >
            <div className="grid gap-3 sm:grid-cols-7">
              <Input
                label={t('col_count')}
                type="number"
                min={1}
                inputMode="numeric"
                className="sm:col-span-1"
                {...register(`packages.${idx}.count`, { valueAsNumber: true })}
              />
              <Select
                label={t('col_type')}
                options={typeOptions}
                className="sm:col-span-2"
                {...register(`packages.${idx}.type`)}
              />
              <Input
                label={t('col_length')}
                type="number"
                min={1}
                inputMode="numeric"
                {...register(`packages.${idx}.lengthCm`, { valueAsNumber: true })}
              />
              <Input
                label={t('col_width')}
                type="number"
                min={1}
                inputMode="numeric"
                {...register(`packages.${idx}.widthCm`, { valueAsNumber: true })}
              />
              <Input
                label={t('col_height')}
                type="number"
                min={1}
                inputMode="numeric"
                {...register(`packages.${idx}.heightCm`, { valueAsNumber: true })}
              />
              <Input
                label={t('col_weight')}
                type="number"
                min={0.1}
                step={0.1}
                inputMode="decimal"
                {...register(`packages.${idx}.weightKgPerUnit`, { valueAsNumber: true })}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <Checkbox
                label={t('col_stackable')}
                {...register(`packages.${idx}.stackable`)}
              />
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  aria-label={t('remove_row')}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('remove_row')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() =>
            append({
              count: 1,
              type: 'euro_pallet',
              lengthCm: 120,
              widthCm: 80,
              heightCm: 100,
              weightKgPerUnit: 100,
              stackable: true,
            })
          }
        >
          {t('add_row')}
        </Button>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SumBox label={t('calc_count')} value={formatNumber(totalCount)} />
        <SumBox label={t('calc_weight')} value={formatWeight(totalWeight)} />
        <SumBox label={t('calc_cbm')} value={`${formatNumber(Number(totalCbm.toFixed(2)))} m³`} />
        <SumBox label={t('calc_ldm')} value={`${formatNumber(Number(totalLdm.toFixed(2)))} ldm`} />
      </dl>
    </section>
  );
}

function SumBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-brand">{value}</dd>
    </div>
  );
}

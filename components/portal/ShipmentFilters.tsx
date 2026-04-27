'use client';

import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SHIPMENT_STATUS_KEYS } from '@/types/shipment';

export type ShipmentFilterPeriod = 'all' | '7d' | '30d' | '90d' | 'year';

export interface ShipmentFilterState {
  status: 'all' | (typeof SHIPMENT_STATUS_KEYS)[number];
  period: ShipmentFilterPeriod;
  query: string;
}

export const DEFAULT_FILTERS: ShipmentFilterState = {
  status: 'all',
  period: 'all',
  query: '',
};

interface ShipmentFiltersProps {
  state: ShipmentFilterState;
  onChange: (state: ShipmentFilterState) => void;
  onReset: () => void;
}

export function ShipmentFilters({ state, onChange, onReset }: ShipmentFiltersProps) {
  const t = useTranslations('PortalShipments');
  const tStatus = useTranslations('PortalCommon.status');

  const isFiltered =
    state.status !== 'all' || state.period !== 'all' || state.query.length > 0;

  const statusOptions = [
    { value: 'all', label: t('filter_status_all') },
    ...SHIPMENT_STATUS_KEYS.map((s) => ({ value: s, label: tStatus(s) })),
  ];

  const periodOptions: Array<{ value: ShipmentFilterPeriod; label: string }> = [
    { value: 'all', label: t('filter_period_all') },
    { value: '7d', label: t('filter_period_7d') },
    { value: '30d', label: t('filter_period_30d') },
    { value: '90d', label: t('filter_period_90d') },
    { value: 'year', label: t('filter_period_year') },
  ];

  return (
    <div className="grid gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_auto]">
      <Input
        leftSlot={<Search className="h-4 w-4" aria-hidden="true" />}
        placeholder={t('search_placeholder')}
        value={state.query}
        onChange={(e) => onChange({ ...state, query: e.target.value })}
        aria-label={t('search_placeholder')}
      />
      <Select
        aria-label={t('filter_status')}
        options={statusOptions}
        value={state.status}
        onChange={(e) =>
          onChange({ ...state, status: e.target.value as ShipmentFilterState['status'] })
        }
      />
      <Select
        aria-label={t('filter_period')}
        options={periodOptions}
        value={state.period}
        onChange={(e) =>
          onChange({ ...state, period: e.target.value as ShipmentFilterPeriod })
        }
      />
      <Button
        variant="ghost"
        size="md"
        onClick={onReset}
        disabled={!isFiltered}
        leftIcon={<X className="h-4 w-4" />}
      >
        {t('reset_filters')}
      </Button>
    </div>
  );
}

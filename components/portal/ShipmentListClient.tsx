'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { ShipmentTable } from './ShipmentTable';
import {
  DEFAULT_FILTERS,
  ShipmentFilters,
  type ShipmentFilterState,
} from './ShipmentFilters';
import type { Shipment } from '@/types/shipment';

const PAGE_SIZE = 20;

function periodCutoff(period: ShipmentFilterState['period']): Date | null {
  const now = new Date();
  switch (period) {
    case '7d':
      return new Date(now.getTime() - 7 * 86400000);
    case '30d':
      return new Date(now.getTime() - 30 * 86400000);
    case '90d':
      return new Date(now.getTime() - 90 * 86400000);
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return null;
  }
}

export function ShipmentListClient({ shipments }: { shipments: ReadonlyArray<Shipment> }) {
  const t = useTranslations('PortalShipments');
  const [filters, setFilters] = useState<ShipmentFilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const cutoff = periodCutoff(filters.period);
    const q = filters.query.trim().toLowerCase();
    return shipments.filter((s) => {
      if (filters.status !== 'all' && s.status !== filters.status) return false;
      if (cutoff && new Date(s.createdAt) < cutoff) return false;
      if (q) {
        const haystack = [
          s.trackingNumber,
          s.recipient.company,
          s.recipient.contact ?? '',
          s.recipient.zip,
          s.recipient.city,
          s.sender.city,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [shipments, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function reset() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  return (
    <>
      <ShipmentFilters
        state={filters}
        onChange={(s) => {
          setFilters(s);
          setPage(1);
        }}
        onReset={reset}
      />

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{t('showing', { count: filtered.length })}</span>
      </div>

      <div className="mt-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl bg-white p-10 text-center ring-1 ring-slate-200">
            <p className="text-sm text-slate-600">{t('no_results')}</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" onClick={reset}>
                {t('reset_filters')}
              </Button>
              <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                <Link href="/portal/sendungen/neu">{t('new_shipment_button')}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ShipmentTable shipments={pageItems} />
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('prev')}
          </Button>
          <span className="text-xs text-slate-500">
            {t('page_label', { page: safePage, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t('next')}
          </Button>
        </div>
      )}
    </>
  );
}

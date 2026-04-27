'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Eye, FileText, Search } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { DocumentTypeIcon } from './DocumentTypeIcon';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { DOCUMENT_TYPES, type DocumentType, type PortalDocument } from '@/types/document';

type Period = 'all' | '30d' | '90d' | 'year';
type Sort = 'newest' | 'oldest' | 'shipment';

function periodCutoff(period: Period): Date | null {
  const now = new Date();
  switch (period) {
    case '30d': return new Date(now.getTime() - 30 * 86400000);
    case '90d': return new Date(now.getTime() - 90 * 86400000);
    case 'year': return new Date(now.getTime() - 365 * 86400000);
    default: return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsClient({ documents }: { documents: ReadonlyArray<PortalDocument> }) {
  const t = useTranslations('PortalDocuments');
  const tCols = useTranslations('PortalDocuments.table_columns');
  const tTypes = useTranslations('PortalDocuments.filter_types');

  const [activeType, setActiveType] = useState<'all' | DocumentType>('all');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [previewDoc, setPreviewDoc] = useState<PortalDocument | null>(null);

  const filtered = useMemo(() => {
    const cutoff = periodCutoff(period);
    const q = query.trim().toLowerCase();
    let list = documents.filter((d) => {
      if (activeType !== 'all' && d.type !== activeType) return false;
      if (cutoff && new Date(d.createdAt) < cutoff) return false;
      if (q) {
        const haystack = `${d.filename} ${d.shipmentTrackingNumber}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return a.shipmentTrackingNumber.localeCompare(b.shipmentTrackingNumber);
    });
    return list;
  }, [documents, activeType, query, period, sort]);

  const typeChips: ReadonlyArray<'all' | DocumentType> = ['all', ...DOCUMENT_TYPES];

  return (
    <>
      <div className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <div role="tablist" aria-label={t('filter_types.all')} className="flex flex-wrap gap-2">
          {typeChips.map((type) => {
            const isActive = activeType === type;
            return (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveType(type)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition ring-1',
                  isActive
                    ? 'bg-brand text-white ring-brand'
                    : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300',
                )}
              >
                {tTypes(type)}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px]">
          <Input
            leftSlot={<Search className="h-4 w-4" aria-hidden="true" />}
            placeholder={t('filter_search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('filter_search_placeholder')}
          />
          <Select
            aria-label={t('filter_period')}
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            options={[
              { value: 'all', label: t('filter_period_all') },
              { value: '30d', label: t('filter_period_30d') },
              { value: '90d', label: t('filter_period_90d') },
              { value: 'year', label: t('filter_period_year') },
            ]}
          />
          <Select
            aria-label={t('filter_sort')}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            options={[
              { value: 'newest', label: t('sort_newest') },
              { value: 'oldest', label: t('sort_oldest') },
              { value: 'shipment', label: t('sort_shipment') },
            ]}
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {t('showing_count', { count: filtered.length })}
      </p>

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Mobile: Cards */}
          <ul className="mt-3 grid gap-3 sm:hidden">
            {filtered.map((d) => (
              <li key={d.id} className="flex items-start gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <DocumentTypeIcon type={d.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-brand">{d.filename}</p>
                  <p className="truncate font-mono text-xs text-slate-500">{d.shipmentTrackingNumber}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(d.createdAt)} · {formatBytes(d.sizeBytes)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPreviewDoc(d)} leftIcon={<Eye className="h-4 w-4" />}>
                      {t('preview')}
                    </Button>
                    <Button asChild size="sm" leftIcon={<Download className="h-4 w-4" />}>
                      <a href={`/api/portal/documents/${d.id}/download`} download={d.filename}>
                        {t('download')}
                      </a>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: Tabelle */}
          <div className="mt-3 hidden overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 sm:block">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <Th>{tCols('type')}</Th>
                  <Th>{tCols('shipment')}</Th>
                  <Th>{tCols('document')}</Th>
                  <Th>{tCols('date')}</Th>
                  <Th>{tCols('size')}</Th>
                  <Th className="text-right pr-4">
                    <span className="sr-only">{tCols('actions')}</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <Td><DocumentTypeIcon type={d.type} /></Td>
                    <Td>
                      <Link
                        href={{ pathname: '/portal/sendungen/[id]', params: { id: d.shipmentId } }}
                        className="font-mono text-xs text-accent hover:underline"
                      >
                        {d.shipmentTrackingNumber}
                      </Link>
                    </Td>
                    <Td className="font-medium text-brand">{d.filename}</Td>
                    <Td>{formatDate(d.createdAt)}</Td>
                    <Td>{formatBytes(d.sizeBytes)}</Td>
                    <Td className="text-right pr-4">
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setPreviewDoc(d)} aria-label={t('preview')}>
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button asChild size="sm" variant="ghost" aria-label={t('download')}>
                          <a href={`/api/portal/documents/${d.id}/download`} download={d.filename}>
                            <Download className="h-4 w-4" aria-hidden="true" />
                          </a>
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </>
  );
}

function EmptyState() {
  const t = useTranslations('PortalDocuments');
  return (
    <div className="mt-3 rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200">
      <FileText className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
      <p className="mt-3 font-medium text-brand">{t('empty_state_title')}</p>
      <p className="mt-1 text-sm text-slate-600">{t('empty_state_text')}</p>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 ${className ?? ''}`}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`whitespace-nowrap px-4 py-3 text-sm text-slate-700 ${className ?? ''}`}>
      {children}
    </td>
  );
}

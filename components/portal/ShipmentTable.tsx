import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { ShipmentStatusBadge } from './ShipmentStatusBadge';
import { formatDate } from '@/lib/format';
import type { Shipment } from '@/types/shipment';

interface ShipmentTableProps {
  shipments: ReadonlyArray<Shipment>;
}

export function ShipmentTable({ shipments }: ShipmentTableProps) {
  const t = useTranslations('PortalShipments');
  const tCols = useTranslations('PortalShipments.table');

  return (
    <>
      {/* Mobile: Cards */}
      <ul className="grid gap-3 sm:hidden">
        {shipments.map((s) => (
          <li key={s.id}>
            <Link
              href={{ pathname: '/portal/sendungen/[id]', params: { id: s.id } }}
              className="block rounded-xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-slate-500">{s.trackingNumber}</p>
                  <p className="mt-1 font-medium text-brand">{s.recipient.company}</p>
                  <p className="text-sm text-slate-600">
                    {s.sender.city} → {s.recipient.city}, {s.recipient.country}
                  </p>
                </div>
                <ShipmentStatusBadge status={s.status} />
              </div>
              <p className="mt-3 text-xs text-slate-500">{formatDate(s.createdAt)}</p>
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop: Tabelle */}
      <div className="hidden overflow-hidden rounded-xl ring-1 ring-slate-200 sm:block">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <Th>{tCols('tracking')}</Th>
              <Th>{tCols('date')}</Th>
              <Th>{tCols('route')}</Th>
              <Th>{tCols('recipient')}</Th>
              <Th>{tCols('status')}</Th>
              <Th className="text-right pr-6">
                <span className="sr-only">{tCols('action')}</span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {shipments.map((s) => (
              <tr key={s.id} className="transition hover:bg-slate-50">
                <Td>
                  <span className="font-mono text-xs text-brand">{s.trackingNumber}</span>
                </Td>
                <Td>{formatDate(s.createdAt)}</Td>
                <Td>
                  <span className="text-slate-700">
                    {s.sender.city} → {s.recipient.city}
                  </span>
                </Td>
                <Td>
                  <span className="text-slate-700">{s.recipient.company}</span>
                </Td>
                <Td>
                  <ShipmentStatusBadge status={s.status} />
                </Td>
                <Td className="text-right pr-6">
                  <Link
                    href={{ pathname: '/portal/sendungen/[id]', params: { id: s.id } }}
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                  >
                    {t('view_detail')}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`whitespace-nowrap px-6 py-4 text-sm ${className ?? ''}`}>{children}</td>
  );
}

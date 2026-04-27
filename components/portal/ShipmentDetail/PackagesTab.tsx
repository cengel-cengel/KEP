import { useTranslations } from 'next-intl';
import { AlertTriangle, Check } from 'lucide-react';
import { formatNumber, formatWeight } from '@/lib/format';
import type { Shipment } from '@/types/shipment';

export function PackagesTab({ shipment }: { shipment: Shipment }) {
  const t = useTranslations('PortalShipmentDetail');
  const tCols = useTranslations('PortalShipmentDetail.packages_columns');
  const tSum = useTranslations('PortalShipmentDetail.packages_summary');

  return (
    <div className="space-y-4">
      {shipment.options.adr && (
        <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {t('adr_warning', { un: '—', class: '—' })}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        {/* Mobile: Cards */}
        <ul className="divide-y divide-slate-100 sm:hidden">
          {shipment.packages.map((p, i) => (
            <li key={i} className="p-4">
              <p className="font-medium text-brand">
                {p.count}× {p.type}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {p.lengthCm} × {p.widthCm} × {p.heightCm} cm · {formatNumber(p.weightKg)} kg
              </p>
              {p.stackable && (
                <span className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  {tCols('stackable')}
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* Desktop: Tabelle */}
        <table className="hidden min-w-full divide-y divide-slate-200 sm:table">
          <thead className="bg-slate-50">
            <tr>
              <Th>{tCols('num')}</Th>
              <Th>{tCols('count')}</Th>
              <Th>{tCols('type')}</Th>
              <Th>{tCols('dimensions')}</Th>
              <Th>{tCols('weight')}</Th>
              <Th>{tCols('stackable')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {shipment.packages.map((p, i) => (
              <tr key={i}>
                <Td className="text-slate-500">{i + 1}</Td>
                <Td className="font-medium text-brand">{p.count}</Td>
                <Td>{p.type}</Td>
                <Td>
                  {p.lengthCm} × {p.widthCm} × {p.heightCm}
                </Td>
                <Td>{formatNumber(p.weightKg)}</Td>
                <Td>
                  {p.stackable ? (
                    <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label={tSum('total_count')} value={formatNumber(shipment.packages.reduce((a, p) => a + p.count, 0))} />
        <Summary label={tSum('total_weight')} value={formatWeight(shipment.totalWeightKg)} />
        <Summary label={tSum('total_cbm')} value={`${formatNumber(shipment.totalCbm)} m³`} />
        <Summary label={tSum('total_ldm')} value={shipment.totalLdm ? `${formatNumber(shipment.totalLdm)} ldm` : '—'} />
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-brand">{value}</p>
    </div>
  );
}

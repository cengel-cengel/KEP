import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';

export function DocumentsTab() {
  const t = useTranslations('PortalShipmentDetail');

  return (
    <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200">
      <FileText className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
      <p className="mt-3 text-sm text-slate-600">{t('documents_empty')}</p>
    </div>
  );
}

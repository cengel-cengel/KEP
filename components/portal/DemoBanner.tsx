import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';

export function DemoBanner() {
  const t = useTranslations('PortalCommon');
  if (process.env.NEXT_PUBLIC_USE_MOCKS !== 'true') return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2.5 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200"
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t('demo_banner')}</span>
    </div>
  );
}

import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DocumentsClient } from '@/components/portal/Documents/DocumentsClient';
import { getMockDocuments } from '@/mocks/documents';

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const documents = getMockDocuments();
  const t = await getTranslations({ locale, namespace: 'PortalDocuments' });

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-brand">{t('page_title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <Button variant="outline" leftIcon={<Download className="h-4 w-4" />} disabled>
          {t('all_zip_button')}
        </Button>
      </div>

      <DocumentsClient documents={documents} />
    </div>
  );
}

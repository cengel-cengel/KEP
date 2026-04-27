'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { PortalDocument } from '@/types/document';

interface PreviewModalProps {
  doc: PortalDocument | null;
  onClose: () => void;
}

export function DocumentPreviewModal({ doc, onClose }: PreviewModalProps) {
  const t = useTranslations('PortalDocuments');

  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [doc, onClose]);

  if (!doc) return null;

  const downloadUrl = `/api/portal/documents/${doc.id}/download`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-brand/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 id="preview-title" className="text-sm font-semibold text-brand">
              {t('preview_modal_title')}
            </h2>
            <p className="text-xs text-slate-500">{doc.filename}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('preview_close')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 bg-slate-100">
          <iframe
            title={doc.filename}
            src={downloadUrl}
            className="h-full w-full"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-3">
          <Button asChild variant="outline" size="sm">
            <a href={downloadUrl} download={doc.filename}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('download')}
            </a>
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('preview_close')}
          </Button>
        </div>
      </div>
    </div>
  );
}

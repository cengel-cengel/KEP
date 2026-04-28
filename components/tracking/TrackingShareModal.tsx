'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Mail, QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

interface ShareModalProps {
  open: boolean;
  url: string;
  onClose: () => void;
}

type Tab = 'url' | 'email' | 'qr';

export function TrackingShareModal({ open, url, onClose }: ShareModalProps) {
  const t = useTranslations('TrackingShare');
  const [tab, setTab] = useState<Tab>('url');
  const [copied, setCopied] = useState(false);
  const [emailTo, setEmailTo] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* ignore */
    }
  }

  function openEmail() {
    const subject = encodeURIComponent(t('email_subject_default'));
    const body = encodeURIComponent(t('email_body_default', { url }));
    window.location.href = `mailto:${emailTo}?subject=${subject}&body=${body}`;
  }

  function downloadQr() {
    const svg = document.getElementById('tracking-qr-svg');
    if (!(svg instanceof SVGElement)) return;
    const svgString = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tracking-qr.svg';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="share-modal-title" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="share-modal-title" className="text-base font-semibold text-brand">
            {t('modal_title')}
          </h2>
          <button
            type="button"
            aria-label={t('close')}
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div role="tablist" className="flex gap-1 border-b border-slate-100 px-3">
          <TabButton active={tab === 'url'} onClick={() => setTab('url')} icon={<Copy className="h-3.5 w-3.5" />} label={t('tab_url')} />
          <TabButton active={tab === 'email'} onClick={() => setTab('email')} icon={<Mail className="h-3.5 w-3.5" />} label={t('tab_email')} />
          <TabButton active={tab === 'qr'} onClick={() => setTab('qr')} icon={<QrCode className="h-3.5 w-3.5" />} label={t('tab_qr')} />
        </div>

        <div className="p-5">
          {tab === 'url' && (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('url_label')}
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={url}
                  className="block h-11 flex-1 rounded-md ring-1 ring-inset ring-slate-300 bg-slate-50 px-3 text-sm text-slate-700"
                />
                <Button
                  onClick={copy}
                  leftIcon={copied ? <Check className="h-4 w-4 text-emerald-200" /> : <Copy className="h-4 w-4" />}
                >
                  {copied ? t('url_copied') : t('url_copy')}
                </Button>
              </div>
            </div>
          )}

          {tab === 'email' && (
            <div className="space-y-4">
              <Input
                label={t('email_to_label')}
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
              <Input label={t('email_subject_label')} value={t('email_subject_default')} readOnly />
              <Button onClick={openEmail} disabled={!emailTo} leftIcon={<Mail className="h-4 w-4" />}>
                {t('email_send')}
              </Button>
            </div>
          )}

          {tab === 'qr' && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <QRCodeSVG
                  id="tracking-qr-svg"
                  value={url}
                  size={200}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0f2744"
                />
              </div>
              <p className="text-center text-xs text-slate-500">{t('qr_help')}</p>
              <Button variant="outline" size="sm" onClick={downloadQr}>
                {t('qr_download')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition',
        active ? 'text-brand border-b-2 border-gold' : 'text-slate-500 hover:text-brand',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

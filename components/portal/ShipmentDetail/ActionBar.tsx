'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Printer, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ActionBar({ trackingNumber }: { trackingNumber: string }) {
  const t = useTranslations('PortalShipmentDetail');
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : '';
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard nicht verfügbar - silent
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.print()}
        leftIcon={<Printer className="h-4 w-4" />}
        aria-label={t('print_button')}
      >
        <span className="hidden sm:inline">{t('print_button')}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={copyLink}
        leftIcon={copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
      >
        <span className="hidden sm:inline">
          {copied ? t('copied_to_clipboard') : t('share_button')}
        </span>
      </Button>
      {/* Hint dass tracking-number kopiert ist - nur Screenreader */}
      <span className="sr-only">{trackingNumber}</span>
    </div>
  );
}

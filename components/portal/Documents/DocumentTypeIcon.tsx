import { Bell, FileText, Receipt, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentType } from '@/types/document';

const ICONS = {
  cmr: { Icon: FileText, tone: 'bg-brand-50 text-brand' },
  delivery_note: { Icon: Truck, tone: 'bg-emerald-50 text-emerald-700' },
  invoice: { Icon: Receipt, tone: 'bg-gold-50 text-gold-700' },
  notice: { Icon: Bell, tone: 'bg-amber-50 text-amber-800' },
} as const;

export function DocumentTypeIcon({ type }: { type: DocumentType }) {
  const { Icon, tone } = ICONS[type];
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-md',
        tone,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/**
 * S-3 CollapsibleSection — Progressive Disclosure.
 *
 * Wrapper für Panel-Sections mit Click-to-Toggle und optionaler
 * localStorage-Persistenz pro storageKey.
 *
 * Konvention: storageKey = 'tms.panel.section.{name}'
 *
 * Beispiel:
 *   <CollapsibleSection title="Fracht" storageKey="shipment.fracht">
 *     <Row …/>
 *   </CollapsibleSection>
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  /** Default-Open-State wenn kein localStorage-Wert. */
  defaultOpen?: boolean;
  /** Wenn gesetzt: persistiert open-state in localStorage. */
  storageKey?: string;
  /** Override für Title (z.B. {N} Risiko). */
  badge?: ReactNode;
  /** Render auch wenn collapsed (e.g. info-prefix). */
  alwaysVisible?: ReactNode;
}

function loadOpen(storageKey: string | undefined, fallback: boolean): boolean {
  if (!storageKey) return fallback;
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(`tms.panel.section.${storageKey}`);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* silent */
  }
  return fallback;
}

function saveOpen(storageKey: string | undefined, open: boolean): void {
  if (!storageKey) return;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`tms.panel.section.${storageKey}`, open ? '1' : '0');
  } catch {
    /* silent */
  }
}

export default function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  storageKey,
  badge,
  alwaysVisible,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState<boolean>(() =>
    loadOpen(storageKey, defaultOpen),
  );

  useEffect(() => {
    saveOpen(storageKey, open);
  }, [storageKey, open]);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1 text-[11px] font-semibold uppercase text-gray-500 mb-1 hover:text-gray-700"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>{title}</span>
        {badge && <span className="ml-1 normal-case">{badge}</span>}
      </button>
      {alwaysVisible}
      {open && <div>{children}</div>}
    </section>
  );
}

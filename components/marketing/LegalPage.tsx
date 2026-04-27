'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LegalSection {
  id: string;
  title: string;
  paragraphs: ReadonlyArray<string>;
}

export interface LegalCallout {
  title: string;
  body: string;
  link?: { href: string; label: string };
}

interface LegalPageContentProps {
  tocLabel: string;
  lastUpdatedLabel: string;
  lastUpdatedDate: string;
  todoNotice: string;
  callout?: LegalCallout;
  sections: ReadonlyArray<LegalSection>;
}

/**
 * Render-Komponente für rechtliche Seiten (Impressum, Datenschutz, AGB).
 * - Container max-w-prose
 * - Sticky-TOC links auf lg+, Accordion-TOC oben auf < lg
 * - Optionaler Callout (z.B. ADSp-Hinweis bei AGB)
 * - "Letzte Aktualisierung" + globaler [PLATZHALTER]-Hinweis
 */
export function LegalPageContent({
  tocLabel,
  lastUpdatedLabel,
  lastUpdatedDate,
  todoNotice,
  callout,
  sections,
}: LegalPageContentProps) {
  const [tocOpen, setTocOpen] = useState(false);

  return (
    <div className="grid gap-10 lg:grid-cols-[240px,1fr] lg:gap-12">
      {/* TOC */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        {/* Mobile: collapsible */}
        <div className="lg:hidden">
          <button
            type="button"
            aria-expanded={tocOpen}
            onClick={() => setTocOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-brand"
          >
            {tocLabel}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', tocOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {tocOpen && <TocList sections={sections} onClick={() => setTocOpen(false)} />}
        </div>

        {/* Desktop: always visible */}
        <div className="hidden lg:block">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {tocLabel}
          </p>
          <TocList sections={sections} className="mt-3" />
        </div>
      </aside>

      <article className="max-w-prose">
        <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-100">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{todoNotice}</span>
        </div>

        {callout && <CalloutBox callout={callout} />}

        <div className="mt-10 space-y-12">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-2xl font-semibold text-brand">{section.title}</h2>
              <div className="mt-4 space-y-4">
                {section.paragraphs.map((para, idx) => (
                  <p
                    key={idx}
                    className="whitespace-pre-line leading-relaxed text-slate-700"
                  >
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-16 text-xs text-slate-500">
          {lastUpdatedLabel}: {lastUpdatedDate}
        </p>
      </article>
    </div>
  );
}

function TocList({
  sections,
  className,
  onClick,
}: {
  sections: ReadonlyArray<LegalSection>;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <nav aria-label="Inhaltsverzeichnis" className={className}>
      <ul className="space-y-1.5 lg:border-l lg:border-slate-200">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={onClick}
              className="block py-1 pl-4 text-sm text-slate-600 hover:text-brand transition lg:-ml-px lg:border-l lg:border-transparent lg:hover:border-gold lg:hover:text-brand"
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CalloutBox({ callout }: { callout: LegalCallout }) {
  return (
    <aside className="mt-8 rounded-xl bg-amber-50 p-6 ring-1 ring-amber-200">
      <p className="text-sm font-semibold uppercase tracking-wider text-amber-900">
        {callout.title}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-amber-900/90">
        {callout.body}
      </p>
      {callout.link && (
        <a
          href={callout.link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-medium text-amber-900 underline hover:no-underline"
        >
          {callout.link.label} →
        </a>
      )}
    </aside>
  );
}

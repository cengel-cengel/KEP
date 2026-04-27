'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FaqItem {
  q: string;
  a: string;
}

interface FaqAccordionProps {
  items: ReadonlyArray<FaqItem>;
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <ul className="divide-y divide-slate-200 border-y border-slate-200">
      {items.map((item, idx) => {
        const isOpen = openIdx === idx;
        const id = `faq-${idx}`;
        return (
          <li key={idx}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${id}-panel`}
                id={`${id}-trigger`}
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className={cn(
                  'flex w-full items-start justify-between gap-6 py-6 text-left',
                  'transition hover:text-brand',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md',
                )}
              >
                <span className="text-lg font-semibold text-brand">{item.q}</span>
                <ChevronDown
                  className={cn(
                    'mt-1 h-5 w-5 shrink-0 text-gold transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={`${id}-panel`}
              role="region"
              aria-labelledby={`${id}-trigger`}
              hidden={!isOpen}
              className="pb-6 -mt-2"
            >
              <p className="max-w-3xl text-base leading-relaxed text-slate-600">
                {item.a}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

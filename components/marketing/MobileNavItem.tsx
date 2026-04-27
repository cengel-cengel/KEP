'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link, usePathname } from '@/i18n/routing';
import type { NavPrimaryItem } from '@/lib/constants';

interface MobileNavItemProps {
  item: NavPrimaryItem;
  onNavigate?: () => void;
}

/**
 * Mobile-Navigationspunkt im Hamburger-Drawer.
 *
 * Locale-Stickiness: Alle Links nutzen Link aus @/i18n/routing
 * mit dem kanonischen pathname. Die aktuelle Locale wird vom
 * Routing-Context automatisch beibehalten.
 */
export function MobileNavItem({ item, onNavigate }: MobileNavItemProps) {
  const t = useTranslations('Navigation');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = pathname.startsWith(item.pathname);

  if (!item.submenu) {
    return (
      <li>
        <Link
          href={{ pathname: item.pathname }}
          aria-current={isActive ? 'page' : undefined}
          onClick={onNavigate}
          className={cn(
            'flex items-center justify-between rounded-md px-3 py-3 text-base font-medium',
            isActive
              ? 'bg-slate-100 text-brand'
              : 'text-slate-700 hover:bg-slate-50 hover:text-brand',
          )}
        >
          {t(item.labelKey)}
          {isActive && (
            <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
          )}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between rounded-md px-3 py-3 text-base font-medium transition',
          isActive ? 'text-brand' : 'text-slate-700 hover:bg-slate-50 hover:text-brand',
        )}
      >
        <span
          className={cn(
            'relative',
            isActive && 'after:absolute after:-bottom-0.5 after:left-0 after:right-0 after:h-px after:bg-gold',
          )}
        >
          {t(item.labelKey)}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform text-slate-500', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul className="mt-1 space-y-0.5 pl-4 border-l border-slate-200 ml-3">
          <li>
            <Link
              href={{ pathname: item.pathname }}
              onClick={onNavigate}
              className="block rounded-md px-3 py-2 text-sm font-medium text-brand hover:bg-slate-50"
            >
              {t(item.labelKey)} →
            </Link>
          </li>
          {item.submenu.map((sub) => (
            <li key={`${sub.pathname}#${sub.hash ?? ''}`}>
              <Link
                href={sub.hash ? { pathname: sub.pathname, hash: sub.hash } : { pathname: sub.pathname }}
                onClick={onNavigate}
                className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-brand"
              >
                {t(sub.labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

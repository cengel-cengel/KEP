'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link, usePathname } from '@/i18n/routing';
import type { NavPrimaryItem } from '@/lib/constants';

interface HeaderNavItemProps {
  item: NavPrimaryItem;
}

const CLOSE_DELAY_MS = 200;

/**
 * Desktop-Navigationspunkt. Wenn `submenu` vorhanden ist,
 * rendert ein Hover-Dropdown. Sonst ein einfacher Link.
 *
 * Locale-Stickiness: Alle Links nutzen die i18n-Link-Komponente
 * aus @/i18n/routing. Die Locale wird aus dem Routing-Context
 * gelesen - kein expliziter `locale`-Prop, kein hardcoded Pfad.
 *
 * - Hover öffnet, Mouse-Leave schließt mit 200 ms Delay
 * - ESC schließt, Klick außerhalb schließt
 * - role="menu" + role="menuitem"
 */
export function HeaderNavItem({ item }: HeaderNavItemProps) {
  const t = useTranslations('Navigation');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLLIElement>(null);
  const menuId = useId();

  const isActive = pathname.startsWith(item.pathname);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  if (!item.submenu) {
    return (
      <li>
        <Link
          href={{ pathname: item.pathname }}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'relative inline-flex h-10 items-center px-3 text-sm font-medium transition rounded-md',
            isActive ? 'text-brand' : 'text-slate-600 hover:text-brand',
          )}
        >
          {t(item.labelKey)}
          <span
            className={cn(
              'absolute bottom-1 left-3 right-3 h-px transition-all',
              isActive ? 'bg-gold opacity-100' : 'bg-gold opacity-0',
            )}
            aria-hidden="true"
          />
        </Link>
      </li>
    );
  }

  return (
    <li
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative inline-flex h-10 items-center gap-1 px-3 text-sm font-medium transition rounded-md',
          isActive ? 'text-brand' : 'text-slate-600 hover:text-brand',
        )}
      >
        {t(item.labelKey)}
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
        <span
          className={cn(
            'absolute bottom-1 left-3 right-3 h-px transition-all',
            isActive ? 'bg-gold opacity-100' : 'bg-gold opacity-0',
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id={menuId}
        role="menu"
        aria-label={t(item.labelKey)}
        className={cn(
          'absolute left-0 top-full z-50 mt-2 min-w-[240px]',
          'rounded-xl bg-white p-2 ring-1 ring-slate-200 shadow-xl',
          'origin-top transition duration-150',
          open
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-1 opacity-0',
        )}
      >
        <ul className="py-1">
          {item.submenu.map((sub) => (
            <li key={`${sub.pathname}#${sub.hash ?? ''}`} role="none">
              <Link
                role="menuitem"
                href={sub.hash ? { pathname: sub.pathname, hash: sub.hash } : { pathname: sub.pathname }}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-brand"
              >
                {t(sub.labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

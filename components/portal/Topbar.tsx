'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { LanguageSwitcher } from '@/components/marketing/LanguageSwitcher';

interface TopbarProps {
  user: {
    firstName: string;
    lastName: string;
    company: string;
    email: string;
  };
}

export function Topbar({ user }: TopbarProps) {
  const t = useTranslations('PortalCommon');
  const tNav = useTranslations('PortalNavigation');
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/portal/login';
  }

  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
      <LanguageSwitcher />
      <span aria-hidden="true" className="hidden h-5 w-px bg-slate-200 sm:inline-block" />

      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('user_menu')}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition hover:bg-slate-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-xs font-bold text-brand">
            {initials || <UserIcon className="h-4 w-4" />}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block font-medium text-brand leading-tight">
              {user.firstName} {user.lastName}
            </span>
            <span className="block text-xs text-slate-500 leading-tight">
              {user.company}
            </span>
          </span>
          <ChevronDown
            className={cn('h-4 w-4 text-slate-500 transition', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>

        {open && (
          <>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl bg-white p-1 ring-1 ring-slate-200 shadow-xl"
            >
              <div className="border-b border-slate-100 p-3 sm:hidden">
                <p className="text-sm font-medium text-brand">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
              <Link
                role="menuitem"
                href="/portal/profil"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <UserIcon className="h-4 w-4" aria-hidden="true" />
                {tNav('profile')}
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t('logout')}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

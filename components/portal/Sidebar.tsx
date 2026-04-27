'use client';

import { useTranslations } from 'next-intl';
import { FileText, LayoutDashboard, LogOut, Plus, Truck, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link, usePathname } from '@/i18n/routing';
import { LogoKED } from '@/components/shared/LogoKED';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  pathname: '/portal/dashboard' | '/portal/sendungen' | '/portal/sendungen/neu' | '/portal/dokumente' | '/portal/profil';
  labelKey: string;
  icon: LucideIcon;
}

const NAV: ReadonlyArray<NavItem> = [
  { pathname: '/portal/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { pathname: '/portal/sendungen', labelKey: 'shipments', icon: Truck },
  { pathname: '/portal/sendungen/neu', labelKey: 'new_shipment', icon: Plus },
  { pathname: '/portal/dokumente', labelKey: 'documents', icon: FileText },
  { pathname: '/portal/profil', labelKey: 'profile', icon: User },
];

export function Sidebar() {
  const t = useTranslations('PortalNavigation');
  const tCommon = useTranslations('PortalCommon');
  const pathname = usePathname();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/portal/login';
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-16 items-center border-b border-slate-100 px-6">
        <Link href="/portal/dashboard" aria-label="KED Portal">
          <LogoKED />
        </Link>
      </div>

      <nav aria-label="Portal-Navigation" className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const isExact = pathname === item.pathname;
            const isActive =
              isExact ||
              (item.pathname !== '/portal/sendungen/neu' &&
                pathname.startsWith(item.pathname) &&
                !(item.pathname === '/portal/sendungen' && pathname === '/portal/sendungen/neu'));
            const Icon = item.icon;
            return (
              <li key={item.pathname}>
                <Link
                  href={item.pathname}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-brand-50 text-brand'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-brand',
                  )}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gold"
                    />
                  )}
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-100 p-3">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-brand"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {tCommon('logout')}
        </button>
      </div>
    </aside>
  );
}

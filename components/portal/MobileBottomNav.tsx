'use client';

import { useTranslations } from 'next-intl';
import { FileText, LayoutDashboard, Plus, Truck, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link, usePathname } from '@/i18n/routing';
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

export function MobileBottomNav() {
  const t = useTranslations('PortalNavigation');
  const pathname = usePathname();

  return (
    <nav
      aria-label="Portal-Navigation mobil"
      className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV.map((item) => {
        const isActive =
          pathname === item.pathname ||
          (item.pathname === '/portal/sendungen' &&
            pathname.startsWith('/portal/sendungen') &&
            pathname !== '/portal/sendungen/neu');
        const Icon = item.icon;
        return (
          <Link
            key={item.pathname}
            href={item.pathname}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition',
              isActive ? 'text-brand' : 'text-slate-500 hover:text-brand',
            )}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute top-0 left-3 right-3 h-0.5 rounded-b-full bg-gold"
              />
            )}
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="leading-tight">{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

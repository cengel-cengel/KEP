import { useTranslations } from 'next-intl';
import { Calculator, Mail, Package, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Container } from '@/components/ui/Container';
import type { PrimaryHref } from '@/lib/constants';

interface SubItem {
  pathname: PrimaryHref | '/';
  hash?: string;
  labelKey: 'tracking' | 'transit' | 'portal' | 'contact';
  icon: LucideIcon;
}

const ITEMS: ReadonlyArray<SubItem> = [
  { pathname: '/tracking', labelKey: 'tracking', icon: Package },
  // Calculator-Anker auf der Landing
  { pathname: '/', hash: 'transit', labelKey: 'transit', icon: Calculator },
  { pathname: '/kontakt', labelKey: 'contact', icon: Mail },
];

/**
 * Schmaler Aktion-Streifen unter dem Header.
 * Sichtbar nur auf Desktop (lg+) - Mobile-Drawer hat
 * eigene Wege zu diesen Aktionen.
 */
export function SubHeader() {
  const t = useTranslations('SubHeader');

  return (
    <div className="hidden border-b border-slate-200 bg-slate-50 lg:block">
      <Container>
        <ul className="flex h-9 items-center justify-end gap-1 text-xs">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={`${item.pathname}#${item.labelKey}`}>
                <Link
                  href={item.hash ? { pathname: item.pathname, hash: item.hash } : { pathname: item.pathname }}
                  className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-brand"
                >
                  <Icon className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href={{ pathname: '/portal/login' }}
              className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-slate-600 transition hover:bg-white hover:text-brand"
            >
              <User className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
              {t('portal')}
            </Link>
          </li>
        </ul>
      </Container>
    </div>
  );
}

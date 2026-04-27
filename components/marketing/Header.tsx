'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_PRIMARY, ROUTES } from '@/lib/constants';
import { Link, usePathname } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { LogoKED } from '@/components/shared/LogoKED';
import { LanguageSwitcher } from '@/components/marketing/LanguageSwitcher';
import { HeaderNavItem } from '@/components/marketing/HeaderNavItem';
import { MobileNavItem } from '@/components/marketing/MobileNavItem';

export function Header() {
  const t = useTranslations('Navigation');
  const tCommon = useTranslations('Common');
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Mobile-Menü bei Routenwechsel schließen
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Body-Scroll lock bei offenem Mobile-Menü
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mobileOpen]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full bg-white/95 backdrop-blur',
        'border-b transition-shadow duration-200',
        scrolled
          ? 'border-slate-200 shadow-[0_2px_12px_-6px_rgba(15,39,68,0.18)]'
          : 'border-slate-100',
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between md:h-[72px]">
          <Link
            href={ROUTES.home}
            aria-label={t('services')}
            className="flex items-center -my-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <LogoKED />
          </Link>

          {/* Desktop-Nav */}
          <nav aria-label="Hauptnavigation" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV_PRIMARY.map((item) => (
                <HeaderNavItem key={item.href} item={item} />
              ))}
            </ul>
          </nav>

          {/* Desktop-CTAs */}
          <div className="hidden items-center gap-3 md:flex">
            <LanguageSwitcher />
            <span aria-hidden="true" className="h-5 w-px bg-slate-200" />
            <Button asChild variant="outline" size="sm">
              <Link href={ROUTES.portal.login}>{t('portal')}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={ROUTES.kontakt}>{t('quote')}</Link>
            </Button>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-brand md:hidden hover:bg-slate-100"
            aria-label={mobileOpen ? tCommon('menu_close') : tCommon('menu_open')}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </Container>

      {/* Mobile-Drawer */}
      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-black/50 transition-opacity duration-200',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileOpen(false)}
        />
        <nav
          id="mobile-nav"
          aria-label="Mobile Navigation"
          className={cn(
            'absolute right-0 top-0 flex h-full w-[88%] max-w-sm flex-col bg-white',
            'shadow-[-12px_0_40px_-12px_rgba(0,0,0,0.4)]',
            'transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4">
            <LogoKED />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-brand hover:bg-slate-100"
              aria-label={tCommon('menu_close')}
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-3">
            <LanguageSwitcher variant="mobile" />
          </div>

          <nav
            aria-label="Hauptnavigation mobil"
            className="min-h-0 flex-1 overflow-y-auto bg-white p-4"
          >
            <ul className="flex flex-col gap-1">
              {NAV_PRIMARY.map((item) => (
                <MobileNavItem
                  key={item.href}
                  item={item}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </ul>
          </nav>

          <div className="shrink-0 border-t border-slate-100 bg-white p-4">
            <div className="flex flex-col gap-2">
              <Button asChild variant="outline" size="md" className="w-full">
                <Link href={ROUTES.portal.login}>{t('portal')}</Link>
              </Button>
              <Button asChild size="md" className="w-full">
                <Link href={ROUTES.kontakt}>{t('quote')}</Link>
              </Button>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}

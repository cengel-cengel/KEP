'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_PRIMARY, ROUTES } from '@/lib/constants';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { LogoKED } from '@/components/shared/LogoKED';

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Mobile-Menue bei Routenwechsel schliessen
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Body-Scroll lock bei offenem Mobile-Menue
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mobileOpen]);

  const isActive = (href: string) =>
    href === ROUTES.home ? pathname === '/' : pathname.startsWith(href);

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
          {/* Logo */}
          <Link
            href={ROUTES.home}
            aria-label="Zur Startseite"
            className="flex items-center -my-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <LogoKED />
          </Link>

          {/* Desktop-Nav */}
          <nav aria-label="Hauptnavigation" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV_PRIMARY.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative inline-flex h-10 items-center px-3 text-sm font-medium transition',
                        'rounded-md',
                        active
                          ? 'text-brand'
                          : 'text-slate-600 hover:text-brand',
                      )}
                    >
                      {item.label}
                      <span
                        className={cn(
                          'absolute bottom-1 left-3 right-3 h-px transition-all',
                          active ? 'bg-gold opacity-100' : 'bg-gold opacity-0',
                        )}
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Desktop-CTAs */}
          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant="outline" size="sm">
              <Link href={ROUTES.portal.login}>Kundenportal</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={ROUTES.kontakt}>Angebot anfordern</Link>
            </Button>
          </div>

          {/* Mobile-Toggle */}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-brand md:hidden hover:bg-slate-100"
            aria-label={mobileOpen ? 'Menue schliessen' : 'Menue oeffnen'}
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
          'fixed inset-0 z-50 md:hidden transition',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        {/* Backdrop */}
        <div
          className={cn(
            'absolute inset-0 bg-brand/40 transition-opacity duration-200',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileOpen(false)}
        />
        {/* Panel */}
        <nav
          id="mobile-nav"
          aria-label="Mobile Navigation"
          className={cn(
            'absolute right-0 top-0 h-full w-[88%] max-w-sm bg-white shadow-2xl',
            'transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
            <LogoKED />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-brand hover:bg-slate-100"
              aria-label="Menue schliessen"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <ul className="flex flex-col p-4">
            {NAV_PRIMARY.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center justify-between rounded-md px-3 py-3 text-base font-medium',
                      active
                        ? 'bg-slate-100 text-brand'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-brand',
                    )}
                  >
                    {item.label}
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 p-4">
            <Button asChild variant="outline" size="md" className="w-full">
              <Link href={ROUTES.portal.login}>Kundenportal</Link>
            </Button>
            <Button asChild size="md" className="w-full">
              <Link href={ROUTES.kontakt}>Angebot anfordern</Link>
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}

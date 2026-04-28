import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

/**
 * Zentrale Routing-Konfiguration für next-intl.
 *
 * Strategie:
 * - DE bleibt auf "/" (kein Locale-Prefix) - gut für SEO im Hauptmarkt
 * - EN bekommt "/en/..."-Prefix
 * - Pfade sind pro Locale übersetzt:
 *   /leistungen <-> /en/services
 *   /ueber-uns  <-> /en/about
 *   etc.
 *
 * Portal-Routen sind ebenfalls zweisprachig ("beides"), aber mit
 * gleichen englischen Pfad-Slugs (login/dashboard sind etablierte
 * englische Logistik-Tool-Begriffe).
 */
export const routing = defineRouting({
  locales: ['de', 'en'],
  defaultLocale: 'de',
  localePrefix: 'as-needed',

  pathnames: {
    '/': '/',

    // Marketing
    '/leistungen': {
      de: '/leistungen',
      en: '/services',
    },
    '/netzwerk': {
      de: '/netzwerk',
      en: '/network',
    },
    '/branchen': {
      de: '/branchen',
      en: '/industries',
    },
    '/ueber-uns': {
      de: '/ueber-uns',
      en: '/about',
    },
    '/kontakt': {
      de: '/kontakt',
      en: '/contact',
    },
    '/kontakt/danke': {
      de: '/kontakt/danke',
      en: '/contact/thanks',
    },

    // Rechtliches
    '/impressum': {
      de: '/impressum',
      en: '/imprint',
    },
    '/datenschutz': {
      de: '/datenschutz',
      en: '/privacy',
    },
    '/agb': {
      de: '/agb',
      en: '/terms',
    },

    // Portal (zweisprachig, aber gleiche englische Slugs)
    '/portal/login': '/portal/login',
    '/portal/dashboard': '/portal/dashboard',
    '/portal/sendungen': {
      de: '/portal/sendungen',
      en: '/portal/shipments',
    },
    '/portal/sendungen/[id]': {
      de: '/portal/sendungen/[id]',
      en: '/portal/shipments/[id]',
    },
    '/portal/sendungen/neu': {
      de: '/portal/sendungen/neu',
      en: '/portal/shipments/new',
    },
    '/portal/dokumente': {
      de: '/portal/dokumente',
      en: '/portal/documents',
    },
    '/portal/profil': {
      de: '/portal/profil',
      en: '/portal/profile',
    },
  },
});

export type Locale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;

/**
 * Statische Pfade ohne Dynamic-Segment - geeignet für Metadata,
 * Sitemaps, Sprachumschalter etc., wo keine params verfügbar sind.
 */
export type StaticPathname = Exclude<AppPathname, `${string}[${string}]${string}`>;

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

import type { Metadata } from 'next';
import { SITE } from './constants';
import { routing, getPathname, type StaticPathname, type Locale } from '@/i18n/routing';

interface LocaleMetadataOptions {
  locale: string;
  title: string;
  description: string;
  pathname: StaticPathname;
  keywords?: string[];
  noIndex?: boolean;
}

/**
 * Erzeugt vollständige Metadata inkl. hreflang-Alternates für eine
 * lokalisierte Seite. Verwendet next-intl getPathname() für korrekte
 * Übersetzungen der URL-Slugs (z.B. /ueber-uns <-> /en/about).
 */
export function buildLocaleMetadata({
  locale,
  title,
  description,
  pathname,
  keywords,
  noIndex = false,
}: LocaleMetadataOptions): Metadata {
  const fullTitle = `${title} | ${SITE.name}`;

  const canonicalLocale = (locale as Locale) ?? routing.defaultLocale;
  const canonicalPath = getPathname({ locale: canonicalLocale, href: pathname });
  const canonicalUrl = `${SITE.url}${canonicalPath}`;

  const languages = Object.fromEntries(
    routing.locales.map((loc) => [
      loc,
      `${SITE.url}${getPathname({ locale: loc, href: pathname })}`,
    ]),
  );

  return {
    title: fullTitle,
    description,
    keywords,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ...languages,
        'x-default': `${SITE.url}${getPathname({
          locale: routing.defaultLocale,
          href: pathname,
        })}`,
      },
    },
    openGraph: {
      title: fullTitle,
      description,
      url: canonicalUrl,
      siteName: SITE.name,
      locale: canonicalLocale === 'de' ? 'de_DE' : 'en_GB',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

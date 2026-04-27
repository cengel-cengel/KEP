import type { MetadataRoute } from 'next';
import { routing, getPathname, type StaticPathname } from '@/i18n/routing';
import { SITE } from '@/lib/constants';

interface SitemapEntry {
  pathname: StaticPathname;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}

const ENTRIES: SitemapEntry[] = [
  { pathname: '/', changeFrequency: 'weekly', priority: 1.0 },
  { pathname: '/leistungen', changeFrequency: 'weekly', priority: 0.9 },
  { pathname: '/netzwerk', changeFrequency: 'monthly', priority: 0.8 },
  { pathname: '/ueber-uns', changeFrequency: 'monthly', priority: 0.8 },
  { pathname: '/kontakt', changeFrequency: 'monthly', priority: 0.8 },
  { pathname: '/impressum', changeFrequency: 'yearly', priority: 0.3 },
  { pathname: '/datenschutz', changeFrequency: 'yearly', priority: 0.3 },
  { pathname: '/agb', changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return ENTRIES.flatMap((entry) =>
    routing.locales.map((locale) => {
      const path = getPathname({ locale, href: entry.pathname });
      return {
        url: `${SITE.url}${path}`,
        lastModified,
        changeFrequency: entry.changeFrequency,
        priority: entry.priority,
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((alt) => [
              alt,
              `${SITE.url}${getPathname({ locale: alt, href: entry.pathname })}`,
            ]),
          ),
        },
      };
    }),
  );
}

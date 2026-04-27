import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { SITE } from '@/lib/constants';
import '../globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = SITE.googleSiteVerification
  ? { verification: { google: SITE.googleSiteVerification } }
  : {};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: 'Common' });

  /**
   * Organization-Schema. MovingCompany ist die spezifischere
   * Schema.org-Kategorie für Speditionen. @id wird von
   * Sub-Schemas (Service, FAQ, ContactPage) referenziert.
   */
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MovingCompany',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    alternateName: 'Engel, The Navi & Kempf',
    url: SITE.url,
    logo: `${SITE.url}/images/logo.png`,
    image: `${SITE.url}/images/hero.jpg`,
    description:
      'Spedition aus Stuttgart mit Schwerpunkt Sammelgut, Direktverkehre und UK-Logistik.',
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.address.street,
      postalCode: SITE.address.zip,
      addressLocality: SITE.address.city,
      addressCountry: SITE.address.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: SITE.geo.latitude,
      longitude: SITE.geo.longitude,
    },
    telephone: SITE.phone,
    email: SITE.email,
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '08:00',
      closes: '17:00',
    },
    founder: [
      { '@type': 'Person', name: 'Carlos Engel', jobTitle: 'Head of Digital Business Services' },
      { '@type': 'Person', name: 'Dawoud The Navi', jobTitle: 'Head of Operations' },
      { '@type': 'Person', name: 'Markus Long John Kempf', jobTitle: 'Head of Business Development & Solutions' },
    ],
    areaServed: [
      { '@type': 'Country', name: 'Germany' },
      { '@type': 'Country', name: 'United Kingdom' },
      { '@type': 'Place', name: 'Europe' },
    ],
    knowsAbout: [
      'Sammelgut',
      'Direktverkehre',
      'UK-Logistik',
      'Lager',
      'Cross-Docking',
      'Zollabwicklung',
      'ADR Gefahrgut',
      'Sammelladungsverkehr',
    ],
    sameAs: [SITE.linkedInUrl],
  };

  return (
    <html lang={locale} className={inter.variable}>
      <body className="min-h-screen flex flex-col antialiased bg-white text-slate-900">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
        >
          {t('skip_to_content')}
        </a>
        <NextIntlClientProvider messages={messages} locale={locale}>
          {children}
        </NextIntlClientProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </body>
    </html>
  );
}

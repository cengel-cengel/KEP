import type { Metadata } from 'next';
import { SITE } from './constants';

interface SeoOptions {
  title?: string;
  description?: string;
  path?: string;
  noIndex?: boolean;
}

export function buildMetadata({
  title,
  description = SITE.description,
  path = '/',
  noIndex = false,
}: SeoOptions = {}): Metadata {
  const fullTitle = title ? `${title} | ${SITE.name}` : SITE.name;
  const url = `${SITE.url}${path}`;

  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE.name,
      locale: 'de_DE',
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

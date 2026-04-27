import type { Metadata, Viewport } from 'next';
import { SITE } from '@/lib/constants';

/**
 * Root-Layout. Reicht children durch - die echte HTML-Hülle
 * (html, body, lang-Attribut, Fonts, IntlProvider) liegt in
 * app/[locale]/layout.tsx, weil das lang-Attribut sprach-
 * abhängig ist.
 *
 * Diese Datei ist nur ein Pflicht-Wrapper für Next.js.
 */

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  themeColor: '#0f2744',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

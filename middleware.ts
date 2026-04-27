import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Alle Routen außer Next-Internas, API, Dev-Tools und statische Dateien
  matcher: ['/((?!api|_next|_vercel|dev|images|.*\\..*).*)'],
};

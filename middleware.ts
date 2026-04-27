import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth';

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Erkennt geschützte Portal-Pfade (außer /portal/login).
 * Beide Sprachen: /portal/* und /en/portal/*.
 */
function isProtectedPortalPath(pathname: string): boolean {
  // /portal/* (DE default) oder /en/portal/*
  const match = pathname.match(/^\/(?:(de|en)\/)?portal(\/.*)?$/);
  if (!match) return false;
  const subpath = match[2] ?? '';
  // Login darf ohne Auth aufgerufen werden
  if (subpath === '/login' || subpath.startsWith('/login')) return false;
  return true;
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Auth-Check für Portal vor i18n-Routing
  if (isProtectedPortalPath(pathname)) {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySession(token) : null;

    if (!session) {
      const loginUrl = req.nextUrl.clone();
      // Locale aus URL ableiten (Default DE)
      const isEn = pathname.startsWith('/en/');
      loginUrl.pathname = isEn ? '/en/portal/login' : '/portal/login';
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|images|.*\\..*).*)'],
};

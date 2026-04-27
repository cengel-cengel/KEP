import { SignJWT, jwtVerify } from 'jose';
import type { SessionPayload } from '@/types/user';

export const SESSION_COOKIE_NAME = 'ked_session';
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60; // 8h - kürzer = sicherer

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    // Fallback nur fuer lokale Entwicklung - in Production muss
    // JWT_SECRET zwingend gesetzt sein (siehe .env.local.example).
    return new TextEncoder().encode(
      'dev-only-fallback-secret-please-set-JWT_SECRET-in-production',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: Omit<SessionPayload, 'exp'>): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_LIFETIME_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Cookie-Optionen für die Portal-Session.
 *
 * - httpOnly      kein JS-Zugriff (XSS-Schutz)
 * - sameSite=strict   strenger als 'lax' - Cookie wird auf
 *                     keinem Cross-Site-Navigationsweg mitgesendet
 * - secure        nur über HTTPS in Production
 * - path=/        muss / sein, damit der Logout (POST /api/auth/logout)
 *                 das Cookie auch löschen darf. /portal-Scope wäre
 *                 strenger, würde aber API-Routes ausschließen.
 * - maxAge        8h erzwungene Re-Authentifizierung
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_LIFETIME_SECONDS,
};

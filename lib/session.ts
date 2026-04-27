import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySession } from './auth';
import type { SessionPayload } from '@/types/user';

/**
 * Liest die Session aus dem httpOnly-Cookie. Nur in Server
 * Components / API-Routes nutzbar.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySession(token);
}

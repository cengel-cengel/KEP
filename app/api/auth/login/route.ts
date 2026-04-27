import { NextResponse } from 'next/server';
import { z } from 'zod';
import { signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth';
import { DEMO_CREDENTIALS, DEMO_USER } from '@/mocks/user';
import {
  limitLogin,
  limitLoginByEmail,
  limitLoginByIpDaily,
  rateLimitResponse,
} from '@/lib/ratelimit';
import { anonymizeIp, getClientIp } from '@/lib/security';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const TMS_API_URL = process.env.TMS_API_URL ?? 'http://localhost:3001';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

/**
 * Generischer Fehler, der NICHT verrät ob die E-Mail existiert
 * (Privacy / Anti-Enumeration).
 */
const GENERIC_INVALID = NextResponse.json(
  { success: false, error: 'invalid_credentials' },
  { status: 401 },
);

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);

  // 1. IP-basiertes Tageslimit (50/24h) - hartes Cap gegen Bots
  const dailyCheck = await limitLoginByIpDaily(ip);
  if (!dailyCheck.success) {
    // eslint-disable-next-line no-console
    console.warn('[login] IP daily-limit hit', anonymizeIp(ip));
    return rateLimitResponse(dailyCheck.reset);
  }

  // 2. IP-basiertes Kurzlimit (5/15 min)
  const ipCheck = await limitLogin(ip);
  if (!ipCheck.success) {
    return rateLimitResponse(ipCheck.reset);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'validation' }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // 3. Email-basiertes Limit (5/15 min) - schützt gegen Credential-Stuffing
  const emailCheck = await limitLoginByEmail(email);
  if (!emailCheck.success) {
    return rateLimitResponse(emailCheck.reset);
  }

  if (USE_MOCKS) {
    if (
      email !== DEMO_CREDENTIALS.email.toLowerCase() ||
      password !== DEMO_CREDENTIALS.password
    ) {
      // Simuliertes Delay - constant-time-feel + UX-Realismus
      await new Promise((r) => setTimeout(r, 400));
      // eslint-disable-next-line no-console
      console.warn('[login] failed', anonymizeIp(ip), email);
      return GENERIC_INVALID;
    }

    const token = await signSession({
      sub: DEMO_USER.id,
      customerId: DEMO_USER.customerId,
      email: DEMO_USER.email,
      firstName: DEMO_USER.firstName,
      lastName: DEMO_USER.lastName,
      company: DEMO_USER.company,
    });

    const res = NextResponse.json({
      success: true,
      user: {
        firstName: DEMO_USER.firstName,
        lastName: DEMO_USER.lastName,
        company: DEMO_USER.company,
      },
    });
    res.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
    return res;
  }

  // Echter Modus: TMS-Anfrage
  try {
    const tmsRes = await fetch(`${TMS_API_URL}/auth/customer-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });

    if (!tmsRes.ok) {
      // eslint-disable-next-line no-console
      console.warn('[login] failed (tms)', anonymizeIp(ip), email);
      return GENERIC_INVALID;
    }

    const tmsData = (await tmsRes.json()) as {
      user: {
        id: string;
        customerId: string;
        email: string;
        firstName: string;
        lastName: string;
        company: string;
      };
    };

    const token = await signSession({
      sub: tmsData.user.id,
      customerId: tmsData.user.customerId,
      email: tmsData.user.email,
      firstName: tmsData.user.firstName,
      lastName: tmsData.user.lastName,
      company: tmsData.user.company,
    });

    const res = NextResponse.json({ success: true, user: tmsData.user });
    res.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
    return res;
  } catch {
    return NextResponse.json(
      { success: false, error: 'network_error' },
      { status: 503 },
    );
  }
}

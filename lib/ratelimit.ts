import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate-Limiting via Upstash Redis (Edge-kompatibel).
 *
 * Graceful degradation: ist kein Redis konfiguriert (z.B. lokale
 * Entwicklung ohne Account), liefern alle Limiter `success: true`
 * zurück - User werden nie wegen fehlender Infrastruktur blockiert.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

const ENABLED = redis !== null;

interface LimiterResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

const PASS: LimiterResult = {
  success: true,
  limit: 0,
  remaining: 0,
  reset: 0,
};

function makeLimiter(prefix: string, tokens: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}`) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: false,
    prefix: `ked:${prefix}`,
  });
}

const loginRl = makeLimiter('login', 5, '15 m');
const loginEmailRl = makeLimiter('login-email', 5, '15 m');
const loginIpDailyRl = makeLimiter('login-ip-day', 50, '24 h');
const leadsRl = makeLimiter('leads', 3, '1 h');
const apiRl = makeLimiter('api', 60, '1 m');
const portalRl = makeLimiter('portal', 100, '1 m');

async function safeLimit(
  limiter: ReturnType<typeof makeLimiter>,
  key: string,
): Promise<LimiterResult> {
  if (!limiter) return PASS;
  try {
    const r = await limiter.limit(key);
    return {
      success: r.success,
      limit: r.limit,
      remaining: r.remaining,
      reset: r.reset,
    };
  } catch (err) {
    // Upstash temporär down → durchlassen, aber loggen
    // eslint-disable-next-line no-console
    console.warn('[ratelimit] Upstash unreachable:', err);
    return PASS;
  }
}

export const isRateLimitEnabled = () => ENABLED;

export const limitLogin = (ip: string) => safeLimit(loginRl, `login:${ip}`);
export const limitLoginByEmail = (email: string) =>
  safeLimit(loginEmailRl, `login-email:${email.toLowerCase()}`);
export const limitLoginByIpDaily = (ip: string) =>
  safeLimit(loginIpDailyRl, `login-ip-day:${ip}`);

export const limitLeads = (ip: string) => safeLimit(leadsRl, `leads:${ip}`);
export const limitApi = (ip: string) => safeLimit(apiRl, `api:${ip}`);
export const limitPortal = (sessionKey: string) =>
  safeLimit(portalRl, `portal:${sessionKey}`);

/**
 * Generischer 429-Response mit Retry-After-Header.
 */
export function rateLimitResponse(reset: number): Response {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return new Response(
    JSON.stringify({ success: false, error: 'rate_limited' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    },
  );
}

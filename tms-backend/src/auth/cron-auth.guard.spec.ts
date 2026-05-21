/**
 * R3-E: CronAuthGuard Tests.
 *
 * Verifiziert die 3 Pfade:
 *   - CRON_SECRET fehlt → 503 ServiceUnavailable (fail-closed)
 *   - Header passt nicht → 401 Unauthorized
 *   - Header passt → allow (returns true)
 */
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CronAuthGuard } from './cron-auth.guard';

function makeCtx(headers: Record<string, string | undefined>) {
  const req = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

function makeGuard(secret?: string): CronAuthGuard {
  const config: any = { get: () => secret };
  return new CronAuthGuard(config);
}

describe('CronAuthGuard', () => {
  it('CRON_SECRET nicht gesetzt → 503 (fail-closed)', () => {
    const guard = makeGuard(undefined);
    expect(() =>
      guard.canActivate(makeCtx({ 'x-cron-secret': 'whatever' })),
    ).toThrow(ServiceUnavailableException);
  });

  it('CRON_SECRET leer-string → 503 (fail-closed)', () => {
    const guard = makeGuard('   ');
    expect(() => guard.canActivate(makeCtx({}))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('Header fehlt → 401', () => {
    const guard = makeGuard('correct-secret');
    expect(() => guard.canActivate(makeCtx({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('Header falsch → 401', () => {
    const guard = makeGuard('correct-secret');
    expect(() =>
      guard.canActivate(makeCtx({ 'x-cron-secret': 'falsch' })),
    ).toThrow(UnauthorizedException);
  });

  it('Header korrekt → allow (true)', () => {
    const guard = makeGuard('correct-secret');
    const result = guard.canActivate(
      makeCtx({ 'x-cron-secret': 'correct-secret' }),
    );
    expect(result).toBe(true);
  });

  it('case-insensitive header (Express normalisiert lowercase)', () => {
    // Express liefert headers immer als lowercase-keyed Object.
    // Wir verifizieren dass wir x-cron-secret (lowercase) lesen.
    const guard = makeGuard('xyz');
    expect(() =>
      guard.canActivate(makeCtx({ 'X-Cron-Secret': 'xyz' })),
    ).toThrow(UnauthorizedException);
    // ↑ Camel-Case kommt in Express NICHT als Key an → ablehnen.
    // Korrekter Pfad:
    const ok = guard.canActivate(makeCtx({ 'x-cron-secret': 'xyz' }));
    expect(ok).toBe(true);
  });
});

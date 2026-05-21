/**
 * R3-E: CronAuthGuard — schützt /admin/cron/* Endpoints.
 *
 * Mechanik:
 *   - Erwartet Header `X-Cron-Secret: <value>`.
 *   - Value == process.env.CRON_SECRET → allow.
 *   - Sonst → 401.
 *   - Fail-closed: CRON_SECRET nicht gesetzt → 503 ServiceUnavailable
 *     (NIE offen-blanko zulassen).
 *
 * Bewusst getrennt vom JwtAuthGuard — wir mischen die Auth-
 * Mechaniken nicht (1 Endpoint, 1 Guard). Railway-Cron schickt
 * den Secret-Header, kein Bearer-JWT.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const CRON_HEADER = 'x-cron-secret';

@Injectable()
export class CronAuthGuard implements CanActivate {
  private readonly logger = new Logger(CronAuthGuard.name);
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('CRON_SECRET');
    if (!expected || expected.trim().length === 0) {
      // Fail-closed: kein Secret konfiguriert → kein Cron erlaubt.
      this.logger.error(
        'CronAuthGuard: CRON_SECRET nicht konfiguriert — alle Cron-Calls werden abgelehnt.',
      );
      throw new ServiceUnavailableException(
        'Cron-Endpoint nicht konfiguriert',
      );
    }
    const req = context.switchToHttp().getRequest<{
      headers?: Record<string, string | undefined>;
    }>();
    const provided = req.headers?.[CRON_HEADER];
    if (!provided || provided !== expected) {
      this.logger.warn(
        `CronAuthGuard: ungültiger Secret-Header (received: ${provided ? '***' : 'missing'})`,
      );
      throw new UnauthorizedException('Invalid cron secret');
    }
    return true;
  }
}

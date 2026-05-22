/**
 * R3+ Nightly-Recompute Scheduler.
 *
 * @Cron-decorated (registered via @nestjs/schedule + ScheduleModule
 * .forRoot() im AppModule). Läuft täglich 02:00 Europe/Berlin
 * (DST-safe — kein UTC-Offset-Drift bei Sommer/Winter).
 *
 * isRunning-Guard: wenn ein vorheriger Run noch läuft (sollte nicht
 * passieren bei 24h-Cycle, aber defensive), überspringt der nächste
 * Trigger lautlos. Logger.warn dokumentiert den Skip.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RecomputeService } from './recompute.service';

@Injectable()
export class RecomputeSchedulerService {
  private readonly logger = new Logger(RecomputeSchedulerService.name);
  private isRunning = false;

  constructor(private readonly recompute: RecomputeService) {}

  /**
   * Täglich 02:00 Berlin-Zeit (sommerzeit-/winterzeit-safe).
   * Ruft `recompute.runRecomputeLoop('all', 10)` — gleiche
   * Defaults wie der manuelle JWT-Endpoint.
   */
  @Cron('0 2 * * *', { timeZone: 'Europe/Berlin' })
  async nightlyRecompute(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'nightlyRecompute: previous run still active — skip',
      );
      return;
    }
    this.isRunning = true;
    try {
      const result = await this.recompute.runRecomputeLoop('all', 10);
      this.logger.log(
        `nightlyRecompute OK ` +
          `nv=${result.processed_nv}/${result.count_nv} ` +
          `fv=${result.processed_fv}/${result.count_fv} ` +
          `errors=${result.errors_nv + result.errors_fv} ` +
          `duration=${result.duration_ms}ms`,
      );
    } catch (err: any) {
      this.logger.error(
        `nightlyRecompute FAILED: ${err?.message ?? err}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /** @internal — read-only Status-Check für Tests. */
  get _isRunning(): boolean {
    return this.isRunning;
  }
}

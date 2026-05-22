/**
 * R3-E: Cron-Controller — getrennt vom JWT-AdminController.
 *
 * Mountet unter /admin/cron/*. NUR CronAuthGuard, KEIN JwtAuthGuard.
 * Zwei saubere Auth-Pfade:
 *   - /admin/*       → JwtAuthGuard (Mensch via UI)
 *   - /admin/cron/*  → CronAuthGuard (Railway-Cron via Secret-Header)
 *
 * Behält den HTTP-Endpoint als Manual-Trigger-Pfad (Railway-Cron-
 * Service, externe Tools, on-demand-Diagnose). Der Scheduler
 * (RecomputeSchedulerService @Cron) ruft die SELBE Service-Methode
 * direkt — kein HTTP-Loop nötig.
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CronAuthGuard } from '../auth/cron-auth.guard';
import { RecomputeService } from './recompute.service';

@ApiTags('admin-cron')
@UseGuards(CronAuthGuard)
@Controller('admin/cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);
  constructor(private readonly recompute: RecomputeService) {}

  /**
   * Fire-and-forget. HTTP 202 sofort, Background-Loop läuft.
   */
  @Post('recompute-all-tours')
  @HttpCode(HttpStatus.ACCEPTED)
  async cronRecomputeAllTours(
    @Body() body: { batchSize?: number; mode?: 'nv' | 'fv' | 'all' } = {},
  ): Promise<{ started: boolean; mode: string; count_nv: number; count_fv: number }> {
    const batchSize = Math.min(50, Math.max(1, body.batchSize ?? 10));
    const mode = body.mode ?? 'all';
    const { count_nv, count_fv } = await this.recompute.countActive(mode);

    setImmediate(() => {
      void this.recompute.runRecomputeLoop(mode, batchSize);
    });

    this.logger.log(
      `CRON recompute-all-tours TRIGGER mode=${mode} nv=${count_nv} fv=${count_fv}`,
    );
    return {
      started: true,
      mode,
      count_nv,
      count_fv,
    };
  }
}

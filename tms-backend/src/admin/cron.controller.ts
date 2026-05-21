/**
 * R3-E: Cron-Controller — getrennt vom JWT-AdminController.
 *
 * Mountet unter /admin/cron/*. NUR CronAuthGuard, KEIN JwtAuthGuard.
 * Zwei saubere Auth-Pfade:
 *   - /admin/*       → JwtAuthGuard (Mensch via UI)
 *   - /admin/cron/*  → CronAuthGuard (Railway-Cron via Secret-Header)
 *
 * Railway-Cron-Konfiguration (railway.json `crons[]`):
 *   path: "/admin/cron/recompute-all-tours"
 *   schedule: "0 3 * * *"  (nightly 03:00 UTC)
 *   header:  "X-Cron-Secret: $CRON_SECRET" (env)
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
import { PrismaService } from '../prisma/prisma.service';
import { NvTourenService } from '../nv-touren/nv-touren.service';
import { ToursService } from '../tours/tours.service';

@ApiTags('admin-cron')
@UseGuards(CronAuthGuard)
@Controller('admin/cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly nvTouren: NvTourenService,
    private readonly tours: ToursService,
  ) {}

  /**
   * Nightly-Recompute aller aktiven Touren. Spiegelt
   * AdminController.recomputeAllTours (JWT) — eigene Implementation
   * damit die JWT-Variante NICHT aufgeweicht werden muss.
   * Fire-and-forget. HTTP 202 sofort, Background-Loop läuft weiter.
   */
  @Post('recompute-all-tours')
  @HttpCode(HttpStatus.ACCEPTED)
  async cronRecomputeAllTours(
    @Body() body: { batchSize?: number; mode?: 'nv' | 'fv' | 'all' } = {},
  ): Promise<{ started: boolean; mode: string; count_nv: number; count_fv: number }> {
    const batchSize = Math.min(50, Math.max(1, body.batchSize ?? 10));
    const mode = body.mode ?? 'all';

    const [nvCount, fvCount] = await Promise.all([
      mode === 'fv'
        ? Promise.resolve(0)
        : this.prisma.nv_touren.count({
            where: { status: { in: ['PLANNING', 'IN_PROGRESS'] } },
          }),
      mode === 'nv'
        ? Promise.resolve(0)
        : this.prisma.tours.count({
            where: { status: { in: ['planned', 'dispatched'] } },
          }),
    ]);

    setImmediate(() => {
      void this.runRecomputeLoop(mode, batchSize, nvCount, fvCount);
    });

    this.logger.log(
      `CRON recompute-all-tours START mode=${mode} nv=${nvCount} fv=${fvCount}`,
    );
    return {
      started: true,
      mode,
      count_nv: nvCount,
      count_fv: fvCount,
    };
  }

  /** Background-Loop (mirror AdminController.runRecomputeLoop). */
  private async runRecomputeLoop(
    mode: 'nv' | 'fv' | 'all',
    batchSize: number,
    nvCount: number,
    fvCount: number,
  ): Promise<void> {
    if (mode !== 'fv') {
      let offset = 0;
      let processed = 0;
      let errors = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await this.prisma.nv_touren.findMany({
          where: { status: { in: ['PLANNING', 'IN_PROGRESS'] } },
          select: { id: true },
          orderBy: { id: 'asc' },
          skip: offset,
          take: batchSize,
        });
        if (batch.length === 0) break;
        for (const t of batch) {
          try {
            await this.nvTouren.recomputeTourFull(t.id);
            processed++;
          } catch (err: any) {
            errors++;
            this.logger.warn(
              `cron nv ${t.id} failed: ${err?.message ?? err}`,
            );
          }
        }
        offset += batch.length;
        this.logger.log(
          `CRON nv: ${processed}/${nvCount} (errors=${errors})`,
        );
      }
    }
    if (mode !== 'nv') {
      let offset = 0;
      let processed = 0;
      let errors = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await this.prisma.tours.findMany({
          where: { status: { in: ['planned', 'dispatched'] } },
          select: { id: true },
          orderBy: { id: 'asc' },
          skip: offset,
          take: batchSize,
        });
        if (batch.length === 0) break;
        for (const t of batch) {
          try {
            await this.tours.recomputeTourFull(t.id);
            processed++;
          } catch (err: any) {
            errors++;
            this.logger.warn(
              `cron fv ${t.id} failed: ${err?.message ?? err}`,
            );
          }
        }
        offset += batch.length;
        this.logger.log(
          `CRON fv: ${processed}/${fvCount} (errors=${errors})`,
        );
      }
    }
    this.logger.log('CRON recompute-all-tours DONE');
  }
}

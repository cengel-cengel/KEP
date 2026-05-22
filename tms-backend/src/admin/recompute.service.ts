/**
 * R3+ Nightly-Recompute: zentrale Service-Methode.
 *
 * Aufrufer (3 Pfade, alle teilen dieselbe Logik):
 *   - AdminController POST /admin/recompute-all-tours (JWT, Mensch)
 *   - CronController  POST /admin/cron/recompute-all-tours (CRON_SECRET)
 *   - RecomputeSchedulerService @Cron('0 2 * * *', Europe/Berlin)
 *
 * Loop:
 *   1. Count nv_touren + tours (status active).
 *   2. Paged findMany + recomputeTourFull pro Tour (best-effort).
 *   3. Per-Tour try/catch — Fehler swallowen, Loop läuft weiter.
 *
 * Methode ist async + sequenziell (kein setImmediate intern).
 * Caller-Controller wrappen ggf. setImmediate für fire-and-forget;
 * Scheduler ruft direkt + await (mit isRunning-Guard).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NvTourenService } from '../nv-touren/nv-touren.service';
import { ToursService } from '../tours/tours.service';

export type RecomputeMode = 'nv' | 'fv' | 'all';

export interface RecomputeResult {
  mode: RecomputeMode;
  count_nv: number;
  count_fv: number;
  processed_nv: number;
  processed_fv: number;
  errors_nv: number;
  errors_fv: number;
  duration_ms: number;
}

@Injectable()
export class RecomputeService {
  private readonly logger = new Logger(RecomputeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nvTouren: NvTourenService,
    private readonly tours: ToursService,
  ) {}

  /**
   * Zählt aktive Touren für mode (nv/fv/all). Wird vor Loop-Start
   * gerufen damit Controller initial-counts in Response liefern können.
   */
  async countActive(mode: RecomputeMode): Promise<{
    count_nv: number;
    count_fv: number;
  }> {
    const [count_nv, count_fv] = await Promise.all([
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
    return { count_nv, count_fv };
  }

  /**
   * Hauptschleife. Idempotent + best-effort.
   */
  async runRecomputeLoop(
    mode: RecomputeMode,
    batchSize: number,
  ): Promise<RecomputeResult> {
    const start = Date.now();
    const { count_nv, count_fv } = await this.countActive(mode);
    this.logger.log(
      `recompute START mode=${mode} nv=${count_nv} fv=${count_fv} batch=${batchSize}`,
    );

    let processed_nv = 0;
    let errors_nv = 0;
    let processed_fv = 0;
    let errors_fv = 0;

    if (mode !== 'fv') {
      let offset = 0;
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
            processed_nv++;
          } catch (err: any) {
            errors_nv++;
            this.logger.warn(
              `nv recompute ${t.id} failed: ${err?.message ?? err}`,
            );
          }
        }
        offset += batch.length;
        this.logger.log(
          `recompute NV: ${processed_nv}/${count_nv} (errors=${errors_nv})`,
        );
      }
    }

    if (mode !== 'nv') {
      let offset = 0;
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
            processed_fv++;
          } catch (err: any) {
            errors_fv++;
            this.logger.warn(
              `fv recompute ${t.id} failed: ${err?.message ?? err}`,
            );
          }
        }
        offset += batch.length;
        this.logger.log(
          `recompute FV: ${processed_fv}/${count_fv} (errors=${errors_fv})`,
        );
      }
    }

    const duration_ms = Date.now() - start;
    this.logger.log(
      `recompute DONE mode=${mode} nv=${processed_nv}/${count_nv} fv=${processed_fv}/${count_fv} errors=${errors_nv + errors_fv} duration=${duration_ms}ms`,
    );
    return {
      mode,
      count_nv,
      count_fv,
      processed_nv,
      processed_fv,
      errors_nv,
      errors_fv,
      duration_ms,
    };
  }
}

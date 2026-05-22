import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackfillCoordinatesService } from './backfill-coordinates.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ToursService } from '../tours/tours.service';
import { RecomputeService } from './recompute.service';

class StartBackfillDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  batchSize?: number;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  constructor(
    private readonly backfill: BackfillCoordinatesService,
    private readonly shipments: ShipmentsService,
    private readonly prisma: PrismaService,
    private readonly tours: ToursService,
    private readonly recompute: RecomputeService,
  ) {}

  @Post('backfill-coordinates')
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() dto: StartBackfillDto) {
    if (this.backfill.isRunning()) {
      throw new ConflictException('Backfill-Job läuft bereits.');
    }
    const batchSize = dto.batchSize ?? 100;
    const { total } = await this.backfill.startJob(batchSize);
    const estimatedMinutes = Math.ceil((total * 1.1) / 60);
    return {
      jobStarted: true,
      addressesToProcess: total,
      estimatedDurationMinutes: estimatedMinutes,
    };
  }

  @Get('backfill-coordinates/status')
  async status() {
    const state = this.backfill.getStatus();
    const pending = await this.backfill.countPending();
    return { ...state, pending };
  }

  @Get('backfill-coordinates/failed')
  async failed() {
    return this.backfill.getFailedDiagnostics();
  }

  /**
   * Bulk-Backfill für effective_pallets bei Sendungen, die das
   * Feld noch nicht haben (eingeführt mit NV-2i14b).
   * Synchron, batched. Mehrfach aufrufen bis remaining=0.
   */
  @Post('backfill-effective-pallets')
  async backfillEffectivePallets(@Query('limit') limitStr?: string) {
    const limit = Math.max(1, Math.min(2000, Number(limitStr) || 1000));
    const candidates = await this.prisma.shipments.findMany({
      where: { effective_pallets: null },
      select: { id: true },
      take: limit,
    });
    let processed = 0;
    let errors = 0;
    let i = 0;
    for (const s of candidates) {
      try {
        await this.shipments.recalcAggregateForShipment(s.id);
        processed += 1;
      } catch (err: any) {
        errors += 1;
        this.logger.warn(
          `recalcAggregate(${s.id}) failed: ${err?.message ?? err}`,
        );
      }
      i += 1;
      if (i % 100 === 0) {
        this.logger.log(
          `backfill-effective-pallets: ${i}/${candidates.length}`,
        );
      }
    }
    const remaining = await this.prisma.shipments.count({
      where: { effective_pallets: null },
    });
    return {
      ok: errors === 0,
      processed,
      errors,
      remaining,
      batch_size: candidates.length,
    };
  }

  /**
   * Map-Routing R3: Bulk-Recompute aller aktiven Touren.
   * Fire-and-forget — Response sofort (HTTP 202).
   * Service-Loop läuft im Background mit Batch-Logging.
   * Idempotent: safe-Methoden swallowen per-Tour-Errors.
   *
   * Use-Case: Nach Migration 47 (classification) muss
   * tour.is_charter neu abgeleitet werden für bestehende
   * Touren. risk_severity-cascade aktualisieren ohne
   * manuelles add/remove.
   */
  @Post('recompute-all-tours')
  @HttpCode(HttpStatus.ACCEPTED)
  async recomputeAllTours(
    @Body() body: { batchSize?: number; mode?: 'nv' | 'fv' | 'all' },
  ): Promise<{ started: boolean; mode: string; count_nv: number; count_fv: number }> {
    const batchSize = Math.min(50, Math.max(1, body.batchSize ?? 10));
    const mode = body.mode ?? 'all';
    const { count_nv, count_fv } = await this.recompute.countActive(mode);

    // Fire-and-forget — Loop lebt in RecomputeService (DRY).
    setImmediate(() => {
      void this.recompute.runRecomputeLoop(mode, batchSize);
    });

    return {
      started: true,
      mode,
      count_nv,
      count_fv,
    };
  }

  /**
   * R2.4: Charter-Umschlag-Bulk-Backfill.
   * Findet alle Sendungen mit status='in_warehouse',
   * classification='CHARTER_UMSCHLAG', tour_id=null und triggert
   * consolidateOrCreateFvTour async für jede.
   * HTTP 202 + immediate response mit pending-count.
   */
  @Post('consolidate-charter-umschlag')
  @HttpCode(HttpStatus.ACCEPTED)
  async consolidateCharterUmschlag(
    @Body() body: { limit?: number } = {},
  ): Promise<{ pending: number; processed: string }> {
    return this.tours.consolidateAllInWarehouse({ limit: body.limit });
  }

  /**
   * R2.4: Manual Re-Trigger für eine einzelne Sendung.
   * Mensch klickt im UI "Re-Trigger Hauptlauf" — synchroner
   * Response mit action-Ergebnis.
   */
  @Post('consolidate-shipment/:id')
  async consolidateShipment(
    @Body() _body: unknown,
    @Query('id') _q: unknown,
    @Param('id') id: string,
  ) {
    return this.tours.consolidateOrCreateFvTour(id);
  }

  /**
   * R2.4: Dry-Run-Preview ohne Mutationen.
   * Mensch sieht welche FV-Tour gematcht würde + Top-N candidates
   * mit Score + eligibility-Blockers.
   */
  @Get('consolidate-preview/:id')
  async previewConsolidate(@Param('id') id: string) {
    return this.tours.dryRunConsolidate(id);
  }
}

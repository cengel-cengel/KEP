import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
}

import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackfillCoordinatesService } from './backfill-coordinates.service';

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
  constructor(private readonly backfill: BackfillCoordinatesService) {}

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
}

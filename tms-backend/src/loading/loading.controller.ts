import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Response } from 'express';
import { LoadingService } from './loading.service';
import { ApplyLoadingOrderDto } from './dto/apply-loading-order.dto';
import { SaveLoadingDraftDto } from './dto/save-loading-draft.dto';

@ApiTags('loading')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('loading')
export class LoadingController {
  constructor(private readonly loadingService: LoadingService) {}

  @Get('tour/:tourId/optimize')
  async optimizeTour(@Param('tourId') tourId: string) {
    return this.loadingService.optimizeTour(tourId);
  }

  @Post('tour/:tourId/apply-order')
  async applyOrder(
    @Param('tourId') tourId: string,
    @Body() dto: ApplyLoadingOrderDto,
  ) {
    return this.loadingService.applyOrder(tourId, dto.shipmentIds);
  }

  @Get('tour/:tourId/draft')
  async getDraft(@Param('tourId') tourId: string) {
    return this.loadingService.getDraft(tourId);
  }

  @Post('tour/:tourId/draft')
  async saveDraft(
    @Param('tourId') tourId: string,
    @Body() dto: SaveLoadingDraftDto,
    @Request() req: any,
  ) {
    return this.loadingService.saveDraft(
      tourId,
      req?.user?.userId,
      dto.items,
    );
  }

  @Delete('tour/:tourId/draft')
  async clearDraft(@Param('tourId') tourId: string) {
    return this.loadingService.clearDraft(tourId);
  }

  @Patch('package-item/:itemId/position')
  async setItemPosition(
    @Param('itemId') itemId: string,
    @Body()
    body: {
      posXCm?: number | null;
      posYCm?: number | null;
      posZCm?: number | null;
      rotationDeg?: number | null;
    },
  ) {
    return this.loadingService.setPackageItemPosition(itemId, body);
  }

  @Post('tour/:tourId/reset-positions')
  async resetTourPositions(@Param('tourId') tourId: string) {
    return this.loadingService.resetTourPositions(tourId);
  }

  @Get('tour/:tourId/loading-plan-pdf')
  async getLoadingPlanPdf(
    @Param('tourId') tourId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.loadingService.generateLoadingPlanPdf(tourId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="loading-plan-${tourId}.pdf"`,
    );
    return res.send(pdf);
  }
}


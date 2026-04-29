import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import type { Response } from 'express';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('cmr/:tourId')
  async getCmr(@Param('tourId') tourId: string, @Res() res: Response) {
    const pdf = await this.documentsService.generateCmr(tourId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cmr-${tourId}.pdf"`,
    );
    return res.send(pdf);
  }

  @Get('tour-list/:tourId')
  async getTourList(@Param('tourId') tourId: string, @Res() res: Response) {
    const pdf = await this.documentsService.generateTourList(tourId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tour-list-${tourId}.pdf"`,
    );
    return res.send(pdf);
  }

  @Get('loading-list/:tourId')
  async getLoadingList(@Param('tourId') tourId: string, @Res() res: Response) {
    const pdf = await this.documentsService.generateLoadingList(tourId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="loading-list-${tourId}.pdf"`,
    );
    return res.send(pdf);
  }
}

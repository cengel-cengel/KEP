import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Express, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubConditionService } from './sub-condition.service';
import { CustomerTariffService } from './customer-tariff.service';
import { PartnerOnCarriageService } from './partner-on-carriage.service';
import { DailyPriceService } from './daily-price.service';
import { UpdateDailyPriceConfigDto } from './dto/update-daily-price-config.dto';
import { ShipmentPricingPreviewDto } from './dto/shipment-pricing-preview.dto';
import { DailyPricePreviewDto } from './dto/daily-price-preview.dto';
import { AssignSubConditionDto } from './dto/assign-sub-condition.dto';
import { CalculateTourCostsDto } from './dto/calculate-tour-costs.dto';

@ApiTags('pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pricing')
export class PricingController {
  constructor(
    private readonly subConditions: SubConditionService,
    private readonly customerTariffs: CustomerTariffService,
    private readonly partnerRates: PartnerOnCarriageService,
    private readonly dailyPrice: DailyPriceService,
  ) {}

  @Get('sub-conditions')
  listSubConditions(
    @Query('subcontractorId') subcontractorId?: string,
    @Query('conditionType') conditionType?: string,
  ) {
    return this.subConditions.list({ subcontractorId, conditionType });
  }

  @Post('sub-conditions')
  createSubCondition(@Body() body: Record<string, unknown>) {
    return this.subConditions.create(body as never);
  }

  @Patch('sub-conditions/:id')
  updateSubCondition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.subConditions.update(id, body as never);
  }

  @Post('tours/:id/assign-condition')
  assignCondition(
    @Param('id', ParseUUIDPipe) tourId: string,
    @Body() dto: AssignSubConditionDto,
  ) {
    return this.subConditions.assignConditionToTour(tourId, dto.conditionId);
  }

  @Post('tours/:id/calculate-costs')
  calculateTourCosts(
    @Param('id', ParseUUIDPipe) tourId: string,
    @Body() dto: CalculateTourCostsDto,
  ) {
    return this.subConditions.calculateTourCosts(tourId, {
      distanceKm: dto.distanceKm,
      meeting: dto.meeting,
      roundtrip: dto.roundtrip,
    });
  }

  @Get('customer-tariffs')
  listCustomerTariffs(@Query('customerId') customerId?: string) {
    return this.customerTariffs.list(customerId);
  }

  @Post('customer-tariffs')
  createCustomerTariff(@Body() body: Record<string, unknown>) {
    return this.customerTariffs.create(body as never);
  }

  @Patch('customer-tariffs/:id')
  updateCustomerTariff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.customerTariffs.update(id, body as never);
  }

  @Post('customer-tariffs/import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  importCustomerTariffs(@UploadedFile() file?: { buffer?: Buffer }) {
    if (!file?.buffer) {
      return { imported: 0, errors: ['Keine Datei'] };
    }
    return this.customerTariffs.importFromCsvBuffer(file.buffer);
  }

  @Get('customer-tariffs/export')
  async exportCustomerTariffs(
    @Query('customerId') customerId: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const csv = await this.customerTariffs.exportCsv(customerId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="customer-tariffs.csv"',
    );
    res.send('\uFEFF' + csv);
  }

  @Get('partner-rates')
  listPartnerRates(@Query('partnerId') partnerId?: string) {
    return this.partnerRates.list(partnerId);
  }

  @Get('partner-rates/template')
  async partnerRatesTemplate(@Res({ passthrough: false }) res: Response) {
    const buf = this.partnerRates.buildImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="partner-tarife-vorlage.xlsx"',
    );
    return res.send(buf);
  }

  @Post('partner-rates/import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'partnerId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        partnerId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  importPartnerRates(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('partnerId', ParseUUIDPipe) partnerId: string,
  ) {
    return this.partnerRates.importPartnerRates(file, partnerId);
  }

  @Post('partner-rates')
  createPartnerRate(@Body() body: Record<string, unknown>) {
    return this.partnerRates.create(body as never);
  }

  @Post('shipments/:id/calculate-revenue')
  calculateRevenue(@Param('id', ParseUUIDPipe) shipmentId: string) {
    return this.customerTariffs.calculateRevenue(shipmentId);
  }

  @Post('shipments/:id/calculate-on-carriage')
  calculateOnCarriage(@Param('id', ParseUUIDPipe) shipmentId: string) {
    return this.partnerRates.calculateOnCarriageCost(shipmentId);
  }

  @Get('shipments/:id/daily-price')
  getDailyPrice(@Param('id', ParseUUIDPipe) shipmentId: string) {
    return this.dailyPrice.calculateDailyPrice(shipmentId, true);
  }

  @Post('shipments/preview-pricing')
  previewShipmentPricing(@Body() dto: ShipmentPricingPreviewDto) {
    return this.dailyPrice.previewShipmentPricing({
      customerId: dto.customerId ?? null,
      businessPartnerId: dto.businessPartnerId ?? null,
      originZip: dto.originZip,
      originCountry: dto.originCountry,
      destZip: dto.destZip,
      destCountry: dto.destCountry,
      ldm: dto.ldm,
      weightKg: dto.weightKg,
      isHazmat: dto.isHazmat,
      stopCount: dto.stopCount,
    });
  }

  @Post('daily-price/preview')
  previewDailyPrice(@Body() dto: DailyPricePreviewDto) {
    return this.dailyPrice.previewDailyPrice({
      originCountry: dto.originCountry,
      destCountry: dto.destCountry,
      ldm: dto.ldm,
      weightKg: dto.weightKg,
      stopCount: dto.stopCount,
      relationId: dto.relationId ?? null,
    });
  }

  @Get('config')
  getPricingConfig() {
    return this.dailyPrice.listConfigs();
  }

  @Patch('config')
  patchPricingConfig(@Body() dto: UpdateDailyPriceConfigDto) {
    return this.dailyPrice.updateGlobalConfig(dto);
  }

  @Get('market-rates')
  marketRates() {
    return this.dailyPrice.marketRatesOverview();
  }
}

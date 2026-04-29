import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CostsService } from './costs.service';
import { CreateCostRateDto } from './dto/create-cost-rate.dto';
import { UpdateCostRateDto } from './dto/update-cost-rate.dto';
import { CreatePreCarriageTourDto } from './dto/create-pre-carriage-tour.dto';
import { AddShipmentToPreCarriageTourDto } from './dto/add-shipment-to-pre-carriage-tour.dto';

@ApiTags('costs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('costs')
export class CostsController {
  constructor(private readonly costsService: CostsService) {}

  @Get('rates')
  getRates() {
    return this.costsService.getRates();
  }

  @Post('rates')
  createRate(@Body() dto: CreateCostRateDto) {
    return this.costsService.createRate(dto);
  }

  @Patch('rates/:id')
  patchRate(@Param('id') id: string, @Body() dto: UpdateCostRateDto) {
    return this.costsService.updateRate(id, dto);
  }

  @Get('shipment/:id/calculate')
  calculateShipmentPreview(@Param('id') shipmentId: string) {
    return this.costsService.calculateAllCostsPreview(shipmentId);
  }

  @Post('shipment/:id/calculate')
  calculateShipmentAndSave(@Param('id') shipmentId: string) {
    return this.costsService.calculateAllCosts(shipmentId);
  }

  @Get('pre-carriage-tours')
  getPreCarriageTours() {
    return this.costsService.getPreCarriageTours();
  }

  @Post('pre-carriage-tours')
  createPreCarriageTour(@Body() dto: CreatePreCarriageTourDto, @Request() req: any) {
    return this.costsService.createPreCarriageTour(dto, req.user.userId);
  }

  @Post('pre-carriage-tours/:id/add-shipment')
  addShipmentToPreCarriageTour(
    @Param('id') tourId: string,
    @Body() dto: AddShipmentToPreCarriageTourDto,
  ) {
    return this.costsService.addShipmentToPreCarriageTour(tourId, dto.shipmentId);
  }

  @Post('pre-carriage-tours/:id/distribute')
  distributePreCarriageTour(@Param('id') tourId: string) {
    return this.costsService.distributePreCarriageTourCosts(tourId);
  }

  @Post('tour/:tourId/recalculate')
  recalculateTour(@Param('tourId') tourId: string) {
    return this.costsService.recalculateTourCosts(tourId);
  }
}


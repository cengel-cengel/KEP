import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ToursService } from './tours.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { UpdateTourDto } from './dto/update-tour.dto';
import { ListToursQueryDto } from './dto/list-tours-query.dto';
import { AddShipmentDto } from './dto/add-shipment.dto';
import { RemoveShipmentDto } from './dto/remove-shipment.dto';
import { UpdateShipmentOrderDto } from './dto/update-shipment-order.dto';

@ApiTags('tours')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tours')
export class ToursController {
  constructor(private readonly toursService: ToursService) {}

  @Get()
  async findAll(@Query() query: ListToursQueryDto) {
    return this.toursService.findAll({
      status: query.status,
      date: query.date ? new Date(query.date) : undefined,
    });
  }

  @Get('completed-archive/list')
  async completedArchive() {
    return this.toursService.findCompletedArchive();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.toursService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateTourDto) {
    return this.toursService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTourDto) {
    return this.toursService.update(id, dto);
  }

  @Get(':id/db-status')
  async getDbStatus(@Param('id') id: string) {
    return this.toursService.getDbStatus(id);
  }

  @Post(':id/dispatch')
  async dispatchTour(@Param('id') id: string) {
    return this.toursService.dispatchTour(id);
  }

  @Post(':id/release')
  async releaseTour(@Param('id') id: string) {
    return this.toursService.releaseTour(id);
  }

  @Post(':id/close')
  async closeTour(@Param('id') id: string) {
    return this.toursService.closeTour(id);
  }

  @Post(':id/complete')
  async completeTour(@Param('id') id: string) {
    return this.toursService.completeTour(id);
  }

  @Post(':id/add-shipment')
  async addShipmentToTour(
    @Param('id') tourId: string,
    @Body() dto: AddShipmentDto,
  ) {
    return this.toursService.addShipmentToTour(tourId, dto.shipmentId);
  }

  @Post(':id/remove-shipment')
  async removeShipmentFromTour(
    @Param('id') tourId: string,
    @Body() dto: RemoveShipmentDto,
  ) {
    return this.toursService.removeShipmentFromTour(tourId, dto.shipmentId);
  }

  @Patch(':id/shipment-order')
  async updateShipmentOrder(
    @Param('id') tourId: string,
    @Body() dto: UpdateShipmentOrderDto,
  ) {
    return this.toursService.updateShipmentOrder(tourId, dto.shipmentIds);
  }

  @Get(':id/documents')
  async getDocumentsForTour(@Param('id') id: string) {
    return this.toursService.getDocumentsForTour(id);
  }

  // ─── FV-1: Disposition-Layer ────────────────────────────────────────

  @Get('eligible-shipments-fv')
  async eligibleShipmentsFv(
    @Query('datum') datum?: string,
    @Query('search') search?: string,
    @Query('tourId') tourId?: string,
  ) {
    return this.toursService.eligibleShipmentsFv({ datum, search, tourId });
  }

  @Post(':id/batch-stops')
  async batchStops(
    @Param('id') tourId: string,
    @Body() dto: { adds?: string[]; removes?: string[] },
  ) {
    return this.toursService.batchStopsFv(tourId, {
      adds: dto.adds ?? [],
      removes: dto.removes ?? [],
    });
  }

  @Post(':id/recalc-km')
  async recalcKm(@Param('id') tourId: string) {
    const km = await this.toursService.optimizeFvTour(tourId);
    return { ok: km != null, geplante_km: km };
  }

  @Post(':id/optimize')
  async optimize(@Param('id') tourId: string) {
    const km = await this.toursService.optimizeFvTour(tourId);
    return { ok: km != null, geplante_km: km };
  }
}

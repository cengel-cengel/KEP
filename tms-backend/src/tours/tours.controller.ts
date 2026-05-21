import {
  Body,
  Controller,
  Get,
  Headers,
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
import { RealtimeService } from '../realtime/realtime.service';

@ApiTags('tours')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tours')
export class ToursController {
  constructor(
    private readonly toursService: ToursService,
    private readonly realtime: RealtimeService,
  ) {}

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

  // ─── FV-1: statische Route VOR @Get(':id') — Express matched
  // sonst parameterized first und wirft P2007 (uuid-Bug). ──────────
  @Get('eligible-shipments-fv')
  async eligibleShipmentsFv(
    @Query('datum') datum?: string,
    @Query('search') search?: string,
    @Query('tourId') tourId?: string,
  ) {
    return this.toursService.eligibleShipmentsFv({ datum, search, tourId });
  }

  // T-3.3 Best-Tour-Match (FV + NV pool)
  @Get('best-match')
  async bestMatch(@Query('shipment_id') shipmentId: string) {
    return this.toursService.findBestMatchForShipment(shipmentId);
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
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTourDto,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.toursService.update(id, dto);
    this.realtime.emit('tour.updated', 'tour', id, clientId);
    return r;
  }

  @Get(':id/db-status')
  async getDbStatus(@Param('id') id: string) {
    return this.toursService.getDbStatus(id);
  }

  @Post(':id/dispatch')
  async dispatchTour(
    @Param('id') id: string,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.toursService.dispatchTour(id);
    this.realtime.emit('tour.updated', 'tour', id, clientId);
    return r;
  }

  @Post(':id/release')
  async releaseTour(
    @Param('id') id: string,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.toursService.releaseTour(id);
    this.realtime.emit('tour.updated', 'tour', id, clientId);
    return r;
  }

  @Post(':id/close')
  async closeTour(
    @Param('id') id: string,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.toursService.closeTour(id);
    this.realtime.emit('tour.updated', 'tour', id, clientId);
    return r;
  }

  @Post(':id/complete')
  async completeTour(
    @Param('id') id: string,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.toursService.completeTour(id);
    this.realtime.emit('tour.updated', 'tour', id, clientId);
    return r;
  }

  @Post(':id/add-shipment')
  async addShipmentToTour(
    @Param('id') tourId: string,
    @Body() dto: AddShipmentDto,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.toursService.addShipmentToTour(tourId, dto.shipmentId);
    this.realtime.emit('shipment.assigned', 'tour', tourId, clientId);
    return r;
  }

  @Post(':id/remove-shipment')
  async removeShipmentFromTour(
    @Param('id') tourId: string,
    @Body() dto: RemoveShipmentDto,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.toursService.removeShipmentFromTour(
      tourId,
      dto.shipmentId,
    );
    this.realtime.emit('shipment.assigned', 'tour', tourId, clientId);
    return r;
  }

  @Patch(':id/shipment-order')
  async updateShipmentOrder(
    @Param('id') tourId: string,
    @Body() dto: UpdateShipmentOrderDto,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.toursService.updateShipmentOrder(
      tourId,
      dto.shipmentIds,
    );
    this.realtime.emit('shipment.assigned', 'tour', tourId, clientId);
    return r;
  }

  @Get(':id/documents')
  async getDocumentsForTour(@Param('id') id: string) {
    return this.toursService.getDocumentsForTour(id);
  }

  // ─── FV-1: Disposition-Layer ────────────────────────────────────────

  @Post(':id/batch-stops')
  async batchStops(
    @Param('id') tourId: string,
    @Body() dto: { adds?: string[]; removes?: string[] },
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.toursService.batchStopsFv(tourId, {
      adds: dto.adds ?? [],
      removes: dto.removes ?? [],
    });
    this.realtime.emit('shipment.assigned', 'tour', tourId, clientId);
    return r;
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

  // Sprint Map-Routing: nearby-shipments ≤20km um FV-Tour-Stops.
  @Get(':id/nearby-shipments')
  nearbyShipments(
    @Param('id') tourId: string,
    @Query('radius_km') radius_km?: string,
  ) {
    const r = radius_km ? Number(radius_km) : 20;
    return this.toursService.nearbyShipmentsFv(
      tourId,
      Number.isFinite(r) ? r : 20,
    );
  }

  // C-2.1 FV Sendung-Splitten — FV hat keine stops, direkte
  // tour-shipment-Relation. Body analog NV-split.
  @Post(':id/shipments/:shipmentId/split')
  async splitShipment(
    @Param('id') tourId: string,
    @Param('shipmentId') shipmentId: string,
    @Body() dto: {
      itemSplits: Array<{ itemId: string; quantity: number }>;
    },
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.toursService.splitShipmentInTour(
      tourId,
      shipmentId,
      dto.itemSplits ?? [],
    );
    this.realtime.emit('tour.updated', 'tour', tourId, clientId);
    return r;
  }
}

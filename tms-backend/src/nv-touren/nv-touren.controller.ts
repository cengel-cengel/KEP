import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { isNvPoolMode } from '../lib/poolShipments.lib';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NvTourenService } from './nv-touren.service';
import { CreateNvTourDto } from './dto/create-nv-tour.dto';
import { UpdateNvTourDto } from './dto/update-nv-tour.dto';
import {
  CreateNvTourStopDto,
  ReorderNvTourStopsDto,
  UpdateNvTourStopDto,
} from './dto/create-stop.dto';
import { RealtimeService } from '../realtime/realtime.service';

@ApiTags('nv-touren')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('nv-touren')
export class NvTourenController {
  constructor(
    private readonly svc: NvTourenService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  list(
    @Query('datum') datum?: string,
    @Query('status') status?: string | string[],
  ) {
    return this.svc.list({ datum, status });
  }

  @Get('eligible-shipments')
  eligibleShipments(
    @Query('datum') datum: string,
    @Query('nv_tour_gebiet_id') nv_tour_gebiet_id?: string,
    @Query('search') search?: string,
    @Query('mode') mode?: string,
  ) {
    const m = mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    return this.svc.eligibleShipments({
      datum,
      nv_tour_gebiet_id,
      search,
      mode: m,
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  // P0-8: NV-Beladeplan-Daten (full package_items pro shipment).
  @Get(':id/loading')
  getLoadingDetail(@Param('id') id: string) {
    return this.svc.getLoadingDetail(id);
  }

  @Post()
  create(@Body() dto: CreateNvTourDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateNvTourDto,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.svc.update(id, dto);
    this.realtime.emit('tour.updated', 'tour', id, clientId);
    return r;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/stops')
  async createStop(
    @Param('id') tourId: string,
    @Body() dto: CreateNvTourStopDto,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.svc.createStop(tourId, dto);
    this.realtime.emit('shipment.assigned', 'tour', tourId, clientId);
    return r;
  }

  @Post(':id/stops/reorder')
  async reorderStops(
    @Param('id') tourId: string,
    @Body() dto: ReorderNvTourStopsDto,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.svc.reorderStops(tourId, dto.items);
    this.realtime.emit('shipment.assigned', 'tour', tourId, clientId);
    return r;
  }

  @Patch(':id/stops/:stopId')
  async updateStop(
    @Param('id') tourId: string,
    @Param('stopId') stopId: string,
    @Body() dto: UpdateNvTourStopDto,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.svc.updateStop(stopId, dto);
    this.realtime.emit('shipment.assigned', 'tour', tourId, clientId);
    return r;
  }

  @Delete(':id/stops/:stopId')
  async removeStop(
    @Param('id') tourId: string,
    @Param('stopId') stopId: string,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.svc.removeStop(stopId);
    this.realtime.emit('shipment.assigned', 'tour', tourId, clientId);
    return r;
  }

  @Post(':id/copy-stamm-kunden')
  copyStammKunden(
    @Param('id') tourId: string,
    @Query('mode') mode?: string,
  ) {
    const m = mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    return this.svc.copyStammKunden(tourId, m);
  }

  @Post('auto-suggest')
  autoSuggest(
    @Query('datum') datum: string,
    @Query('mode') mode?: string,
  ) {
    const m = mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    return this.svc.autoSuggest(datum, m);
  }

  @Post(':id/recalc-costs')
  recalcCosts(@Param('id') tourId: string) {
    return this.svc.recalcVorlaufCosts(tourId);
  }

  @Post(':id/batch-stops')
  async batchStops(
    @Param('id') tourId: string,
    @Body()
    dto: { adds?: string[]; removes?: string[]; stop_type?: string },
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.svc.batchStops(tourId, {
      adds: dto.adds ?? [],
      removes: dto.removes ?? [],
      stop_type: dto.stop_type,
    });
    this.realtime.emit('shipment.assigned', 'tour', tourId, clientId);
    return r;
  }

  @Post(':id/recalc-km')
  async recalcKm(@Param('id') tourId: string) {
    const km = await this.svc.recalcTourKm(tourId);
    return { ok: km != null, geplante_km: km };
  }

  /**
   * A' Sprint: Geocoding-Backfill per Tour.
   * Iteriert tour.stops.shipment.{loading,delivery}_address, geocoded
   * Adressen mit lat=null. Schreibt addresses.lat/lng. Returns
   * { geocoded, skipped, failed }.
   */
  @Post(':id/geocode-stops')
  async geocodeStops(@Param('id') tourId: string) {
    return this.svc.geocodeTourStops(tourId);
  }

  // Sprint Map-Routing: nearby-shipments ≤20km um Tour-Stops.
  @Get(':id/nearby-shipments')
  nearbyShipments(
    @Param('id') tourId: string,
    @Query('radius_km') radius_km?: string,
  ) {
    const r = radius_km ? Number(radius_km) : 20;
    return this.svc.nearbyShipments(tourId, Number.isFinite(r) ? r : 20);
  }

  /**
   * Hof-Filter Stufe 1 (E2): PLZ-basierter Pool fuer NV-Touren.
   * mode REQUIRED — 400 bei fehlend oder ungueltig.
   */
  @Get(':id/pool-shipments')
  poolShipments(
    @Param('id') tourId: string,
    @Query('mode') mode?: string,
  ) {
    if (!isNvPoolMode(mode)) {
      throw new BadRequestException(
        `mode required: nv-pickup | nv-delivery (got: ${mode ?? 'missing'})`,
      );
    }
    return this.svc.poolShipmentsNv(tourId, mode);
  }

  @Get(':id/cost-components')
  costComponentsByTour(@Param('id') tourId: string) {
    return this.svc.getCostComponentsByTour(tourId);
  }

  @Get(':id/capacity')
  capacity(@Param('id') tourId: string) {
    return this.svc.getCapacity(tourId);
  }

  // T-3.2: Conflict-driven Actions
  @Post(':id/apply-action')
  async applyAction(
    @Param('id') tourId: string,
    @Body() dto: {
      action_type:
        | 'SHIFT_STOP_LATER'
        | 'SPLIT_TOUR_AT_STOP'
        | 'SWAP_DRIVER'
        | 'MOVE_STOP_TO_TOUR';
      stop_id?: string;
      new_subunternehmer_id?: string;
      target_tour_id?: string;
      shift_minutes?: number;
    },
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.svc.applyAction(tourId, dto);
    this.realtime.emit('tour.updated', 'tour', tourId, clientId);
    return r;
  }

  @Post(':id/split')
  async splitTour(
    @Param('id') tourId: string,
    @Body() dto: { from_stop_id: string },
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.svc.splitTour(tourId, dto.from_stop_id);
    this.realtime.emit('tour.updated', 'tour', tourId, clientId);
    return r;
  }

  // C-2 + C-2.1 Sendung-Splitten mit Partial-Quantity-Support.
  // body: { itemSplits: [{ itemId, quantity }] }
  //   quantity == orig.quantity → Item komplett moved
  //   quantity <  orig.quantity → Item geklont (partial-clone)
  @Post(':id/stops/:stopId/split')
  async splitShipment(
    @Param('id') tourId: string,
    @Param('stopId') stopId: string,
    @Body() dto: {
      itemSplits: Array<{ itemId: string; quantity: number }>;
    },
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.svc.splitShipmentAtStop(
      tourId,
      stopId,
      dto.itemSplits ?? [],
    );
    this.realtime.emit('tour.updated', 'tour', tourId, clientId);
    return r;
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShipmentsService } from './shipments.service';
import { NvTourenService } from '../nv-touren/nv-touren.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { DispatchShipmentDto } from './dto/dispatch-shipment.dto';
import { BulkPatchShipmentsDto } from './dto/bulk-patch-shipments.dto';
import { CreatePackageItemDto, UpdatePackageItemDto } from './dto/package-item.dto';
import { ListShipmentsQueryDto } from './dto/list-shipments-query.dto';
import { ShipmentPricePreviewDto } from './dto/price-preview.dto';
import { RealtimeService } from '../realtime/realtime.service';

@ApiTags('shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shipments')
export class ShipmentsController {
  constructor(
    private readonly shipmentsService: ShipmentsService,
    private readonly nvTourenService: NvTourenService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get(':id/cost-components')
  costComponents(@Param('id') id: string) {
    return this.nvTourenService.getCostComponentsByShipment(id);
  }

  @Get()
  async findAll(@Query() query: ListShipmentsQueryDto) {
    return this.shipmentsService.findAll({
      status: query.status,
      customerId: query.customerId,
      loadingDateFrom: query.loadingDateFrom
        ? new Date(query.loadingDateFrom)
        : undefined,
      loadingDateTo: query.loadingDateTo
        ? new Date(query.loadingDateTo)
        : undefined,
      tourId: query.tourId === 'null' ? null : query.tourId || undefined,
      transportType: query.transportType,
      search: query.search,
      plz: query.plz,
    });
  }

  @Get('map')
  async getMap(@Query() query: ListShipmentsQueryDto) {
    return this.shipmentsService.getMap({
      status: query.status,
      transportType: query.transportType,
      search: query.search,
      tourId: query.tourId === 'null' ? null : query.tourId,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.shipmentsService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateShipmentDto, @Request() req: any) {
    return this.shipmentsService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentDto,
    @Request() req: any,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.shipmentsService.update(id, dto, req.user.userId);
    this.realtime.emit('shipment.updated', 'shipment', id, clientId);
    return r;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.shipmentsService.remove(id, req.user.userId);
  }

  @Patch(':id/stackable')
  async setStackable(
    @Param('id') id: string,
    @Body() body: { stackable: boolean },
  ) {
    return this.shipmentsService.setStackable(id, !!body.stackable);
  }

  @Post('bulk-patch')
  async bulkPatch(@Body() dto: BulkPatchShipmentsDto, @Request() req: any) {
    return this.shipmentsService.bulkPatch(dto.ids, dto.patch, req.user.userId);
  }

  @Post(':id/dispatch')
  async dispatch(
    @Param('id') id: string,
    @Body() dto: DispatchShipmentDto,
    @Request() req: any,
  ) {
    return this.shipmentsService.dispatch(id, dto, req.user.userId);
  }

  @Get('price-preview')
  async pricePreview(@Query() query: ShipmentPricePreviewDto) {
    return this.shipmentsService.previewPrice(query);
  }
}

@ApiTags('shipment-package-items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shipment-package-items')
export class ShipmentPackageItemsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post()
  async create(@Body() dto: CreatePackageItemDto) {
    return this.shipmentsService.createPackageItem(dto);
  }

  @Patch(':itemId')
  async update(
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePackageItemDto,
  ) {
    return this.shipmentsService.updatePackageItem(itemId, dto);
  }

  @Delete(':itemId')
  async remove(@Param('itemId') itemId: string) {
    return this.shipmentsService.deletePackageItem(itemId);
  }
}

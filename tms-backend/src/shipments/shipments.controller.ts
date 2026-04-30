import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { DispatchShipmentDto } from './dto/dispatch-shipment.dto';
import { ListShipmentsQueryDto } from './dto/list-shipments-query.dto';
import { ShipmentPricePreviewDto } from './dto/price-preview.dto';

@ApiTags('shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

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
  ) {
    return this.shipmentsService.update(id, dto, req.user.userId);
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

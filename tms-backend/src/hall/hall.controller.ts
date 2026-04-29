import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HallService } from './hall.service';
import { PlaceShipmentDto } from './dto/place-shipment.dto';
import { RemoveShipmentDto } from './dto/remove-shipment.dto';
import { MoveShipmentDto } from './dto/move-shipment.dto';
import { CompleteHallCheckDto } from './dto/complete-hall-check.dto';

@ApiTags('hall')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('hall')
export class HallController {
  constructor(private readonly hallService: HallService) {}

  @Get('locations')
  getLocations() {
    return this.hallService.getLocations();
  }

  @Get('stock')
  getStock() {
    return this.hallService.getStock();
  }

  @Get('stock/tour/:tourId')
  getStockForTour(@Param('tourId') tourId: string) {
    return this.hallService.getStockForTour(tourId);
  }

  @Post('place')
  place(@Body() dto: PlaceShipmentDto, @Request() req: any) {
    return this.hallService.placeShipment(
      dto.shipmentId,
      dto.locationCode,
      req.user.userId,
    );
  }

  @Post('remove')
  remove(@Body() dto: RemoveShipmentDto, @Request() req: any) {
    return this.hallService.removeShipment(dto.shipmentId, req.user.userId);
  }

  @Post('move')
  move(@Body() dto: MoveShipmentDto, @Request() req: any) {
    return this.hallService.moveShipment(
      dto.shipmentId,
      dto.toLocationCode,
      req.user.userId,
    );
  }

  @Get('movements')
  getMovements(@Query('date') date?: string) {
    return this.hallService.getMovements(date ? new Date(date) : undefined);
  }

  @Get('alerts')
  getAlerts() {
    return this.hallService.getAlerts();
  }

  @Get('check')
  getCheck() {
    return this.hallService.getCurrentCheck();
  }

  @Post('check/start')
  startCheck(@Request() req: any) {
    return this.hallService.startHallCheck(req.user.userId);
  }

  @Post('check/complete')
  @HttpCode(200)
  completeCheck(@Body() dto: CompleteHallCheckDto, @Request() req: any) {
    return this.hallService.completeHallCheck(
      dto.checkId,
      dto.items,
      req.user.userId,
    );
  }
}

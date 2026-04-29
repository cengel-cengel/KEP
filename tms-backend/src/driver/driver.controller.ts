import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DriverService } from './driver.service';
import { DriverAuthGuard } from './driver-auth.guard';
import { DeliverShipmentDto } from './dto/deliver-shipment.dto';
import { ReportProblemDto } from './dto/report-problem.dto';
import { DriverPinAuthDto, DriverTokenAuthDto } from './dto/driver-auth.dto';

@ApiTags('driver')
@Controller('driver')
export class DriverController {
  constructor(private readonly driver: DriverService) {}

  @Post('auth/token')
  async authToken(@Body() body: DriverTokenAuthDto) {
    return this.driver.loginWithToken(body.token);
  }

  @Post('auth/pin')
  async authPin(@Body() body: DriverPinAuthDto) {
    return this.driver.loginWithPin(body.pin);
  }

  @Get('tour')
  @UseGuards(DriverAuthGuard)
  async getTour(@Req() req: Request & { driverTourId: string }) {
    return this.driver.getTourForDriver(req.driverTourId);
  }

  @Post('deliver/:shipmentId')
  @UseGuards(DriverAuthGuard)
  async deliver(
    @Req() req: Request & { driverTourId: string },
    @Param('shipmentId') shipmentId: string,
    @Body() dto: DeliverShipmentDto,
  ) {
    return this.driver.deliverShipment(req.driverTourId, shipmentId, dto);
  }

  @Post('problem/:shipmentId')
  @UseGuards(DriverAuthGuard)
  async problem(
    @Req() req: Request & { driverTourId: string },
    @Param('shipmentId') shipmentId: string,
    @Body() dto: ReportProblemDto,
  ) {
    return this.driver.reportProblem(req.driverTourId, shipmentId, dto);
  }

  @Post('complete')
  @UseGuards(DriverAuthGuard)
  async complete(@Req() req: Request & { driverTourId: string }) {
    return this.driver.completeTour(req.driverTourId);
  }
}

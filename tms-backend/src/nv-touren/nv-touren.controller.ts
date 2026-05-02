import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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

@ApiTags('nv-touren')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('nv-touren')
export class NvTourenController {
  constructor(private readonly svc: NvTourenService) {}

  @Get()
  list(@Query('datum') datum?: string, @Query('status') status?: string) {
    return this.svc.list({ datum, status });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateNvTourDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNvTourDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/stops')
  createStop(@Param('id') tourId: string, @Body() dto: CreateNvTourStopDto) {
    return this.svc.createStop(tourId, dto);
  }

  @Post(':id/stops/reorder')
  reorderStops(
    @Param('id') tourId: string,
    @Body() dto: ReorderNvTourStopsDto,
  ) {
    return this.svc.reorderStops(tourId, dto.items);
  }

  @Patch(':id/stops/:stopId')
  updateStop(
    @Param('id') _tourId: string,
    @Param('stopId') stopId: string,
    @Body() dto: UpdateNvTourStopDto,
  ) {
    return this.svc.updateStop(stopId, dto);
  }

  @Delete(':id/stops/:stopId')
  removeStop(@Param('id') _tourId: string, @Param('stopId') stopId: string) {
    return this.svc.removeStop(stopId);
  }

  @Post(':id/copy-stamm-kunden')
  copyStammKunden(@Param('id') tourId: string) {
    return this.svc.copyStammKunden(tourId);
  }
}

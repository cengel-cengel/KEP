import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NvStammTourenService } from './nv-stamm-touren.service';
import { CreateNvStammTourDto } from './dto/create-nv-stamm-tour.dto';
import { UpdateNvStammTourDto } from './dto/update-nv-stamm-tour.dto';

@ApiTags('nv-stamm-touren')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NvStammTourenController {
  constructor(private readonly svc: NvStammTourenService) {}

  @Get('nv-stamm-touren')
  list(@Query('nv_tour_gebiet_id') tourGebietId?: string) {
    return this.svc.list(tourGebietId);
  }

  @Get('nv-stamm-touren/:id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getOne(id);
  }

  @Post('nv-stamm-touren')
  create(@Body() dto: CreateNvStammTourDto) {
    return this.svc.create(dto);
  }

  @Patch('nv-stamm-touren/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNvStammTourDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete('nv-stamm-touren/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(id);
  }

  @Get('nv-tour-gebiete/:id/stamm-touren')
  byTourGebiet(@Param('id', ParseUUIDPipe) tourGebietId: string) {
    return this.svc.list(tourGebietId);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NvGebieteService } from './nv-gebiete.service';
import { UpdateNvGebietDto } from './dto/update-nv-gebiet.dto';
import { UpdateNvTourGebietDto } from './dto/update-nv-tour-gebiet.dto';

@ApiTags('nv-gebiete')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NvGebieteController {
  constructor(private readonly svc: NvGebieteService) {}

  @Get('nv-gebiete')
  list() {
    return this.svc.listGebiete();
  }

  @Get('nv-gebiete/:id')
  getOne(@Param('id') id: string) {
    return this.svc.getGebiet(id);
  }

  @Patch('nv-gebiete/:id')
  update(@Param('id') id: string, @Body() dto: UpdateNvGebietDto) {
    return this.svc.updateGebiet(id, dto);
  }

  @Get('nv-tour-gebiete')
  listTour(@Query('nv_gebiet_id') gebietId?: string) {
    return this.svc.listTourGebiete(gebietId);
  }

  @Get('nv-tour-gebiete/:id')
  getOneTour(@Param('id') id: string) {
    return this.svc.getTourGebiet(id);
  }

  @Patch('nv-tour-gebiete/:id')
  updateTour(@Param('id') id: string, @Body() dto: UpdateNvTourGebietDto) {
    return this.svc.updateTourGebiet(id, dto);
  }
}

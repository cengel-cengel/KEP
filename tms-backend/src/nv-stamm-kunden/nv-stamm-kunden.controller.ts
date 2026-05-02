import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NvStammKundenService } from './nv-stamm-kunden.service';
import { CreateNvStammKundeDto } from './dto/create-nv-stamm-kunde.dto';
import {
  ReorderNvStammKundenDto,
  UpdateNvStammKundeDto,
} from './dto/update-nv-stamm-kunde.dto';

@ApiTags('nv-stamm-kunden')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NvStammKundenController {
  constructor(private readonly svc: NvStammKundenService) {}

  @Get('nv-stamm-touren/:id/kunden')
  byTour(@Param('id') tourId: string) {
    return this.svc.listByTour(tourId);
  }

  @Post('nv-stamm-kunden')
  create(@Body() dto: CreateNvStammKundeDto) {
    return this.svc.create(dto);
  }

  @Post('nv-stamm-kunden/reorder')
  reorder(@Body() dto: ReorderNvStammKundenDto) {
    return this.svc.reorder(dto.items);
  }

  @Patch('nv-stamm-kunden/:id')
  update(@Param('id') id: string, @Body() dto: UpdateNvStammKundeDto) {
    return this.svc.update(id, dto);
  }

  @Delete('nv-stamm-kunden/:id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}

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
import { NvSubunternehmerService } from './nv-subunternehmer.service';
import { CreateNvSubunternehmerDto } from './dto/create-nv-subunternehmer.dto';
import {
  BulkAktivDto,
  UpdateNvSubunternehmerDto,
} from './dto/update-nv-subunternehmer.dto';

@ApiTags('nv-subunternehmer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('nv-subunternehmer')
export class NvSubunternehmerController {
  constructor(private readonly svc: NvSubunternehmerService) {}

  @Get()
  list(@Query('nv_tour_gebiet_id') tourGebietId?: string) {
    return this.svc.list(tourGebietId);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateNvSubunternehmerDto) {
    return this.svc.create(dto);
  }

  @Patch('bulk-aktiv')
  bulkAktiv(@Body() dto: BulkAktivDto) {
    return this.svc.bulkSetAktiv(dto.ids, dto.aktiv);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNvSubunternehmerDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}

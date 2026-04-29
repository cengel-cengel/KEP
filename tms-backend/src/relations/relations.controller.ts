import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RelationsService } from './relations.service';
import { CreateRelationDto } from './dto/create-relation.dto';
import { UpdateRelationDto } from './dto/update-relation.dto';

@ApiTags('relations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('relations')
export class RelationsController {
  constructor(private readonly relationsService: RelationsService) {}

  @Get()
  async findAll() {
    return this.relationsService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateRelationDto) {
    return this.relationsService.create(dto);
  }

  @Get('assign')
  async assign(
    @Query('zipTo') zipTo: string,
    @Query('countryTo') countryTo: string,
  ) {
    return this.relationsService.autoAssignRelation({ zipTo, countryTo });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateRelationDto) {
    return this.relationsService.update(id, dto);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SubcontractorsService } from './subcontractors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSubcontractorDto } from './dto/create-subcontractor.dto';
import { UpdateSubcontractorDto } from './dto/update-subcontractor.dto';

@ApiTags('subcontractors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subcontractors')
export class SubcontractorsController {
  constructor(private readonly subcontractorsService: SubcontractorsService) {}

  @Get()
  async findAll(@Query('search') search?: string) {
    return this.subcontractorsService.findAll(search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.subcontractorsService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateSubcontractorDto, @Request() req: any) {
    return this.subcontractorsService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSubcontractorDto) {
    return this.subcontractorsService.update(id, dto);
  }

  // Sprint D Umkreissuche (FV-Analog zu NV).
  @Post('geocode-all')
  geocodeAll() {
    return this.subcontractorsService.geocodeAll();
  }

  @Get('search/radius')
  searchRadius(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius_km') radius_km: string,
  ) {
    return this.subcontractorsService.searchByRadius(
      Number(lat),
      Number(lng),
      Number(radius_km),
    );
  }
}

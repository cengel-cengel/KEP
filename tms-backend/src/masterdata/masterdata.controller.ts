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
import { MasterDataService } from './masterdata.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { CreatePartnerLocationDto } from './dto/create-partner-location.dto';
import { CreatePartnerContactDto } from './dto/create-partner-contact.dto';
import { UpdatePartnerLocationDto } from './dto/update-partner-location.dto';

@ApiTags('masterdata')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('masterdata')
export class MasterDataController {
  constructor(private readonly masterdata: MasterDataService) {}

  @Get('partners')
  async findPartners(
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.masterdata.findAllPartners(type, search);
  }

  @Get('partners/:id')
  async findPartnerById(@Param('id') id: string) {
    return this.masterdata.findPartnerById(id);
  }

  @Post('partners')
  async createPartner(@Body() dto: CreatePartnerDto) {
    return this.masterdata.createPartner(dto);
  }

  @Patch('partners/:id')
  async updatePartner(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.masterdata.updatePartner(id, dto);
  }

  @Get('partners/:id/locations')
  async getPartnerLocations(@Param('id') partnerId: string) {
    return this.masterdata.getLocations(partnerId);
  }

  @Post('partners/:id/locations')
  async createPartnerLocation(
    @Param('id') partnerId: string,
    @Body() dto: CreatePartnerLocationDto,
  ) {
    return this.masterdata.createLocation(partnerId, dto);
  }

  @Patch('partners/:id/locations/:locationId')
  async updatePartnerLocation(
    @Param('id') partnerId: string,
    @Param('locationId') locationId: string,
    @Body() dto: UpdatePartnerLocationDto,
  ) {
    return this.masterdata.updateLocation(partnerId, locationId, dto);
  }

  @Delete('partners/:id/locations/:locationId')
  async deletePartnerLocation(
    @Param('id') partnerId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.masterdata.deleteLocation(partnerId, locationId);
  }

  @Get('locations/by-key/:key')
  async findLocationByKey(@Param('key') key: string) {
    return this.masterdata.findLocationByKey(key);
  }

  @Get('partners/:id/contacts')
  async getPartnerContacts(@Param('id') partnerId: string) {
    return this.masterdata.getContacts(partnerId);
  }

  @Post('partners/:id/contacts')
  async createPartnerContact(
    @Param('id') partnerId: string,
    @Body() dto: CreatePartnerContactDto,
  ) {
    return this.masterdata.createContact(partnerId, dto);
  }

  @Get('corporate-groups')
  async getCorporateGroups() {
    return this.masterdata.getCorporateGroups();
  }
}

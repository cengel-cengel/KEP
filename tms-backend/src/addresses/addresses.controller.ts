import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  async findByCustomer(@Query('customerId') customerId?: string) {
    return this.addressesService.findByCustomer(customerId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.addressesService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateAddressDto) {
    return this.addressesService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.addressesService.update(id, dto);
  }
}

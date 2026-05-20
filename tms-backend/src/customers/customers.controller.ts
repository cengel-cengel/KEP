import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  Post,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { RealtimeService } from '../realtime/realtime.service';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  async findAll(@Query('search') search?: string) {
    return this.customersService.findAll(search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateCustomerDto, @Request() req: any) {
    return this.customersService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Headers('x-client-id') clientId?: string,
  ) {
    const r = await this.customersService.update(id, dto);
    // PERF-1.2: Customer-Update propagiert auf alle abhängigen
    // Shipments — emit shipment.updated pro Shipment-ID
    // (FE-Cache invalidiert detail + best-match + eligibles).
    const shipmentIds =
      await this.customersService.getShipmentIdsForCustomer(id);
    for (const sid of shipmentIds) {
      this.realtime.emit('shipment.updated', 'shipment', sid, clientId);
    }
    return r;
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConditionsService } from './conditions.service';
import { CreateConditionDto } from './dto/create-condition.dto';
import { ConditionPricePreviewDto } from './dto/price-preview.dto';

@ApiTags('conditions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conditions')
export class ConditionsController {
  constructor(private readonly conditionsService: ConditionsService) {}

  @Get()
  async findByCustomer(@Query('customerId') customerId: string) {
    return this.conditionsService.findByCustomer(customerId);
  }

  @Get('price-preview')
  async pricePreview(@Query() query: ConditionPricePreviewDto) {
    return this.conditionsService.previewPrice({
      ...query,
      date: new Date(query.date),
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.conditionsService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateConditionDto, @Request() req: any) {
    return this.conditionsService.create(dto, req.user.userId);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { RoutingService } from './routing.service';
import { CreateRoutingRuleDto } from './dto/create-routing-rule.dto';
import { UpdateRoutingRuleDto } from './dto/update-routing-rule.dto';
import { ListRoutingRulesQueryDto } from './dto/list-routing-rules-query.dto';
import { TestRoutingQueryDto } from './dto/test-routing-query.dto';
import { AutoRouteShipmentDto } from './dto/auto-route-shipment.dto';

@ApiTags('routing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('routing')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Get('rules')
  async findAllRules(@Query() query: ListRoutingRulesQueryDto) {
    return this.routing.findAllRules({
      direction: query.direction,
      country: query.country,
      deliveryType: query.type,
    });
  }

  @Get('rules/:id')
  async findOneRule(@Param('id') id: string) {
    return this.routing.findRuleById(id);
  }

  @Post('rules')
  async createRule(@Body() dto: CreateRoutingRuleDto) {
    return this.routing.createRule(dto);
  }

  @Patch('rules/:id')
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateRoutingRuleDto,
  ) {
    return this.routing.updateRule(id, dto);
  }

  @Delete('rules/:id')
  async deleteRule(@Param('id') id: string) {
    return this.routing.deleteRule(id);
  }

  @Get('test')
  async testRouting(@Query() query: TestRoutingQueryDto) {
    return this.routing.testRouting(query.zip, query.country, query.direction ?? 'OUTBOUND');
  }

  @Post('shipment/:id/auto-route')
  async autoRouteShipment(
    @Param('id') id: string,
    @Body() _dto: AutoRouteShipmentDto,
    @Request() req: any,
  ) {
    const userId = req?.user?.userId;
    if (!userId) {
      // Routing-Hallenplatz braucht einen Nutzer für Audit/Movement.
      // Falls Auth fehlt, blocken wir sauber.
      throw new Error('userId fehlt (JWT)');
    }
    return this.routing.autoRouteShipment(id, userId);
  }
}


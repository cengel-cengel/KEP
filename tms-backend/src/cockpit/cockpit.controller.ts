import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CockpitService } from './cockpit.service';

@ApiTags('cockpit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cockpit')
export class CockpitController {
  constructor(private readonly cockpitService: CockpitService) {}

  @Get('kpis')
  getKpis() {
    return this.cockpitService.getDashboardKpis();
  }

  @Get('customer-ranking')
  getCustomerRanking(@Query('monthsBack') monthsBack?: string) {
    const months = monthsBack ? parseInt(monthsBack, 10) : 1;
    return this.cockpitService.getCustomerRanking(
      Number.isNaN(months) ? 1 : months,
    );
  }

  @Get('db-trend')
  getDbTrend(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.cockpitService.getDbTrend(Number.isNaN(d) ? 30 : d);
  }

  @Get('open-tasks')
  getOpenTasks() {
    return this.cockpitService.getOpenTasks();
  }
}

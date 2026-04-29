import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShipmentsPageVisibleColumnsDto } from './dto/shipments-page-visible-columns.dto';
import { ShipmentsPageColumnWidthsDto } from './dto/shipments-page-column-widths.dto';
import { UserPreferencesService } from './user-preferences.service';

@ApiTags('user-preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user-preferences')
export class UserPreferencesController {
  constructor(private readonly service: UserPreferencesService) {}

  @Get('shipments-page-visible-columns')
  async getShipmentsPageVisibleColumns(@Request() req: any) {
    return { columns: await this.service.getShipmentsPageVisibleColumns(req.user.userId) };
  }

  @Put('shipments-page-visible-columns')
  async upsertShipmentsPageVisibleColumns(
    @Request() req: any,
    @Body() dto: ShipmentsPageVisibleColumnsDto,
  ) {
    const columns = await this.service.upsertShipmentsPageVisibleColumns(req.user.userId, dto);
    return { columns };
  }

  @Get('shipments-page-column-widths')
  async getShipmentsPageColumnWidths(@Request() req: any) {
    return {
      columnWidths: await this.service.getShipmentsPageColumnWidths(req.user.userId),
    };
  }

  @Put('shipments-page-column-widths')
  async upsertShipmentsPageColumnWidths(
    @Request() req: any,
    @Body() dto: ShipmentsPageColumnWidthsDto,
  ) {
    const columnWidths = await this.service.upsertShipmentsPageColumnWidths(req.user.userId, dto);
    return { columnWidths };
  }
}


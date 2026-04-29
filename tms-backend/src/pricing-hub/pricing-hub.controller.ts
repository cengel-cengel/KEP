import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PricingHubService } from './pricing-hub.service';
import type { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import type { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { CalculateShipmentPreviewDto } from './dto/calculate-shipment-preview.dto';
import type { Express } from 'express';
import { Res } from '@nestjs/common';

@ApiTags('pricing-hub')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pricing-hub')
export class PricingHubController {
  constructor(private readonly hub: PricingHubService) {}

  @Get('rules')
  getRules(
    @Query('ruleType') ruleType?: string,
    @Query('customerId') customerId?: string,
    @Query('partnerId') partnerId?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.hub.getAllRules({
      ruleType,
      customerId,
      partnerId,
      isActive: isActive != null ? isActive === 'true' : undefined,
      search,
    });
  }

  @Get('rules/:id')
  getRule(@Param('id') id: string) {
    return this.hub.getRuleById(id);
  }

  @Post('rules')
  createRule(@Body() dto: CreatePricingRuleDto, @Req() req: any) {
    return this.hub.createRule(dto, req.user.userId);
  }

  @Patch('rules/:id')
  updateRule(@Param('id') id: string, @Body() dto: UpdatePricingRuleDto, @Req() req: any) {
    return this.hub.updateRule(id, dto, req.user.userId);
  }

  @Delete('rules/:id')
  disableRule(@Param('id') id: string, @Req() req: any) {
    return this.hub.deleteRule(id, req.user.userId);
  }

  @Get('templates/:type')
  downloadTemplate(@Param('type') type: string, @Res() res: any) {
    const buf = this.hub.downloadTemplate(type);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${type}-template.xlsx"`);
    res.send(buf);
  }

  @Post('import/:type')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  importRules(
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.hub.importFromFile(file, type, req.user.userId);
  }

  @Post('import/:batchId/rollback')
  rollbackImport(@Param('batchId') batchId: string, @Req() req: any) {
    return this.hub.rollbackImport(batchId, req.user.userId);
  }

  @Get('import-history')
  importHistory() {
    return this.hub.getImportHistory();
  }

  @Post('calculate')
  calculateTest(@Body() body: any) {
    // Tester endpoint (simplified): expects { ruleId, weightKg, ldm, cbm, packageCount, ... }
    const { ruleId, ...rest } = body;
    return this.hub.calculatePrice(ruleId, rest);
  }

  @Get('calculate')
  calculateShipmentPreview(@Query() dto: CalculateShipmentPreviewDto) {
    return this.hub.calculateShipmentPricingPreview(dto);
  }

  @Post('shipments/:id/recalculate')
  recalcShipment(@Param('id') id: string) {
    return this.hub.calculateShipmentPricing(id);
  }
}

